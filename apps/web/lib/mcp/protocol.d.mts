export type McpToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};
export type McpContext = {
  listTools: () => unknown[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult | null>;
};
export declare const PROTOCOL_VERSIONS: readonly string[];
export declare const LATEST_PROTOCOL_VERSION: string;
export declare const SERVER_INFO: Readonly<Record<string, unknown>>;
export declare const SERVER_INSTRUCTIONS: string;
export declare const JSON_RPC_ERRORS: Readonly<Record<"PARSE" | "INVALID_REQUEST" | "METHOD_NOT_FOUND" | "INVALID_PARAMS" | "INTERNAL", number>>;
export declare function negotiateProtocolVersion(requested: unknown): string;
export declare function handleMcpMessage(message: unknown, context: McpContext): Promise<Record<string, unknown> | null>;
export declare function handleMcpPayload(payload: unknown, context: McpContext): Promise<Record<string, unknown> | Record<string, unknown>[] | null>;
export declare function parseErrorResponse(): Record<string, unknown>;
