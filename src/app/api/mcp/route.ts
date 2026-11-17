import { NextRequest } from "next/server";
import {
  MCP_PROTOCOL_VERSION,
  MCP_PUBLIC_RESOURCES,
  MCP_PUBLIC_TOOLS,
  MCP_SERVER_INFO,
  buildMcpServerCard,
  executePublicMcpTool,
  readPublicMcpResource,
} from "@/lib/mcp-public";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id",
};

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function jsonRpcResult(id: string | number | null, result: unknown) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      result,
    },
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  status = 400,
) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      error: { code, message },
    },
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}

export async function GET() {
  return Response.json(buildMcpServerCard(), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request: NextRequest) {
  let payload: JsonRpcRequest;
  try {
    payload = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Parse error: invalid JSON payload", 400);
  }

  const id = payload.id ?? null;
  const method = payload.method;
  const params = payload.params;

  if (!method || typeof method !== "string") {
    return jsonRpcError(id, -32600, "Invalid Request: missing method", 400);
  }

  switch (method) {
    case "initialize":
      return jsonRpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: MCP_SERVER_INFO,
      });

    case "notifications/initialized":
      return new Response(null, { status: 202, headers: CORS_HEADERS });

    case "ping":
      return jsonRpcResult(id, {});

    case "tools/list":
      return jsonRpcResult(id, { tools: MCP_PUBLIC_TOOLS });

    case "tools/call": {
      const toolName =
        typeof params?.name === "string" ? params.name : "";
      const toolArgs =
        params?.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : undefined;
      const result = executePublicMcpTool(toolName, toolArgs);
      if (!result) {
        return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`, 404);
      }
      return jsonRpcResult(id, result);
    }

    case "resources/list":
      return jsonRpcResult(id, { resources: MCP_PUBLIC_RESOURCES });

    case "resources/read": {
      const uri = typeof params?.uri === "string" ? params.uri : "";
      const resource = readPublicMcpResource(uri);
      if (!resource) {
        return jsonRpcError(id, -32002, `Resource not found: ${uri}`, 404);
      }
      return jsonRpcResult(id, resource);
    }

    case "prompts/list":
      return jsonRpcResult(id, { prompts: [] });

    default:
      return jsonRpcError(id, -32601, `Method not found: ${method}`, 404);
  }
}
