"use client";

import {
  Activity,
  BrainCircuit,
  Check,
  ChevronRight,
  Database,
  FileCode2,
  Gauge,
  KeyRound,
  ListTree,
  Loader2,
  Network,
  Play,
  Save,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import * as React from "react";
import { ApprovalCard } from "@/components/approval-card";
import { CopyCsv, ResultGrid } from "@/components/result-grid";
import { Badge, CodeBlock } from "@/components/ui";
import type { ChatPart, ToolUI } from "@/lib/chat";
import { cn } from "@/lib/utils";

const TOOLS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  get_schema: { label: "Read the schema", icon: Database },
  describe_table: { label: "Inspected a table", icon: ListTree },
  run_query: { label: "Ran a query", icon: Play },
  explain_query: { label: "Explained the query plan", icon: Activity },
  propose_change: { label: "Proposed a change", icon: FileCode2 },
  design_from_er: { label: "Mapped ER model to tables", icon: Network },
  analyze_normalization: { label: "Analysed normalisation", icon: BrainCircuit },
  discover_fds: { label: "Discovered functional dependencies", icon: BrainCircuit },
  create_business_role: { label: "Designed an access role", icon: KeyRound },
  test_access: { label: "Tested role access", icon: ShieldCheck },
  slow_queries: { label: "Checked slow queries", icon: Gauge },
  benchmark_index: { label: "Benchmarked an index", icon: Gauge },
  recent_activity: { label: "Read the audit log", icon: ListTree },
  request_undo: { label: "Prepared an undo", icon: Undo2 },
  create_backup: { label: "Took a backup", icon: Save },
};

export function ToolCard({ part, projectId }: { part: Extract<ChatPart, { type: "tool" }>; projectId: string }) {
  const meta = TOOLS[part.name] ?? { label: part.name, icon: FileCode2 };
  const Icon = meta.icon;
  const ui = part.ui;
  // Approval and result cards are the point of the call: show them expanded.
  const prominent = ui?.kind === "approval" || ui?.kind === "result" || ui?.kind === "benchmark";
  const [open, setOpen] = React.useState(false);
  const sql = typeof part.args.sql === "string" ? part.args.sql : null;

  if (ui?.kind === "approval") {
    return (
      <div className="space-y-1.5">
        <ToolHeader icon={Icon} label={meta.label} status={part.status} />
        <ApprovalCard approval={ui.approval} projectId={projectId} />
      </div>
    );
  }

  return (
    <div className="animate-pop overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-text-2 hover:bg-surface-2"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", (open || prominent) && "rotate-90")} />
        <Icon className="size-3.5 shrink-0" />
        <span className="font-medium text-text">{meta.label}</span>
        <Summary part={part} />
        <span className="ml-auto">
          <StatusIcon status={part.status} />
        </span>
      </button>
      {(open || prominent) && (
        <div className="space-y-2 border-t border-border px-2.5 py-2">
          {sql && !(ui?.kind === "result") && <CodeBlock code={sql} maxH="max-h-40" />}
          {part.status === "error" && <ToolError error={part.error} />}
          {ui && <ToolBody ui={ui} />}
          {!ui && !sql && part.status !== "error" && (
            <CodeBlock code={JSON.stringify(part.args, null, 2)} maxH="max-h-40" />
          )}
        </div>
      )}
    </div>
  );
}

