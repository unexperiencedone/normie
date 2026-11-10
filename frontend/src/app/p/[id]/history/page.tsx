"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, DatabaseBackup, GitCommitVertical, RotateCcw, Save, Server, Undo2, User } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ApprovalCard, useInvalidateProject } from "@/components/approval-card";
import { Badge, Button, Card, CodeBlock, Dialog, EmptyState, Input, PageHeader, Spinner, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { api, type Approval, type AuditEntry } from "@/lib/api";
import { useProjectId } from "@/lib/project";
import { cn, formatBytes, timeAgo } from "@/lib/utils";

export default function HistoryPage() {
  return (
    <div>
      <PageHeader title="History & backups" description="Append-only audit log of everything executed, schema versions, and logical backups." />
      <Tabs defaultValue="audit">
        <TabsList className="px-fluid">
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="migrations">Migrations</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>
        <TabsContent value="audit"><Audit /></TabsContent>
        <TabsContent value="migrations"><Migrations /></TabsContent>
        <TabsContent value="backups"><Backups /></TabsContent>
      </Tabs>
    </div>
  );
}

const ACTOR_ICON = { user: User, agent: Bot, system: Server };

function Audit() {
  const id = useProjectId();
  const [withQueries, setWithQueries] = React.useState(false);
  const [pending, setPending] = React.useState<Approval | null>(null);
  const invalidate = useInvalidateProject(id);
  const q = useQuery({
    queryKey: ["audit", id, withQueries],
    queryFn: () => api.get<AuditEntry[]>(`/projects/${id}/audit?limit=200&include_queries=${withQueries}`),
  });
  const undo = useMutation({
    mutationFn: (auditId: number) => api.post<{ approval: Approval }>(`/projects/${id}/audit/${auditId}/undo`),
    onSuccess: (r) => {
      invalidate();
      setPending(r.approval);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="px-fluid py-fluid max-w-[72rem]">
      <div className="mb-3 flex items-center gap-2 text-[13px] text-text-2">
        <Switch checked={withQueries} onCheckedChange={setWithQueries} /> Include read queries
      </div>
      {q.isLoading ? <Spinner /> : !q.data?.length ? <EmptyState title="Nothing logged yet" /> : (
        <Card className="divide-y divide-border">
          {q.data.map((e) => {
            const Icon = ACTOR_ICON[e.actor];
            return (
              <div key={e.audit_id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
                <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md", e.ok ? "bg-surface-3 text-text-2" : "bg-danger-soft text-danger")}>
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-[1_1_20rem]">
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                    <span className="font-medium">{e.action}</span>
                    <span className="font-mono text-[11px] text-muted">#{e.audit_id}</span>
                    {!e.ok && <Badge tone="danger">failed</Badge>}
                    {e.rows_affected != null && e.action !== "query" && <Badge>{e.rows_affected} rows</Badge>}
                    {e.duration_ms != null && <span className="text-[11px] text-muted">{e.duration_ms} ms</span>}
                    {e.undone_by && <Badge tone="info">undone by #{e.undone_by}</Badge>}
                  </div>
                  {e.sql_text && <div className="mt-1 line-clamp-2 font-mono text-[11.5px] text-text-2" title={e.sql_text}>{e.sql_text}</div>}
                  {e.error && <div className="mt-1 text-xs text-danger">{e.error}</div>}
                </div>
                <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-muted">{timeAgo(e.created_at)} · {e.actor === "agent" ? "copilot" : e.email ?? e.actor}</span>
                  {e.reversible && !e.undone_by && (
                    <Button size="sm" variant="ghost" loading={undo.isPending && undo.variables === e.audit_id} onClick={() => undo.mutate(e.audit_id)}>
                      <Undo2 className="size-3.5" /> Undo
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)} title="Confirm undo" wide description="The reverse statement was dry-run against the current data.">
        {pending && <ApprovalCard approval={pending} projectId={id} />}
      </Dialog>
    </div>
  );
}

function Migrations() {
  const id = useProjectId();
  const q = useQuery({
    queryKey: ["migrations", id],
    queryFn: () => api.get<{ version: number; summary: string; up_sql: string; down_sql: string | null; applied_at: string; email: string | null }[]>(`/projects/${id}/migrations`),
  });
  if (q.isLoading) return <Spinner className="m-6" />;
  if (!q.data?.length) return <EmptyState title="No migrations applied yet">Approved schema changes become numbered versions here.</EmptyState>;
  return (
    <div className="px-fluid py-fluid max-w-[64rem] space-y-3">
      {q.data.map((m) => (
        <Card key={m.version} className="p-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <GitCommitVertical className="size-4 text-accent" />
            <Badge tone="accent">v{m.version}</Badge>
            <span className="font-medium">{m.summary}</span>
            <span className="ml-auto text-[11px] text-muted">{timeAgo(m.applied_at)} · {m.email}</span>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-text-2">Up script{m.down_sql ? " / down script" : ""}</summary>
            <CodeBlock className="mt-2" code={m.up_sql} />
            {m.down_sql && <CodeBlock className="mt-2" code={`-- down\n${m.down_sql}`} />}
          </details>
        </Card>
      ))}
    </div>
  );
}

function Backups() {
  const id = useProjectId();
  const invalidate = useInvalidateProject(id);
  const [label, setLabel] = React.useState("");
  const [pending, setPending] = React.useState<Approval | null>(null);
  const q = useQuery({
    queryKey: ["backups", id],
    queryFn: () => api.get<{ backup_id: string; label: string; size_bytes: number; schema_version: number; created_at: string }[]>(`/projects/${id}/backups`),
  });
  const create = useMutation({
    mutationFn: () => api.post(`/projects/${id}/backups`, { label: label || "manual backup" }),
    onSuccess: () => { setLabel(""); invalidate(); toast.success("Backup created"); },
    onError: (e) => toast.error((e as Error).message),
  });
  const restore = useMutation({
    mutationFn: (bid: string) => api.post<{ approval: Approval }>(`/projects/${id}/backups/${bid}/restore`),
    onSuccess: (r) => { invalidate(); setPending(r.approval); },
  });
  return (
    <div className="px-fluid py-fluid max-w-[56rem]">
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <DatabaseBackup className="size-4 text-accent" />
        <Input className="min-w-0 flex-[1_1_12rem] sm:max-w-xs" placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button variant="primary" size="sm" loading={create.isPending} onClick={() => create.mutate()}>
          <Save className="size-3.5" /> Back up now
        </Button>
        <span className="basis-full text-[11.5px] text-muted @3xl/main:ml-auto @3xl/main:basis-auto">pg_dump, custom format. Auto-taken before high-risk changes.</span>
      </Card>
      {q.isLoading ? <Spinner /> : !q.data?.length ? <EmptyState title="No backups yet" /> : (
        <Card className="divide-y divide-border">
          {q.data.map((b) => (
            <div key={b.backup_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px]">
              <span className="font-medium">{b.label}</span>
              <Badge>schema v{b.schema_version}</Badge>
              <span className="text-xs text-muted">{formatBytes(b.size_bytes)} · {timeAgo(b.created_at)}</span>
              <Button className="ml-auto" size="sm" variant="ghost" loading={restore.isPending && restore.variables === b.backup_id} onClick={() => restore.mutate(b.backup_id)}>
                <RotateCcw className="size-3.5" /> Restore
              </Button>
            </div>
          ))}
        </Card>
      )}
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)} title="Confirm restore" wide>
        {pending && <ApprovalCard approval={pending} projectId={id} />}
      </Dialog>
    </div>
  );
}
