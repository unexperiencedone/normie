// Streaming client for POST /projects/{id}/chat (Server-Sent Events over fetch).

export type ToolUI =
  | ({ kind: "result"; sql: string; purpose: string; algebra: string } & import("./api").QueryResult)
  | { kind: "approval"; approval: import("./api").Approval }
  | { kind: "executed"; sql: string; summary: string; rows_affected: number; audit_id: number }
  | { kind: "design"; mermaid: string; ddl: string; tables: { name: string; columns: string[]; primary_key: string[]; foreign_keys: string[] }[] }
  | { kind: "plan"; sql: string; text: string; total_cost: number; execution_ms: number | null }
  | { kind: "benchmark"; sql: string; index_ddl: string; before_ms: number; after_ms: number; speedup: number | null; before_plan: string; after_plan: string; index_used: boolean }
  | { kind: "access"; role: string; sql: string; allowed: boolean; reason: string; layer: string }
  | { kind: "normalization"; [k: string]: unknown }
  | { kind: "schema"; tables: string[] };

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "error"; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      args: Record<string, unknown>;
      status: "running" | "ok" | "error";
      ui?: ToolUI | null;
      error?: unknown;
    };

export type ChatTurn = { role: "user"; text: string } | { role: "assistant"; parts: ChatPart[]; run_id?: string };

export type ChatEvent =
  | { type: "conversation"; id: string }
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; ok: boolean; ui: ToolUI | null; error: unknown }
  | { type: "error"; message: string }
  | { type: "done" };

export async function streamChat(
  projectId: string,
  body: { message: string; conversation_id?: string | null },
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/v1/projects/${projectId}/chat`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Normie-Client": "web", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error?.message ?? msg;
    } catch {}
    onEvent({ type: "error", message: msg });
    onEvent({ type: "done" });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch {}
        }
      }
    }
  }
}

/** Apply a streamed event to the in-progress assistant turn (pure, immutable). */
export function applyEvent(parts: ChatPart[], e: ChatEvent): ChatPart[] {
  const next = parts.slice();
  const last = next[next.length - 1];
  switch (e.type) {
    case "text":
    case "thinking":
      if (last && last.type === e.type) next[next.length - 1] = { ...last, text: last.text + e.delta };
      else next.push({ type: e.type, text: e.delta });
      return next;
    case "tool_call":
      next.push({ type: "tool", id: e.id, name: e.name, args: e.args, status: "running" });
      return next;
    case "tool_result":
      return next.map((p) =>
        p.type === "tool" && p.id === e.id ? { ...p, status: e.ok ? "ok" : "error", ui: e.ui, error: e.error } : p,
      );
    case "error":
      next.push({ type: "error", text: e.message });
      return next;
    default:
      return parts;
  }
}
