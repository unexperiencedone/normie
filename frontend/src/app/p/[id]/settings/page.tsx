"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, EyeOff, KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Badge, Button, Card, Dialog, ErrorBox, Input, Label, PageHeader, Spinner, Switch } from "@/components/ui";
import { api } from "@/lib/api";
import { useProject, useProjectId } from "@/lib/project";
import { timeAgo } from "@/lib/utils";

interface Conn {
  host: string;
  port: number;
  database: string;
  roles: { kind: "owner" | "rw" | "ro"; db_user: string; rotated_at: string; purpose: string }[];
}

const KIND_NAME = { owner: "Owner", rw: "Read-write", ro: "Read-only" };

export default function SettingsPage() {
  const id = useProjectId();
  const project = useProject();
  const qc = useQueryClient();
  const conn = useQuery({ queryKey: ["connection", id], queryFn: () => api.get<Conn>(`/projects/${id}/connection`) });
  const patch = useMutation({
    mutationFn: (v: boolean) => api.patch(`/projects/${id}`, { auto_approve_low_risk: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", id] }),
  });

  return (
    <div>
      <PageHeader title="Connect & settings" description="Connect any PostgreSQL client, ORM or BI tool directly to your project database." />
      <div className="px-fluid py-fluid max-w-[56rem] space-y-6">
        {conn.isLoading ? <Spinner /> : conn.data && (
          <>
            <Card className="grid-auto-xs overflow-hidden [&>*]:border-border [&>*:not(:last-child)]:border-r">
              {[["Host", conn.data.host], ["Port", String(conn.data.port)], ["Database", conn.data.database]].map(([k, v]) => (
                <div key={k} className="px-4 py-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted">{k}</div>
                  <div className="mt-0.5 font-mono text-[13px]">{v}</div>
                </div>
              ))}
            </Card>
            <div className="space-y-3">
              {conn.data.roles.map((r) => <Credential key={r.kind} conn={conn.data!} role={r} />)}
            </div>
            <p className="text-xs text-text-2">
              Passwords are generated randomly (32 chars), stored encrypted (Fernet/AES), and only decrypted when you reveal them. Every reveal and
              rotation is written to the audit log. Read-only connections are forced into READ ONLY transactions by PostgreSQL itself.
            </p>
          </>
        )}

        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <div className="text-[13px] font-medium">Auto-apply low-risk changes</div>
            <div className="text-xs text-text-2">INSERTs and single-row edits commit right after a successful dry run (and stay undoable). Turn off to approve everything.</div>
          </div>
          <Switch checked={!!project.data?.auto_approve_low_risk} disabled={patch.isPending} onCheckedChange={(v) => patch.mutate(v)} />
        </Card>

        <DangerZone name={project.data?.name ?? ""} />
      </div>
    </div>
  );
}

function Credential({ conn, role }: { conn: Conn; role: Conn["roles"][number] }) {
  const id = useProjectId();
  const qc = useQueryClient();
  const [pw, setPw] = React.useState<string | null>(null);
  const reveal = useMutation({
    mutationFn: () => api.post<{ password: string }>(`/projects/${id}/connection/reveal`, { kind: role.kind }),
    onSuccess: (r) => setPw(r.password),
  });
  const rotate = useMutation({
    mutationFn: () => api.post(`/projects/${id}/connection/rotate`, { kind: role.kind }),
    onSuccess: () => { setPw(null); qc.invalidateQueries({ queryKey: ["connection", id] }); toast.success(`${KIND_NAME[role.kind]} password rotated`); },
  });
  const uri = (p: string) => `postgresql://${role.db_user}:${p}@${conn.host}:${conn.port}/${conn.database}`;

  async function copy() {
    let p = pw;
    if (!p) p = (await reveal.mutateAsync()).password;
    await navigator.clipboard.writeText(uri(p));
    toast.success("Connection string copied");
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 text-accent" />
        <span className="text-[13px] font-semibold">{KIND_NAME[role.kind]}</span>
        <code className="font-mono text-xs text-text-2">{role.db_user}</code>
        {role.kind === "owner" && <Badge tone="warn">keep private</Badge>}
        <span className="ml-auto text-[11px] text-muted">rotated {timeAgo(role.rotated_at)}</span>
      </div>
      <p className="mt-1 text-xs text-text-2">{role.purpose}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input readOnly className="min-w-0 flex-[1_1_18rem] font-mono text-xs" value={uri(pw ?? "••••••••••••••••")} />
        <Button size="icon" variant="secondary" onClick={() => (pw ? setPw(null) : reveal.mutate())} aria-label={pw ? "Hide password" : "Reveal password"}>
          {reveal.isPending ? <Spinner className="size-3.5" /> : pw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>
        <Button size="icon" variant="secondary" onClick={copy} aria-label="Copy connection string"><Copy className="size-3.5" /></Button>
        <Button size="sm" variant="ghost" loading={rotate.isPending} onClick={() => rotate.mutate()}><RefreshCw className="size-3.5" /> Rotate</Button>
      </div>
    </Card>
  );
}

function DangerZone({ name }: { name: string }) {
  const id = useProjectId();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const del = useMutation({
    mutationFn: () => api.del(`/projects/${id}`, { confirm_name: confirm }),
    onSuccess: () => router.replace("/projects"),
  });
  return (
    <Card className="border-danger/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-[1_1_16rem]">
          <div className="text-[13px] font-medium text-danger">Delete project</div>
          <div className="text-xs text-text-2">Drops the database and all of its roles permanently. This cannot be undone.</div>
        </div>
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Delete…</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen} title="Delete this project?"
        description={<>Type <b className="font-mono">{name}</b> to confirm. The database is dropped immediately.</>}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" disabled={confirm !== name} loading={del.isPending} onClick={() => del.mutate()}><TriangleAlert className="size-3.5" /> Delete forever</Button></>}>
        <Label>Project name</Label>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ErrorBox className="mt-3" error={del.error} />
      </Dialog>
    </Card>
  );
}
