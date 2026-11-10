"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, KeyRound, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import * as React from "react";
import { ApprovalCard, useInvalidateProject } from "@/components/approval-card";
import { useAssistant } from "@/components/assistant/assistant";
import { Badge, Button, Card, Dialog, EmptyState, ErrorBox, Input, Label, PageHeader, Spinner, Textarea } from "@/components/ui";
import { api, type Approval } from "@/lib/api";
import { useProjectId, useSchema } from "@/lib/project";
import { cn } from "@/lib/utils";

type Priv = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
interface Grant { table: string; privileges: Priv[]; columns: string[] | null; row_filter: string | null }
interface Role { name: string; db_role: string; description: string; policy: { grants: Grant[] }; created_at: string }

export default function RolesPage() {
  const id = useProjectId();
  const { ask } = useAssistant();
  const roles = useQuery({ queryKey: ["roles", id], queryFn: () => api.get<Role[]>(`/projects/${id}/roles`) });
  const [builder, setBuilder] = React.useState(false);
  const [english, setEnglish] = React.useState("");

  return (
    <div>
      <PageHeader
        title="Roles & access"
        description="Business roles become real PostgreSQL roles with column-level GRANTs, per-role views and row-level security."
        actions={<Button variant="primary" size="sm" onClick={() => setBuilder(true)}><Plus className="size-3.5" /> New role</Button>}
      />
      <div className="px-fluid py-fluid grid gap-6 @5xl/main:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <div className="min-w-0 space-y-4">
          <Card className="p-3">
            <Label>Describe access in plain English</Label>
            <div className="flex flex-wrap gap-2">
              <Input className="min-w-0 flex-[1_1_16rem]" placeholder="e.g. receptionists can book appointments but must not see diagnoses" value={english} onChange={(e) => setEnglish(e.target.value)} />
              <Button disabled={!english.trim()} onClick={() => { ask(`Create a business role: ${english}. Then test it with a query it should be allowed and one it should be denied.`); setEnglish(""); }}>
                <Sparkles className="size-3.5 text-accent" /> Ask copilot
              </Button>
            </div>
          </Card>
          {roles.isLoading ? <Spinner /> : !roles.data?.length ? (
            <Card className="border-dashed"><EmptyState icon={<ShieldCheck className="size-5" />} title="No business roles yet">Create roles like receptionist, doctor or analyst and decide exactly what each can see and do.</EmptyState></Card>
          ) : roles.data.map((r) => (
            <Card key={r.name} className="p-4">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-accent" />
                <span className="font-semibold">{r.name}</span>
                <code className="font-mono text-[11px] text-muted">{r.db_role}</code>
              </div>
              {r.description && <p className="mt-1 text-[13px] text-text-2">{r.description}</p>}
              <div className="mt-3 space-y-1.5">
                {r.policy.grants.map((g) => (
                  <div key={g.table} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <code className="font-mono text-[12px] font-medium">{g.table}</code>
                    {g.privileges.map((p) => <Badge key={p} tone={p === "SELECT" ? "info" : "warn"}>{p}</Badge>)}
                    <span className="text-muted">{g.columns ? `columns: ${g.columns.join(", ")}` : "all columns"}</span>
                    {g.row_filter && <Badge tone="accent">rows where {g.row_filter}</Badge>}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <Simulator roles={roles.data ?? []} />
      </div>
      {builder && <RoleBuilder open={builder} onOpenChange={setBuilder} />}
    </div>
  );
}

function Simulator({ roles }: { roles: Role[] }) {
  const id = useProjectId();
  const [picked, setRole] = React.useState("");
  const role = picked || roles[0]?.name || "";
  const [sql, setSql] = React.useState("");
  const sim = useMutation({
    mutationFn: () => api.post<{ allowed: boolean; reason: string; layer: string; sample?: Record<string, unknown>[] }>(`/projects/${id}/roles/${role}/simulate`, { sql }),
  });
  return (
    <Card className="h-fit p-4 @5xl/main:sticky @5xl/main:top-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold"><FlaskConical className="size-4 text-accent" /> Access simulator</div>
      <p className="mb-3 text-xs text-text-2">Runs the statement <i>as</i> the role inside a rolled-back transaction. PostgreSQL itself decides.</p>
      {roles.length === 0 ? <div className="text-xs text-muted">Create a role first.</div> : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => (
              <button key={r.name} onClick={() => setRole(r.name)} className={cn("rounded-full border px-2.5 py-1 text-xs", role === r.name ? "border-accent bg-accent-soft text-accent" : "border-border text-text-2 hover:border-border-strong")}>{r.name}</button>
            ))}
          </div>
          <Textarea rows={4} className="font-mono text-xs" placeholder="SELECT * FROM patient" value={sql} onChange={(e) => setSql(e.target.value)} />
          <Button variant="primary" size="sm" disabled={!sql.trim()} loading={sim.isPending} onClick={() => sim.mutate()}>Test access</Button>
          <ErrorBox error={sim.error} />
          {sim.data && (
            <div className={cn("rounded-md px-3 py-2 text-[13px]", sim.data.allowed ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
              <b>{sim.data.allowed ? "Allowed" : "Denied"}</b> · {sim.data.reason}
              <div className="text-xs opacity-75">decided by {sim.data.layer === "postgres" ? "PostgreSQL GRANTs / row-level security" : "Normie policy"}</div>
              {sim.data.sample && sim.data.sample.length > 0 && <div className="mt-1 font-mono text-[11px] opacity-90">{sim.data.sample.length} sample row(s) visible to this role</div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RoleBuilder({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const id = useProjectId();
  const schema = useSchema();
  const invalidate = useInvalidateProject(id);
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [grants, setGrants] = React.useState<Grant[]>([]);
  const [approval, setApproval] = React.useState<Approval | null>(null); // mounted fresh each time it opens
  const tables = schema.data?.tables ?? [];
  const create = useMutation({
    mutationFn: () => api.post<{ approval: Approval }>(`/projects/${id}/roles`, { name, description: desc, grants }),
    onSuccess: (r) => { invalidate(); setApproval(r.approval); },
  });
  const set = (i: number, g: Partial<Grant>) => setGrants((gs) => gs.map((x, j) => (j === i ? { ...x, ...g } : x)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="New business role" description="Pick tables, privileges, visible columns and an optional row filter."
      footer={approval ? <Button onClick={() => onOpenChange(false)}>Close</Button> : <><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} disabled={!name || !grants.length} onClick={() => create.mutate()}>Generate & dry-run</Button></>}>
      {approval ? <ApprovalCard approval={approval} projectId={id} /> : (
        <div className="space-y-4">
          <div className="grid-auto-sm gap-3">
            <div><Label>Role name</Label><Input placeholder="receptionist" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} /></div>
            <div><Label>Description</Label><Input placeholder="front desk staff" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          </div>
          {grants.map((g, i) => {
            const t = tables.find((x) => x.name === g.table);
            return (
              <Card key={i} className="space-y-2.5 p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <select value={g.table} onChange={(e) => set(i, { table: e.target.value, columns: null })} className="h-8 rounded-md border border-border bg-surface px-2 font-mono text-[13px]">
                    {tables.map((t) => <option key={t.name}>{t.name}</option>)}
                  </select>
                  {(["SELECT", "INSERT", "UPDATE", "DELETE"] as Priv[]).map((p) => (
                    <label key={p} className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={g.privileges.includes(p)} onChange={(e) => set(i, { privileges: e.target.checked ? [...g.privileges, p] : g.privileges.filter((x) => x !== p) })} />
                      {p}
                    </label>
                  ))}
                  <Button size="icon" variant="ghost" className="ml-auto" onClick={() => setGrants((gs) => gs.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="size-3.5" /></Button>
                </div>
                <div>
                  <Label hint="unselected = hidden from this role">Visible columns</Label>
                  <div className="flex flex-wrap gap-1">
                    {t?.columns.map((c) => {
                      const on = g.columns === null || g.columns.includes(c.name);
                      return (
                        <button key={c.name} onClick={() => {
                          const all = t.columns.map((x) => x.name);
                          const cur = g.columns ?? all;
                          const next = on ? cur.filter((x) => x !== c.name) : [...cur, c.name];
                          set(i, { columns: next.length === all.length ? null : next });
                        }} className={cn("rounded border px-1.5 py-0.5 font-mono text-[11px]", on ? "border-accent/40 bg-accent-soft text-accent" : "border-border text-muted line-through")}>{c.name}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label hint="optional, row-level security">Row filter</Label>
                  <Input className="font-mono text-xs" placeholder="doctor_id = 3" value={g.row_filter ?? ""} onChange={(e) => set(i, { row_filter: e.target.value || null })} />
                </div>
              </Card>
            );
          })}
          <Button size="sm" disabled={!tables.length} onClick={() => setGrants((g) => [...g, { table: tables[0].name, privileges: ["SELECT"], columns: null, row_filter: null }])}>
            <Plus className="size-3.5" /> Add table permission
          </Button>
          <ErrorBox error={create.error} />
        </div>
      )}
    </Dialog>
  );
}
