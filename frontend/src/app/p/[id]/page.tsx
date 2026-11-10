"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, Code2, Database, HardDrive, Inbox, Network, Server, Sparkles, Table2, User } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useAssistant } from "@/components/assistant/assistant";
import { Badge, Card, EmptyState } from "@/components/ui";
import { api, type AuditEntry } from "@/lib/api";
import { useProject, useProjectId, useSchema } from "@/lib/project";
import { formatBytes, timeAgo } from "@/lib/utils";

export default function Overview() {
  const id = useProjectId();
  const project = useProject();
  const schema = useSchema();
  const { ask } = useAssistant();
  const audit = useQuery({ queryKey: ["audit", id, false], queryFn: () => api.get<AuditEntry[]>(`/projects/${id}/audit?limit=8`) });

  const tables = schema.data?.tables.filter((t) => t.kind === "table") ?? [];
  const rows = tables.reduce((n, t) => n + t.row_estimate, 0);
  const size = schema.data?.tables.reduce((n, t) => n + t.size_bytes, 0) ?? 0;
  const p = project.data;

  const actions = [
    { label: "Design or extend the schema", prompt: "Look at my current schema and suggest what tables or columns are missing for this project. Propose the migration.", icon: Network },
    { label: "Seed realistic sample data", prompt: "Insert realistic sample data into every table (respecting foreign keys), about 10-20 rows each.", icon: Table2 },
    { label: "Check normalisation", prompt: "Analyse each table's functional dependencies and tell me its highest normal form. Fix anything below 3NF.", icon: Sparkles },
    { label: "Tune performance", prompt: "Find the slowest queries and missing indexes. Benchmark any index before recommending it.", icon: HardDrive },
  ];

  return (
    <div className="px-fluid py-fluid mx-auto max-w-[90rem] space-y-6">
      <div>
        <h1 className="animate-rise font-display text-[clamp(20px,1rem+1vw,28px)] font-semibold tracking-[-0.035em]">{p?.name}</h1>
        {p?.description && <p className="mt-1 max-w-3xl text-[13px] text-text-2">{p.description}</p>}
      </div>

      {/* 4 fixed stats: only column counts that divide 4 (2 -> 4), so a row is never left with an orphan */}
      <div className="stagger grid grid-cols-2 gap-3 @xl/main:grid-cols-4">
        <Stat icon={Table2} label="Tables" value={schema.data ? String(tables.length) : "…"} />
        <Stat icon={Database} label="Rows (est.)" value={schema.data ? rows.toLocaleString() : "…"} />
        <Stat icon={HardDrive} label="Size" value={schema.data ? formatBytes(size) : "…"} />
        <Link href={`/p/${id}/approvals`}>
          <Stat icon={Inbox} label="Awaiting approval" value={String(p?.pending_approvals ?? 0)} tone={p?.pending_approvals ? "warn" : undefined} />
        </Link>
      </div>

      {/* two columns once the content area is >= 56rem, golden-ish 1.4 : 1 split */}
      <div className="grid gap-6 @4xl/main:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section className="@container/actions">
            <h2 className="mb-2 text-[13px] font-semibold">Ask the copilot</h2>
            <div className="stagger grid gap-2 @md/actions:grid-cols-2 @4xl/actions:grid-cols-4">
              {actions.map((a) => (
                <button key={a.label} onClick={() => ask(a.prompt)}
                  className="lift group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left shadow-card">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent transition-transform duration-300 ease-spring group-hover:scale-110 group-hover:-rotate-6"><a.icon className="size-4" /></span>
                  <span className="min-w-0 text-[13px] font-medium">{a.label}</span>
                  <ArrowRight className="ml-auto size-3.5 text-muted transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold">Tables</h2>
              <Link href={`/p/${id}/schema`} className="text-xs text-accent hover:underline">View diagram →</Link>
            </div>
            <Card>
              {tables.length === 0 ? (
                <EmptyState icon={<Table2 className="size-5" />} title="No tables yet">Ask the copilot to design your schema, or write DDL in the <Link className="text-accent" href={`/p/${id}/sql`}>SQL editor</Link>.</EmptyState>
              ) : (
                <div className="divide-y divide-border">
                  {tables.map((t) => (
                    <Link key={t.name} href={`/p/${id}/tables`} className="flex items-center gap-3 px-3 py-2 text-[13px] transition-colors hover:bg-surface-2">
                      <Table2 className="size-3.5 text-muted" />
                      <span className="min-w-0 truncate font-mono">{t.name}</span>
                      <span className="hidden shrink-0 text-xs text-muted @xl/main:inline">{t.columns.length} columns</span>
                      {t.foreign_keys.length > 0 && <Badge tone="info">{t.foreign_keys.length} FK</Badge>}
                      {t.rls && <Badge tone="accent">RLS</Badge>}
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">~{t.row_estimate.toLocaleString()}<span className="hidden @2xl/main:inline"> rows · {formatBytes(t.size_bytes)}</span></span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </div>

        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Recent activity</h2>
            <Link href={`/p/${id}/history`} className="text-xs text-accent hover:underline">Full audit log →</Link>
          </div>
          <Card className="divide-y divide-border">
            {(audit.data ?? []).map((e) => {
              const Icon = e.actor === "agent" ? Bot : e.actor === "system" ? Server : User;
              return (
                <div key={e.audit_id} className="flex items-start gap-2.5 px-3 py-2">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[12.5px]">
                      <span className="font-medium">{e.action}</span>
                      {!e.ok && <Badge tone="danger">failed</Badge>}
                      <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(e.created_at)}</span>
                    </div>
                    {e.sql_text && <div className="truncate font-mono text-[11px] text-text-2">{firstStatementLine(e.sql_text)}</div>}
                  </div>
                </div>
              );
            })}
            {audit.data?.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted">No activity yet</div>}
          </Card>
          <Link href={`/p/${id}/sql`} className="lift group mt-3 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] shadow-card">
            <Code2 className="size-4 text-accent" /> Open the SQL editor <ArrowRight className="ml-auto size-3.5 text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "warn" }) {
  return (
    <Card className="lift p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-muted"><Icon className="size-3.5" /> {label}</div>
      <div className={`mt-1 font-display text-[22px] font-semibold tabular-nums tracking-[-0.03em] ${tone === "warn" ? "text-warn" : ""}`}>{value}</div>
    </Card>
  );
}

/** First meaningful line of a SQL script (skips `--` banner comments). */
function firstStatementLine(sql: string) {
  return sql.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("--")) ?? sql;
}