function ToolHeader({ icon: Icon, label, status }: { icon: React.ComponentType<{ className?: string }>; label: string; status: string }) {
  return (
    <div className="flex items-center gap-1.5 px-0.5 text-xs text-text-2">
      <Icon className="size-3.5" /> {label} <StatusIcon status={status} />
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") return <Loader2 className="size-3.5 animate-spin text-muted" />;
  if (status === "error") return <TriangleAlert className="size-3.5 text-warn" />;
  return <Check className="size-3.5 text-ok" />;
}

function Summary({ part }: { part: Extract<ChatPart, { type: "tool" }> }) {
  const ui = part.ui;
  let s = "";
  if (ui?.kind === "result") s = `${ui.row_count}${ui.truncated ? "+" : ""} rows · ${ui.duration_ms} ms`;
  else if (ui?.kind === "executed") s = `committed · ${ui.rows_affected} rows`;
  else if (ui?.kind === "design") s = `${ui.tables.length} tables`;
  else if (ui?.kind === "plan") s = ui.execution_ms != null ? `${ui.execution_ms} ms` : `cost ${ui.total_cost}`;
  else if (ui?.kind === "access") s = ui.allowed ? "allowed" : "denied";
  else if (ui?.kind === "normalization") s = String((ui as Record<string, unknown>).highest_normal_form ?? "");
  else if (typeof part.args.table === "string") s = part.args.table;
  else if (typeof part.args.role === "string") s = part.args.role;
  if (!s) return null;
  return <span className="truncate font-mono text-[11px] text-muted">{s}</span>;
}

function ToolError({ error }: { error: unknown }) {
  const e = (error ?? {}) as { message?: string; detail?: string };
  const msg = typeof error === "string" ? error : e.message ?? JSON.stringify(error);
  return (
    <div className="rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
      {msg}
      {e.detail && <div className="opacity-80">{e.detail}</div>}
      <div className="mt-0.5 opacity-70">The copilot sees this error and can correct itself.</div>
    </div>
  );
}

function ToolBody({ ui }: { ui: ToolUI }) {
  switch (ui.kind) {
    case "result":
      return (
        <div className="space-y-2">
          {ui.purpose && <div className="text-xs text-text-2">{ui.purpose}</div>}
          <CodeBlock code={ui.sql} maxH="max-h-32" />
          <div className="overflow-hidden rounded-md border border-border">
            <ResultGrid compact className="max-h-64" columns={ui.columns} rows={ui.rows.slice(0, 200)} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate font-mono text-[11px] text-muted" title={ui.algebra}>
              {ui.algebra}
            </div>
            <CopyCsv columns={ui.columns} rows={ui.rows} />
          </div>
        </div>
      );
    case "executed":
      return (
        <div className="space-y-1.5">
          <div className="text-xs text-ok">Committed automatically (low risk) · {ui.rows_affected} rows · audit #{ui.audit_id}</div>
          <CodeBlock code={ui.sql} maxH="max-h-32" />
        </div>
      );
    case "design":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {ui.tables.map((t) => (
              <Badge key={t.name} tone="info">
                {t.name} · {t.columns.length} cols
              </Badge>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-text-2">Generated DDL (textbook mapping)</summary>
            <CodeBlock className="mt-1.5" code={ui.ddl} />
          </details>
        </div>
      );
    case "plan":
      return <CodeBlock code={ui.text} />;
    case "benchmark":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="before" value={`${ui.before_ms} ms`} />
            <Stat label="after" value={`${ui.after_ms} ms`} tone="ok" />
            <Stat label="speed-up" value={ui.speedup ? `${ui.speedup}×` : "—"} tone={ui.speedup && ui.speedup > 1.2 ? "ok" : undefined} />
          </div>
          <CodeBlock code={ui.index_ddl} maxH="max-h-20" />
          <details>
            <summary className="cursor-pointer text-xs text-text-2">Plans before / after</summary>
            <CodeBlock className="mt-1.5" code={`-- before\n${ui.before_plan}\n\n-- after\n${ui.after_plan}`} />
          </details>
          <div className="text-[11px] text-muted">Measured on your real data inside a transaction that was rolled back.</div>
        </div>
      );
    case "access":
      return (
        <div className={cn("rounded-md px-2.5 py-1.5 text-xs", ui.allowed ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
          <b>{ui.allowed ? "Allowed" : "Denied"}</b> for role <code>{ui.role}</code> · {ui.reason}
          <div className="opacity-70">decided by {ui.layer === "postgres" ? "PostgreSQL privileges / RLS" : "Normie policy"}</div>
        </div>
      );
    case "normalization":
      return <NormalizationBody ui={ui as Record<string, unknown>} />;
    default:
      return null;
  }
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2 py-1.5">
      <div className="text-[10.5px] uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("font-mono text-[13px] font-medium tabular-nums", tone === "ok" && "text-ok")}>{value}</div>
    </div>
  );
}

function NormalizationBody({ ui }: { ui: Record<string, unknown> }) {
  const keys = (ui.candidate_keys as string[][]) ?? [];
  const viol = (ui.violations as { target_nf: string; reason: string }[]) ?? [];
  const d3 = ui.decomposition_3NF as { relations: string[][]; lossless: boolean; dependency_preserving: boolean } | undefined;
  const db = ui.decomposition_BCNF as { relations: string[][]; lossless: boolean; dependency_preserving: boolean } | undefined;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={ui.highest_normal_form === "BCNF" ? "ok" : "warn"}>highest: {String(ui.highest_normal_form)}</Badge>
        {keys.map((k) => (
          <Badge key={k.join()} tone="info">
            key {"{"}
            {k.join(", ")}
            {"}"}
          </Badge>
        ))}
      </div>
      {viol.slice(0, 4).map((v, i) => (
        <div key={i} className="text-warn">
          ✗ {v.target_nf}: {v.reason}
        </div>
      ))}
      {[["3NF", d3] as const, ["BCNF", db] as const].map(([n, d]) =>
        d ? (
          <div key={n}>
            <span className="font-medium">{n} decomposition:</span>{" "}
            <span className="font-mono">{d.relations.map((r) => `(${r.join(", ")})`).join("  ")}</span>{" "}
            <span className={d.lossless ? "text-ok" : "text-danger"}>{d.lossless ? "lossless" : "lossy"}</span>
            {" · "}
            <span className={d.dependency_preserving ? "text-ok" : "text-warn"}>
              {d.dependency_preserving ? "dependency-preserving" : "loses dependencies"}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}
