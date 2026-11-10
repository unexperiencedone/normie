"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck, Minus, Plus, ShieldAlert, User, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { RecordTable } from "@/components/result-grid";
import { Badge, Button, CodeBlock, RiskBadge } from "@/components/ui";
import { api, type Approval } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

const KIND_LABEL: Record<Approval["kind"], string> = {
  migration: "Schema migration",
  write: "Data change",
  undo: "Undo",
  role: "Access control",
  restore: "Restore backup",
};

/** Invalidate everything that may change after a write/migration. */
export function useInvalidateProject(projectId: string) {
  const qc = useQueryClient();
  return React.useCallback(() => {
    for (const k of ["schema", "rows", "approvals", "audit", "migrations", "roles", "backups", "project", "norm-health", "norm-table"]) {
      qc.invalidateQueries({ queryKey: [k, projectId] });
    }
    qc.invalidateQueries({ queryKey: ["projects"] });
  }, [qc, projectId]);
}

export function useApprovals(projectId: string) {
  return useQuery({
    queryKey: ["approvals", projectId],
    queryFn: () => api.get<Approval[]>(`/projects/${projectId}/approvals?limit=100`),
    refetchInterval: 15_000,
  });
}

export function ApprovalCard({ approval: initial, projectId, defaultOpen = true }: { approval: Approval; projectId: string; defaultOpen?: boolean }) {
  const approvals = useApprovals(projectId);
  const a = approvals.data?.find((x) => x.approval_id === initial.approval_id) ?? initial;
  const invalidate = useInvalidateProject(projectId);
  const [showSql, setShowSql] = React.useState(defaultOpen && a.status === "pending");
  const decide = useMutation({
    mutationFn: (approve: boolean) => api.post<Approval>(`/projects/${projectId}/approvals/${a.approval_id}/decision`, { approve }),
    onSuccess: (r) => {
      invalidate();
      if (r.status === "approved") toast.success("Applied", { description: a.summary });
      else if (r.status === "failed") toast.error("Failed to apply", { description: r.result?.error?.message });
      else toast("Rejected", { description: a.summary });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pv = a.preview ?? {};
  const pending = a.status === "pending";
  return (
    <div
      className={cn(
        "animate-pop overflow-hidden rounded-xl border bg-surface shadow-card transition-[box-shadow,border-color] duration-300",
        pending ? (a.risk === "high" ? "border-danger/50 shadow-e2" : "border-warn/50 shadow-e2") : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1.5 px-3 py-2.5">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
            pending && "ring-pulse",
            pending ? (a.risk === "high" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn") : "bg-surface-3 text-muted",
          )}
        >
          <ShieldAlert className="size-3.5" />
        </span>
        <div className="min-w-0 flex-[1_1_14rem]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium">{a.summary}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
            <Badge>{a.kind === "migration" && pv.data_only ? "Data batch" : KIND_LABEL[a.kind]}</Badge>
            <RiskBadge risk={a.risk} />
            <span className="flex items-center gap-1">
              {a.source === "agent" ? <Bot className="size-3" /> : <User className="size-3" />}
              {a.source === "agent" ? "proposed by copilot" : "requested by you"} · {timeAgo(a.created_at)}
            </span>
          </div>
        </div>
        <div className="ml-auto">
          <StatusPill status={a.status} />
        </div>
      </div>

      <div className="space-y-2.5 border-t border-border px-3 py-2.5">
        <Preview a={a} />
        <button onClick={() => setShowSql((s) => !s)} className="flex items-center gap-1 text-xs text-text-2 hover:text-text">
          {showSql ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {a.kind === "restore" ? "Details" : "SQL to execute"}
        </button>
        {showSql && <CodeBlock code={a.sql_text} maxH="max-h-64" />}
        {showSql && a.down_sql && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Rollback (down) script</div>
            <CodeBlock code={a.down_sql} maxH="max-h-32" />
          </div>
        )}
        {a.status === "failed" && a.result?.error && (
          <div className="rounded-md bg-danger-soft px-2.5 py-2 text-xs text-danger">
            {a.result.error.message}
            {a.result.error.detail && <div className="opacity-80">{a.result.error.detail}</div>}
          </div>
        )}
        {a.status === "approved" && a.result?.ok && (
          <div className="flex items-center gap-1.5 text-xs text-ok">
            <CircleCheck className="size-3.5" />
            {typeof a.result.rows_affected === "number"
              ? `Committed · ${a.result.rows_affected} rows`
              : typeof a.result.version === "number"
                ? `Applied as schema v${a.result.version}`
                : "Applied"}
          </div>
        )}
      </div>

      {pending && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2/60 px-3 py-2">
          <span className="min-w-0 flex-[1_1_12rem] text-[11.5px] text-muted">
            {pv.duration_ms != null ? `Dry run OK in ${pv.duration_ms} ms · ` : ""}Nothing has changed yet.
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="ghost" loading={decide.isPending && decide.variables === false} onClick={() => decide.mutate(false)}>
              <X className="size-3.5" /> Reject
            </Button>
            <Button
              size="sm"
              variant={a.risk === "high" ? "danger" : "primary"}
              loading={decide.isPending && decide.variables === true}
              onClick={() => decide.mutate(true)}
            >
              <Check className="size-3.5" /> {a.risk === "high" ? "Approve high-risk change" : "Approve & apply"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Approval["status"] }) {
  if (status === "pending") return <Badge tone="warn">awaiting approval</Badge>;
  if (status === "approved") return <Badge tone="ok">applied</Badge>;
  if (status === "failed") return <Badge tone="danger">failed</Badge>;
  return <Badge>rejected</Badge>;
}

function Preview({ a }: { a: Approval }) {
  const pv = a.preview ?? {};
  if (a.kind === "write" || a.kind === "undo") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span>
            Will affect <b className="tabular-nums">{pv.rows_affected ?? "?"}</b> row{pv.rows_affected === 1 ? "" : "s"}
            {pv.table && (
              <>
                {" "}in <code className="font-mono text-xs">{pv.table}</code>
              </>
            )}
          </span>
          {a.kind === "write" &&
            (pv.reversible ? <Badge tone="ok">reversible (before-image captured)</Badge> : <Badge tone="warn">not automatically reversible</Badge>)}
        </div>
        {pv.notes?.map((n) => (
          <div key={n} className="flex items-center gap-1.5 text-xs text-warn">
            <CircleAlert className="size-3.5" /> {n}
          </div>
        ))}
        {!!pv.before?.length && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Rows before</div>
            <RecordTable rows={pv.before} />
          </div>
        )}
        {!pv.before?.length && !!pv.after?.length && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Rows to insert</div>
            <RecordTable rows={pv.after} />
          </div>
        )}
      </div>
    );
  }
  if (a.kind === "migration" && pv.data_only && pv.statements) {
    return (
      <div className="space-y-1.5 text-[13px]">
        <div>
          Will change <b className="tabular-nums">{pv.rows_affected ?? 0}</b> rows in {pv.statements.length} statement
          {pv.statements.length === 1 ? "" : "s"}, atomically (all or nothing).
        </div>
        <div className="grid-auto-xs gap-1.5">
          {pv.statements.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-[11.5px]">
              <span>
                {i + 1}. {s.op}
              </span>
              <span className="tabular-nums text-muted">{s.rows ?? "—"} rows</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if ((a.kind === "migration" || a.kind === "role") && pv.diff) {
    const d = pv.diff;
    const empty = !d.tables_added.length && !d.tables_removed.length && !d.tables_changed.length;
    return (
      <div className="space-y-1.5 text-[13px]">
        {d.tables_added.map((t) => (
          <DiffLine key={t} kind="add">
            create table <code className="font-mono text-xs">{t}</code>
          </DiffLine>
        ))}
        {d.tables_removed.map((t) => (
          <DiffLine key={t} kind="remove">
            drop table <code className="font-mono text-xs">{t}</code>
            {d.row_loss_risk.includes(t) && <Badge tone="danger">contains data</Badge>}
          </DiffLine>
        ))}
        {d.tables_changed.map((c) => (
          <DiffLine key={c.table} kind="change">
            alter <code className="font-mono text-xs">{c.table}</code>
            <span className="text-xs text-muted">
              {[
                c.columns_added.length && `+${c.columns_added.join(", +")}`,
                c.columns_removed.length && `−${c.columns_removed.join(", −")}`,
                c.columns_retyped.length && `retype ${c.columns_retyped.join(", ")}`,
                c.indexes_added.length && `+index ${c.indexes_added.join(", ")}`,
                c.indexes_removed.length && `−index ${c.indexes_removed.join(", ")}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </DiffLine>
        ))}
        {pv.views?.map((v) => (
          <DiffLine key={v} kind="add">
            view <code className="font-mono text-xs">{v}</code>
          </DiffLine>
        ))}
        {empty && !pv.views?.length && (
          <div className="text-xs text-muted">
            {a.kind === "role" ? "Grants and policies only (no table changes)." : "No table-level changes (constraints, data, comments or functions)."}
          </div>
        )}
        {pv.statements && (
          <div className="pt-1 text-xs text-muted">
            {pv.statements.length} statement{pv.statements.length === 1 ? "" : "s"}: {[...new Set(pv.statements.map((s) => s.op))].join(", ")}
          </div>
        )}
      </div>
    );
  }
  if (a.kind === "restore")
    return <div className="text-[13px] text-text-2">Replaces the whole database with the backup. A safety backup is taken first.</div>;
  return null;
}

function DiffLine({ kind, children }: { kind: "add" | "remove" | "change"; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded",
          kind === "add" && "bg-ok-soft text-ok",
          kind === "remove" && "bg-danger-soft text-danger",
          kind === "change" && "bg-warn-soft text-warn",
        )}
      >
        {kind === "add" ? <Plus className="size-3" /> : kind === "remove" ? <Minus className="size-3" /> : <span className="text-[10px]">~</span>}
      </span>
      {children}
    </div>
  );
}
