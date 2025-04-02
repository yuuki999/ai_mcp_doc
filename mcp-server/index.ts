#!/usr/bin/env node
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

// NextJSルール検索用のスキーマ定義
const NextJSRuleSchema = z.object({
  query: z.string().optional().describe("検索クエリ（オプション）"),
  category: z.string().optional().describe("カテゴリ（例: クライアント・サーバーコンポーネント, データフェッチ, サーバーアクション）"),
});

// ツールリスト取得ハンドラー
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "nextjs-rule",
        description: 'NextJSの開発ルールに関する情報を提供する。例: nextjs-rule {"query": "use client"} または nextjs-rule {"category": "データフェッチ"} または nextjs-rule {"fullContent": true}',
        inputSchema: zodToJsonSchema(NextJSRuleSchema),
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
      case "nextjs-rule": {
        const args = NextJSRuleSchema.parse(request.params.arguments);
        const query = args.query;
        const category = args.category;
        
        // ルールファイルを読み込む
        const rulesFilePath = "/Users/yuuki/projects/itoi/ai_doc/rules/frontend/nextjs/rule.md";
        const rulesContent = await readRulesFile(rulesFilePath);
        
        if (!rulesContent) {
          return {
            content: [
              {
                type: "text",
                text: "NextJSルールファイルの読み込みに失敗しました",
              },
            ],
          };
        }
        
        // ルール情報を抽出
        let result = "";
        
        if (query) {
          // クエリによる検索
          const lines = rulesContent.split('\n');
          const matchingLines: string[] = [];
          let inMatchingSection = false;
          let sectionTitle = "";
          let sectionContent: string[] = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 新しいセクションの開始を検出
            if (line && line.startsWith('  ') && !line.startsWith('    ') && line.includes(':')) {
              // 前のセクションを処理
              if (inMatchingSection && sectionContent.length > 0) {
                matchingLines.push(`## ${sectionTitle}\n${sectionContent.join('\n')}`);
              }
              
              sectionTitle = line.trim();
              sectionContent = [];
              inMatchingSection = line.toLowerCase().includes(query.toLowerCase());
            } 
            // サブセクションの開始を検出
            else if (line && line.startsWith('    ') && !line.startsWith('      ') && line.includes(':')) {
              // 前のサブセクションを処理
              if (inMatchingSection && sectionContent.length > 0) {
                matchingLines.push(`## ${sectionTitle}\n${sectionContent.join('\n')}`);
              }
              
              sectionTitle = line.trim();
              sectionContent = [];
              inMatchingSection = line.toLowerCase().includes(query.toLowerCase());
            }
            // 現在のセクション/サブセクションに行を追加
            else if (line && (inMatchingSection || line.toLowerCase().includes(query.toLowerCase()))) {
              if (!inMatchingSection && line.toLowerCase().includes(query.toLowerCase())) {
                // 新しいマッチを見つけた場合
                inMatchingSection = true;
                
                // セクションタイトルを見つける
                let j = i;
                while (j >= 0 && !sectionTitle) {
                  const currentLine = lines[j];
                  if (currentLine && ((currentLine.startsWith('  ') && !currentLine.startsWith('    ')) || 
                      (currentLine.startsWith('    ') && !currentLine.startsWith('      ')))) {
                    sectionTitle = currentLine.trim();
                  }
                  j--;
                }
                
                if (!sectionTitle) {
                  sectionTitle = "関連ルール";
                }
                
                sectionContent = [];
              }
              
              sectionContent.push(line);
            }
          }
          
          // 最後のセクションを処理
          if (inMatchingSection && sectionContent.length > 0) {
            matchingLines.push(`## ${sectionTitle}\n${sectionContent.join('\n')}`);
          }
          
          if (matchingLines.length > 0) {
            result = `# "${query}" に関するNextJSルール:\n\n${matchingLines.join('\n\n')}`;
          } else {
            result = `"${query}" に関する具体的なルールは見つかりませんでした。`;
          }
        } else if (category) {
          // カテゴリによる検索
          const lines = rulesContent.split('\n');
          const matchingLines: string[] = [];
          let inMatchingCategory = false;
          let categoryContent: string[] = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // カテゴリの開始を検出
            if (line && line.startsWith('  ') && !line.startsWith('    ') && line.includes(':')) {
              // 前のカテゴリを処理
              if (inMatchingCategory && categoryContent.length > 0) {
                matchingLines.push(categoryContent.join('\n'));
              }
              
              categoryContent = [line];
              inMatchingCategory = line.toLowerCase().includes(category.toLowerCase());
            } 
            // 現在のカテゴリに行を追加
            else if (line && (inMatchingCategory || (line.startsWith('    ') && !inMatchingCategory && line.toLowerCase().includes(category.toLowerCase())))) {
              if (!inMatchingCategory && line.toLowerCase().includes(category.toLowerCase())) {
                // カテゴリタイトルを見つける
                let j = i;
                while (j >= 0) {
                  const currentLine = lines[j];
                  if (currentLine && currentLine.startsWith('  ') && !currentLine.startsWith('    ')) {
                    categoryContent = [currentLine];
                    inMatchingCategory = true;
                    break;
                  }
                  j--;
                }
              }
              
              categoryContent.push(line);
            }
          }
          
          // 最後のカテゴリを処理
          if (inMatchingCategory && categoryContent.length > 0) {
            matchingLines.push(categoryContent.join('\n'));
          }
          
          if (matchingLines.length > 0) {
            result = `# "${category}" カテゴリのNextJSルール:\n\n${matchingLines.join('\n\n')}`;
          } else {
            result = `"${category}" カテゴリのルールは見つかりませんでした。`;
          }
        } else if (request.params.arguments && Object.keys(request.params.arguments).includes('fullContent')) {
          // fullContentパラメータが指定されている場合は、ルールファイルの全文を返す
          result = `# NextJS開発ルール全文:\n\n${rulesContent}`;
        } else {
          // クエリもカテゴリも指定されていない場合は、利用可能なカテゴリの一覧を表示
          const categories: string[] = [];
          const lines = rulesContent.split('\n');
          
          for (const line of lines) {
            if (line && line.startsWith('  ') && !line.startsWith('    ') && line.includes(':')) {
              categories.push(line.trim().replace(':', ''));
            }
          }
          
          result = `# NextJSルールの利用可能なカテゴリ:\n\n${categories.join('\n')}\n\n特定のカテゴリのルールを表示するには: nextjs-rule {"category": "カテゴリ名"}\n特定のキーワードで検索するには: nextjs-rule {"query": "検索ワード"}\nルールファイルの全文を取得するには: nextjs-rule {"fullContent": true}`;
        }
        
        return {
          content: [
            {
              type: "text",
              text: result,
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
