#!/usr/bin/env node
/**
 * Weather & Rules MCP Server - Model Context Protocol (MCP) Server Implementation
 *
 * 天気予報情報とNextJSルールを提供するMCPサーバー
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";
import * as fs from "fs/promises";
import { zodToJsonSchema } from 'zod-to-json-schema';

// 定数定義
const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-rules-app/1.0";
const VERSION = "1.0.0";

const server = new Server(
  {
    name: "weather-rules-mcp-server",
    version: VERSION,
    description: "天気予報情報とNextJSルールを提供するMCPサーバー"
  },
  {
    capabilities: {
      tools: {},
    },
  }
);


// インターフェース定義
interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
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

// アラート関連の型定義
interface AlertsResponse {
  features: AlertFeature[];
}

interface AlertFeature {
  // アラート機能の型定義（必要に応じて拡張）
  properties: {
    headline?: string;
    description?: string;
    severity?: string;
    event?: string;
    effective?: string;
    expires?: string;
    // 他の必要なプロパティ
  };
}

// アラート取得用のスキーマ定義
const GetAlertsSchema = z.object({
  state: z.string().length(2).describe("2文字の州コード (例: CA, NY)"),
});

// ランダム整数生成用のスキーマ定義
const RandomIntSchema = z.object({
  min: z.number().int().default(1).describe("最小値（デフォルト: 1）"),
  max: z.number().int().default(100).describe("最大値（デフォルト: 100）"),
});

// アラートのフォーマット関数
function formatAlert(alert: AlertFeature): string {
  const props = alert.properties;
  return [
    `イベント: ${props.event || '不明'}`,
    `重要度: ${props.severity || '不明'}`,
    `説明: ${props.description || '詳細なし'}`,
    `有効期間: ${props.effective || '不明'} から ${props.expires || '不明'} まで`,
    '---'
  ].join('\n');
}

// アラート取得関数
async function getStateAlerts(state: string) {
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
}

// ツールリスト取得ハンドラー
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get-alerts",
        description: "州の天気アラートを取得する",
        inputSchema: zodToJsonSchema(GetAlertsSchema),
      },
      {
        name: "random-int",
        description: '指定された範囲内のランダムな整数を生成する。例: random-int {"min": 5, "max": 25}',
        inputSchema: zodToJsonSchema(RandomIntSchema),
      },
      // 他のツールを追加可能
    ],
  };
});

// ツール呼び出しハンドラー
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("引数が必要です");
    }

    switch (request.params.name) {
      case "get-alerts": {
        const args = GetAlertsSchema.parse(request.params.arguments);
        return await getStateAlerts(args.state);
      }

      case "random-int": {
        const args = RandomIntSchema.parse(request.params.arguments);
        const min = args.min;
        const max = args.max;
        const randomInt = Math.floor(Math.random() * (max - min + 1)) + min;
        
        return {
          content: [
            {
              type: "text",
              text: `生成されたランダムな整数: ${randomInt}\n範囲: ${min} から ${max} まで`,
            },
          ],
        };
      }

      default:
        throw new Error(`未知のツール: ${request.params.name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`無効な入力: ${JSON.stringify(error.errors)}`);
    }

    throw error;
  }
});

/**
 * サーバーを起動する関数
 */
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server running on stdio");
}

// サーバーの実行
runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
