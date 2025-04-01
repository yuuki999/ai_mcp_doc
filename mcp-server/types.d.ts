declare module '@modelcontextprotocol/sdk' {
  export interface MCPToolCallResult {
    content?: string;
    error?: string;
  }

  export interface MCPTool {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
    handler: (params: any) => Promise<MCPToolCallResult>;
  }

  export interface MCPToolCall {
    name: string;
    parameters: Record<string, any>;
  }

  export interface MCPServerOptions {
    tools: MCPTool[];
    port?: number;
    host?: string;
  }

  export class MCPServer {
    constructor(options: MCPServerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
  }
}
