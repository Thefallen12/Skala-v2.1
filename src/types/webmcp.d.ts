import "react";

export interface WebMcpToolInputSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
    }
  >;
  required?: string[];
}

export interface WebMcpToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export interface WebMcpToolDefinition<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;
  description: string;
  inputSchema: WebMcpToolInputSchema;
  execute: (
    input: TInput,
    client?: {
      requestUserInteraction?: (callback: () => Promise<unknown>) => Promise<unknown>;
    },
  ) => Promise<WebMcpToolResult> | WebMcpToolResult;
}

export interface WebMcpModelContext {
  registerTool: <TInput extends Record<string, unknown> = Record<string, unknown>>(
    tool: WebMcpToolDefinition<TInput>,
  ) => void;
  unregisterTool?: (name: string) => void;
  provideContext?: (options: { tools: WebMcpToolDefinition[] }) => void;
  clearContext?: () => void;
}

declare global {
  interface Navigator {
    readonly modelContext?: WebMcpModelContext;
  }
}

declare module "react" {
  interface FormHTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    toolautosubmit?: boolean;
  }

  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }

  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}
