"use client";

import { useMutation } from "@tanstack/react-query";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Activity, CircleCheck, Gauge, Play, Sigma, Sparkles } from "lucide-react";
import * as React from "react";
import { ApprovalCard, useInvalidateProject } from "@/components/approval-card";
import { useAssistant } from "@/components/assistant/assistant";
import { CopyCsv, ResultGrid } from "@/components/result-grid";
import { SqlEditor } from "@/components/sql-editor";
import { Badge, Button, CodeBlock, EmptyState, ErrorBox, Kbd, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { api, type Approval, type ExplainResult, type QueryResult, type Risk } from "@/lib/api";
import { useProjectId, useSchema } from "@/lib/project";

type RunResponse =
  | ({ kind: "rows" } & QueryResult)
  | { kind: "executed"; status: "executed"; risk: Risk; result: { rows_affected: number; audit_id: number } }
  | { kind: "approval"; status: "pending_approval"; approval: Approval };

const STORE = (id: string) => `normie-sql-${id}`;
const LEGACY_STORE = (id: string) => `dbforge-sql-${id}`; // drafts saved before the rename

export default function SqlPage() {
  const id = useProjectId();
  const schema = useSchema();
  const { ask } = useAssistant();
  const invalidate = useInvalidateProject(id);
  const editorRef = React.useRef<ReactCodeMirrorRef>(null);
  const [sql, setSql] = React.useState("");
  const [tab, setTab] = React.useState("results");
  const [lastSql, setLastSql] = React.useState("");

  React.useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORE(id)) ?? localStorage.getItem(LEGACY_STORE(id));
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage (external store) after SSR
    setSql(saved ?? "-- Write SQL here. ⌘/Ctrl + Enter runs the selection or the whole buffer.\nSELECT now();\n");
  }, [id]);
  React.useEffect(() => {
    try {
      if (sql) localStorage.setItem(STORE(id), sql);
    } catch {}
  }, [id, sql]);

  const currentSql = React.useCallback(() => {
    const view = editorRef.current?.view;
    if (view) {
      const sel = view.state.selection.main;
      if (!sel.empty) return view.state.sliceDoc(sel.from, sel.to);
    }
    return sql;
  }, [sql]);

  const run = useMutation({
    mutationFn: (q: string) => api.post<RunResponse>(`/projects/${id}/sql/run`, { sql: q }),
    onSuccess: (r) => {
      setTab("results");
      if (r.kind !== "rows") invalidate();
    },
  });
  const explain = useMutation({
    mutationFn: (v: { q: string; analyze: boolean }) => api.post<ExplainResult>(`/projects/${id}/sql/explain`, { sql: v.q, analyze: v.analyze }),
    onSuccess: () => setTab("plan"),
  });

  const doRun = () => {
    const q = stripComments(currentSql());
    if (!q.trim()) return;
    setLastSql(q);
    explain.reset();
    run.mutate(q);
  };
  const doExplain = (analyze: boolean) => {
    const q = stripComments(currentSql());
    if (!q.trim()) return;
    setLastSql(q);
    explain.mutate({ q, analyze });
  };

  const res = run.data;
  const err = run.error ?? explain.error;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <Button variant="primary" size="sm" onClick={doRun} loading={run.isPending}>
          <Play className="size-3.5" /> Run <Kbd>⌘↵</Kbd>
        </Button>
        <Button size="sm" onClick={() => doExplain(false)} loading={explain.isPending && !explain.variables?.analyze}>
          <Activity className="size-3.5" /> Explain
        </Button>
        <Button size="sm" onClick={() => doExplain(true)} loading={explain.isPending && explain.variables?.analyze}>
          <Gauge className="size-3.5" /> Explain analyze
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" className="max-[420px]:hidden" onClick={() => ask(`Explain what this SQL does and how to improve it:\n\n\`\`\`sql\n${currentSql()}\n\`\`\``)}>
          <Sparkles className="size-3.5 text-accent" /> Ask copilot
        </Button>
        <span className="ml-auto hidden text-[11.5px] text-muted @4xl/main:inline">
          Reads run read-only. Writes are dry-run and may need approval.
        </span>
      </div>

      <div className="min-h-[160px] flex-[0_0_42%] overflow-hidden border-b border-border">
        <SqlEditor ref={editorRef} value={sql} onChange={setSql} onRun={doRun} schema={schema.data} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="bg-surface">
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="algebra">
            <Sigma className="size-3.5" /> Relational algebra
          </TabsTrigger>
          <TabsTrigger value="plan">Query plan</TabsTrigger>
          {res?.kind === "rows" && (
            <span className="ml-auto flex items-center gap-2 text-xs text-muted">
              <span className="tabular-nums">
                {res.row_count}
                {res.truncated ? "+" : ""} rows · {res.duration_ms} ms
              </span>
              <CopyCsv columns={res.columns} rows={res.rows} />
            </span>
          )}
        </TabsList>

        <TabsContent value="results" className="min-h-0 flex-1 overflow-auto">
          {err ? (
            <div className="space-y-2 p-4">
              <ErrorBox error={err} />
              <Button
                size="sm"
                onClick={() =>
                  ask(`This SQL failed with "${(err as Error).message}". Please fix it:\n\n\`\`\`sql\n${lastSql}\n\`\`\``)
                }
              >
                <Sparkles className="size-3.5 text-accent" /> Ask copilot to fix
              </Button>
            </div>
          ) : !res ? (
            <EmptyState title="Run a query to see results">Results, affected rows and approvals appear here.</EmptyState>
          ) : res.kind === "rows" ? (
            <>
              <ResultGrid className="h-full" columns={res.columns} rows={res.rows} />
              {res.truncated && <div className="border-t border-border px-3 py-1.5 text-xs text-warn">Result truncated to the row limit.</div>}
            </>
          ) : res.kind === "executed" ? (
            <div className="flex items-center gap-2 p-4 text-[13px] text-ok">
              <CircleCheck className="size-4" />
              Committed · {res.result.rows_affected} rows affected · <Badge tone="ok">{res.risk} risk, auto-approved</Badge>
              <span className="text-muted">audit #{res.result.audit_id} (undo from History)</span>
            </div>
          ) : (
            <div className="max-w-3xl p-4">
              <ApprovalCard approval={res.approval} projectId={id} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="algebra" className="min-h-0 flex-1 overflow-auto p-4">
          {res?.kind === "rows" && res.algebra ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-surface p-4 font-mono text-[14px] leading-relaxed break-words">{res.algebra}</div>
              <p className="text-xs text-text-2">
                σ = selection (WHERE) · π = projection (SELECT list) · ⋈ = join · γ = grouping/aggregation · ρ = rename. Generated
                deterministically from the SQL syntax tree (sqlglot), not by the LLM.
              </p>
            </div>
          ) : (
            <EmptyState title="Run a SELECT to see its relational algebra" />
          )}
        </TabsContent>

        <TabsContent value="plan" className="min-h-0 flex-1 overflow-auto p-4">
          {explain.data ? (
            <div className="space-y-2">
              <div className="flex gap-2 text-xs">
                <Badge>total cost {explain.data.total_cost}</Badge>
                {explain.data.execution_ms != null && <Badge tone="info">execution {explain.data.execution_ms} ms</Badge>}
                {explain.data.planning_ms != null && <Badge>planning {explain.data.planning_ms} ms</Badge>}
              </div>
              <CodeBlock code={explain.data.text} maxH="max-h-none" />
              <Button size="sm" variant="ghost" onClick={() => ask(`Explain this query plan and suggest optimisations:\n\n\`\`\`sql\n${lastSql}\n\`\`\`\n\n\`\`\`\n${explain.data?.text}\n\`\`\``)}>
                <Sparkles className="size-3.5 text-accent" /> Explain this plan
              </Button>
            </div>
          ) : (
            <EmptyState title="Use Explain or Explain analyze">
              Explain analyze really executes the statement (writes are rolled back) to measure timings.
            </EmptyState>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function stripComments(q: string) {
  return q
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .trim();
}
