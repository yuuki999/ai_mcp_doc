#!/usr/bin/env node
/**
 * Weather & Rules MCP Server - Model Context Protocol (MCP) Server Implementation
 *
 * 天気予報情報とNextJSルールを提供するMCPサーバー
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

// 定数定義
const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-rules-app/1.0";
const VERSION = "1.0.0";

// サーバーインスタンスの作成
const server = new McpServer({
  name: "weather-rules",
  version: VERSION,
  description: "天気予報情報とNextJSルールを提供するMCPサーバー"
});

// インターフェース定義
interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

// ユーティリティ関数
/**
 * NWS APIリクエスト用のヘルパー関数
 */
async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

/**
 * アラートデータのフォーマット関数
 */
function formatAlert(feature: AlertFeature): string {
  const props = feature.properties;
  return [
    `Event: ${props.event || "Unknown"}`,
    `Area: ${props.areaDesc || "Unknown"}`,
    `Severity: ${props.severity || "Unknown"}`,
    `Status: ${props.status || "Unknown"}`,
    `Headline: ${props.headline || "No headline"}`,
    "---",
  ].join("\n");
}

/**
 * NextJSルールファイルを読み込む関数
 */
async function readRulesFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`ファイルの読み込み中にエラーが発生しました: ${filePath}`, error);
    return null;
  }
}

// 天気アラート取得ツールの登録
server.tool(
  "get-alerts",
  "州の天気アラートを取得する",
  {
    state: z.string().length(2).describe("2文字の州コード (例: CA, NY)"),
  },
  async ({ state }) => {
    const stateCode = state.toUpperCase();
    const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
    const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

    if (!alertsData) {
      return {
        content: [
          {
            type: "text",
            text: "アラートデータの取得に失敗しました",
          },
        ],
      };
    }

    const features = alertsData.features || [];
    if (features.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `${stateCode}のアクティブなアラートはありません`,
          },
        ],
      };
    }

    const formattedAlerts = features.map(formatAlert);
    const alertsText = `${stateCode}のアクティブなアラート:\n\n${formattedAlerts.join("\n")}`;

    return {
      content: [
        {
          type: "text",
          text: alertsText,
        },
      ],
    };
  },
);

// 天気予報取得ツールの登録
server.tool(
  "get-forecast",
  "指定した位置の天気予報を取得する",
  {
    latitude: z.number().min(-90).max(90).describe("位置の緯度"),
    longitude: z.number().min(-180).max(180).describe("位置の経度"),
  },
  async ({ latitude, longitude }) => {
    // グリッドポイントデータの取得
    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

    if (!pointsData) {
      return {
        content: [
          {
            type: "text",
            text: `座標: ${latitude}, ${longitude} のグリッドポイントデータの取得に失敗しました。この位置はNWS APIでサポートされていない可能性があります（米国内の位置のみサポート）。`,
          },
        ],
      };
    }

    const forecastUrl = pointsData.properties?.forecast;
    if (!forecastUrl) {
      return {
        content: [
          {
            type: "text",
            text: "グリッドポイントデータから予報URLの取得に失敗しました",
          },
        ],
      };
    }

    // 予報データの取得
    const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
    if (!forecastData) {
      return {
        content: [
          {
            type: "text",
            text: "予報データの取得に失敗しました",
          },
        ],
      };
    }

    const periods = forecastData.properties?.periods || [];
    if (periods.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "利用可能な予報期間がありません",
          },
        ],
      };
    }

    // 予報期間のフォーマット
    const formattedForecast = periods.map((period: ForecastPeriod) =>
      [
        `${period.name || "不明"}:`,
        `気温: ${period.temperature || "不明"}°${period.temperatureUnit || "F"}`,
        `風: ${period.windSpeed || "不明"} ${period.windDirection || ""}`,
        `${period.shortForecast || "予報なし"}`,
        "---",
      ].join("\n"),
    );

    const forecastText = `${latitude}, ${longitude}の予報:\n\n${formattedForecast.join("\n")}`;

    return {
      content: [
        {
          type: "text",
          text: forecastText,
        },
      ],
    };
  },
);

// NextJSルール取得ツールの登録
server.tool(
  "get-nextjs-rules",
  "NextJS開発ルールを取得する",
  {},
  async () => {
    const rulesPath = path.resolve(process.cwd(), '../rules/nextjs/rule.md');
    const rulesContent = await readRulesFile(rulesPath);
    
    if (!rulesContent) {
      return {
        content: [
          {
            type: "text",
            text: "NextJS開発ルールファイルの読み込みに失敗しました",
          },
        ],
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: `NextJS開発ルール:

${rulesContent}`,
        },
      ],
    };
  },
);

// メイン関数
async function main() {
  try {
    console.error("Weather & Rules MCP Server を起動中...");
    
    // 標準入出力トランスポートの設定
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("Weather & Rules MCP Server が標準入出力で実行中");
    console.error("利用可能なツール: get-alerts, get-forecast, get-nextjs-rules");
    console.error("リクエスト待機中...");
  } catch (error) {
    console.error("Weather & Rules MCP Server の起動に失敗しました:", error);
    process.exit(1);
  }
}



// プロセス終了ハンドラ
process.on("SIGINT", () => {
  console.error("サーバーをシャットダウンしています...");
  process.exit(0);
});

// エラーハンドラ
process.on("uncaughtException", (error) => {
  console.error("キャッチされなかった例外:", error);
});

// サーバーの実行
main().catch((error) => {
  console.error("予期しないエラー:", error);
  process.exit(1);
});
