"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, BrainCircuit, Database, FlaskConical, KeyRound, Plus, RefreshCw, Sparkles, Table2, Trash2, Wand2 } from "lucide-react";
import * as React from "react";
import { ApprovalCard, useInvalidateProject } from "@/components/approval-card";
import { useAssistant } from "@/components/assistant/assistant";
import { Badge, Button, Card, Dialog, EmptyState, ErrorBox, Input, Label, PageHeader, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { api, type Approval } from "@/lib/api";
import { useProjectId, useSchema } from "@/lib/project";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ types
interface FDT { lhs: string[]; rhs: string[]; source?: "key" | "data" | "manual"; label?: string }
interface Decomp { relations: string[][]; lossless: boolean; dependency_preserving: boolean; lost: { lhs: string[]; rhs: string[] }[]; chase_tableau: string[][]; attribute_order: string[] }
interface NormOut {
  report: { highest_nf: string; candidate_keys: string[][]; prime_attributes: string[]; non_prime_attributes: string[]; violations: { target_nf: string; fd: { lhs: string[]; rhs: string[] }; reason: string }[] };
  candidate_keys: string[][];
  "3nf": Decomp;
  bcnf: Decomp;
}
interface Health { table: string; rows: number; nf_declared: string; nf_observed: string; observed_fds: FDT[] }
interface TableFDs { table: string; attributes: string[]; declared: FDT[]; observed: FDT[]; rows: number | null; note: string | null }

const NF_TONE = (nf: string) => (nf === "BCNF" ? "ok" : nf === "3NF" ? "info" : "warn") as "ok" | "info" | "warn";
const fdKey = (f: FDT) => `${f.lhs.join(",")}->${f.rhs.join(",")}`;
const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function LabPage() {
  return (
    <div>
      <PageHeader
        title="Normalisation lab"
        description="Functional dependencies of your real tables, from their keys and from their data, analysed deterministically (closure, keys, 1NF to BCNF, chase)."
      />
      <Tabs defaultValue="project">
        <TabsList className="px-fluid">
          <TabsTrigger value="project">
            <Database className="size-3.5" /> Project tables
          </TabsTrigger>
          <TabsTrigger value="free">
            <FlaskConical className="size-3.5" /> Free-form (textbook)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="project">
          <ProjectLab />
        </TabsContent>
        <TabsContent value="free">
          <FreeLab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ================================================================== project mode
function ProjectLab() {
  const id = useProjectId();
  const schema = useSchema();
  const { ask } = useAssistant();
  const invalidate = useInvalidateProject(id);
  const health = useQuery({ queryKey: ["norm-health", id], queryFn: () => api.get<Health[]>(`/projects/${id}/normalization`) });
  const tables = schema.data?.tables.filter((t) => t.kind === "table") ?? [];
  const [picked, setPicked] = React.useState<string | null>(null);
  const table = picked && tables.some((t) => t.name === picked) ? picked : tables[0]?.name ?? null;

  const fdsQ = useQuery({
    queryKey: ["norm-table", id, table],
    queryFn: () => api.get<TableFDs>(`/projects/${id}/normalization/${encodeURIComponent(table!)}`),
    enabled: !!table,
  });

  if (schema.isLoading) return <Spinner className="m-6" />;
  if (!tables.length)
    return (
      <EmptyState icon={<Table2 className="size-5" />} title="No tables to analyse yet">
        Create tables first, or switch to the free-form tab for textbook exercises.
      </EmptyState>
    );

  return (
    <div className="px-fluid py-fluid space-y-5">
      {/* schema health strip */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold">Schema health</h2>
          <span className="text-[11.5px] text-muted">keys only → with dependencies observed in the data</span>
        </div>
        <div className="grid-auto-sm gap-2">
          {health.isLoading && <Spinner />}
          {health.data?.map((h) => (
            <button
              key={h.table}
              onClick={() => setPicked(h.table)}
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong",
                table === h.table ? "border-accent" : "border-border",
              )}
            >
              <Table2 className="size-3.5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{h.table}</span>
              <Badge tone={NF_TONE(h.nf_declared)}>{h.nf_declared}</Badge>
              {h.nf_observed !== h.nf_declared && (
                <>
                  <ArrowRight className="size-3 shrink-0 text-muted" />
                  <Badge tone={NF_TONE(h.nf_observed)}>{h.nf_observed}</Badge>
                </>
              )}
            </button>
          ))}
        </div>
      </section>

      {fdsQ.isLoading || !fdsQ.data ? (
        fdsQ.error ? <ErrorBox error={fdsQ.error} /> : <Spinner />
      ) : (
        <TableAnalysis
          key={table!}
          data={fdsQ.data}
          onRefresh={() => fdsQ.refetch()}
          refreshing={fdsQ.isFetching}
          onAsk={(fds) =>
            ask(
              `Normalise the table ${table}. Its confirmed functional dependencies are: ${fds.map((f) => `{${f.lhs.join(", ")}} → {${f.rhs.join(", ")}}`).join("; ")}. Explain the normal form and violations, then propose a lossless decomposition migration (keep the original table until I confirm).`,
            )
          }
          onApplied={() => {
            invalidate();
            health.refetch();
          }}
        />
      )}
    </div>
  );
}

function TableAnalysis({ data, onRefresh, refreshing, onAsk, onApplied }: {
  data: TableFDs; onRefresh: () => void; refreshing: boolean; onAsk: (fds: FDT[]) => void; onApplied: () => void;
}) {
  const id = useProjectId();
  // observed FDs are hypotheses: unchecked until the designer confirms them
  const [confirmed, setConfirmed] = React.useState<Set<string>>(new Set());
  const [manual, setManual] = React.useState<string[]>([]);
  const [approval, setApproval] = React.useState<Approval | null>(null);

  const manualFds: FDT[] = manual
    .filter((m) => m.includes("->"))
    .map((m) => {
      const [l, r] = m.split("->");
      return { lhs: split(l), rhs: split(r), source: "manual" as const };
    })
    .filter((f) => f.lhs.length && f.rhs.length);
  const active: FDT[] = [...data.declared, ...data.observed.filter((f) => confirmed.has(fdKey(f))), ...manualFds];

  const run = useQuery({
    queryKey: ["norm-analyze", id, data.table, active.map(fdKey).join("|")],
    queryFn: () => api.post<NormOut>("/tools/normalize", { attributes: data.attributes, fds: active.map(({ lhs, rhs }) => ({ lhs, rhs })) }),
  });
  const decompose = useMutation({
    mutationFn: (target: "3nf" | "bcnf") =>
      api.post<{ approval: Approval }>(`/projects/${id}/normalization/${encodeURIComponent(data.table)}/decompose`, {
        target,
        fds: active.map(({ lhs, rhs }) => ({ lhs, rhs })),
      }),
    onSuccess: (r) => {
      setApproval(r.approval);
      onApplied();
    },
  });

  const toggle = (f: FDT) =>
    setConfirmed((s) => {
      const n = new Set(s);
      if (n.has(fdKey(f))) n.delete(fdKey(f));
      else n.add(fdKey(f));
      return n;
    });

  return (
    <div className="grid gap-6 @4xl/main:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
      <Card className="h-fit min-w-0 space-y-4 p-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[14px] font-semibold">{data.table}</span>
          {data.rows != null && <Badge>{data.rows} rows</Badge>}
          <Button size="icon" variant="ghost" className="ml-auto" onClick={onRefresh} aria-label="Re-scan data">
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
        <div>
          <Label>Attributes</Label>
          <div className="flex flex-wrap gap-1">
            {data.attributes.map((a) => (
              <span key={a} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px]">{a}</span>
            ))}
          </div>
        </div>

        <div>
          <Label hint="guaranteed by constraints">Declared dependencies</Label>
          {data.declared.length === 0 && <div className="text-xs text-warn">No primary key or UNIQUE constraint: every column together is the only key.</div>}
          {data.declared.map((f) => (
            <FdRow key={fdKey(f)} f={f} checked disabled tag={<Badge tone="accent"><KeyRound className="size-3" />{f.label}</Badge>} />
          ))}
        </div>

        <div>
          <Label hint="tick the ones that are true in your domain">Observed in the data</Label>
          {data.note && <div className="mb-1 text-[11.5px] text-muted">{data.note}</div>}
          {data.observed.length === 0 ? (
            <div className="text-xs text-muted">{(data.rows ?? 0) < 2 ? "Add at least 2 rows to observe dependencies." : "No non-key dependencies hold in the current data."}</div>
          ) : (
            <>
              {data.observed.map((f) => (
                <FdRow key={fdKey(f)} f={f} checked={confirmed.has(fdKey(f))} onToggle={() => toggle(f)} tag={<Badge tone="info">data</Badge>} />
              ))}
              <p className="mt-1.5 text-[11.5px] text-muted">
                Data can only suggest a dependency. One that holds by coincidence (e.g. names happen to be unique) changes the keys and the result.
              </p>
            </>
          )}
        </div>

        <div>
          <Label hint="X, Y -> Z">Your own dependencies</Label>
          <div className="space-y-1.5">
            {manual.map((m, i) => (
              <div key={i} className="flex gap-1.5">
                <Input className="font-mono text-xs" value={m} onChange={(e) => setManual((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
                <Button size="icon" variant="ghost" onClick={() => setManual((x) => x.filter((_, j) => j !== i))} aria-label="Remove dependency">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setManual((x) => [...x, ""])}>
              <Plus className="size-3.5" /> Add dependency
            </Button>
          </div>
        </div>
      </Card>

      <div className="min-w-0 space-y-4">
        {run.error ? <ErrorBox error={run.error} /> : !run.data ? <Spinner /> : (
          <>
            <Results out={run.data} />
            {run.data.report.highest_nf !== "BCNF" && (
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <Wand2 className="size-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-[1_1_16rem] text-[13px]">
                  <div className="font-medium">Apply a decomposition to {data.table}</div>
                  <div className="text-xs text-text-2">Creates the new tables from SELECT DISTINCT with their keys, as an approval. The original table is kept.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" loading={decompose.isPending && decompose.variables === "3nf"} onClick={() => decompose.mutate("3nf")}>3NF migration</Button>
                  <Button size="sm" variant="primary" loading={decompose.isPending && decompose.variables === "bcnf"} onClick={() => decompose.mutate("bcnf")}>BCNF migration</Button>
                  <Button size="sm" variant="ghost" onClick={() => onAsk(active)}>
                    <Sparkles className="size-3.5 text-accent" /> Ask copilot
                  </Button>
                </div>
                <ErrorBox className="basis-full" error={decompose.error} />
              </Card>
            )}
          </>
        )}
      </div>

      <Dialog open={!!approval} onOpenChange={(o) => !o && setApproval(null)} wide title="Decomposition migration" description="Dry-run against your real data. Nothing changes until you approve.">
        {approval && <ApprovalCard approval={approval} projectId={id} />}
      </Dialog>
    </div>
  );
}

function FdRow({ f, checked, disabled, onToggle, tag }: { f: FDT; checked: boolean; disabled?: boolean; onToggle?: () => void; tag: React.ReactNode }) {
  return (
    <label className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-xs", !disabled && "cursor-pointer hover:bg-surface-2")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} className="accent-[var(--accent)]" />
      <span className="min-w-0 flex-1 font-mono">
        {f.lhs.join(", ")} <span className="text-muted">→</span> {f.rhs.join(", ")}
      </span>
      {tag}
    </label>
  );
}

// ================================================================== free-form (textbook) mode
const EXAMPLES = {
  "Student grades (1NF)": { attrs: "student_id, course_id, student_name, course_title, grade", fds: ["student_id -> student_name", "course_id -> course_title", "student_id, course_id -> grade"] },
  "Textbook R(A..E)": { attrs: "A, B, C, D, E", fds: ["A -> B", "B, C -> E", "E, D -> A"] },
  "Employee / dept (3NF)": { attrs: "emp_id, emp_name, dept_id, dept_name, dept_head", fds: ["emp_id -> emp_name, dept_id", "dept_id -> dept_name, dept_head"] },
};

function FreeLab() {
  const [attrs, setAttrs] = React.useState(EXAMPLES["Student grades (1NF)"].attrs);
  const [fds, setFds] = React.useState<string[]>(EXAMPLES["Student grades (1NF)"].fds);
  const body = { attributes: split(attrs), fds: fds.filter((f) => f.includes("->")).map((f) => { const [l, r] = f.split("->"); return { lhs: split(l), rhs: split(r) }; }) };
  const run = useQuery({ queryKey: ["norm-free", JSON.stringify(body)], queryFn: () => api.post<NormOut>("/tools/normalize", body) });
  return (
    <div className="px-fluid py-fluid grid gap-6 @4xl/main:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <Card className="h-fit min-w-0 space-y-4 p-4">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(EXAMPLES).map(([k, v]) => (
            <button key={k} onClick={() => { setAttrs(v.attrs); setFds(v.fds); }} className="rounded-full border border-border px-2.5 py-1 text-[11.5px] text-text-2 hover:border-accent hover:text-accent">{k}</button>
          ))}
        </div>
        <div>
          <Label>Relation attributes</Label>
          <Input className="font-mono text-xs" value={attrs} onChange={(e) => setAttrs(e.target.value)} />
        </div>
        <div>
          <Label hint="X, Y -> Z">Functional dependencies</Label>
          <div className="space-y-1.5">
            {fds.map((f, i) => (
              <div key={i} className="flex gap-1.5">
                <Input className="font-mono text-xs" value={f} onChange={(e) => setFds((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
                <Button size="icon" variant="ghost" onClick={() => setFds((x) => x.filter((_, j) => j !== i))} aria-label="Remove FD"><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setFds((x) => [...x, ""])}><Plus className="size-3.5" /> Add dependency</Button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted"><BrainCircuit className="size-3.5" /> Updates as you type</div>
      </Card>
      <div className="min-w-0 space-y-4">{run.error ? <ErrorBox error={run.error} /> : run.data ? <Results out={run.data} /> : <Spinner />}</div>
    </div>
  );
}

// ================================================================== shared results
function Results({ out }: { out: NormOut }) {
  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-text-2">Highest normal form</span>
          <Badge tone={NF_TONE(out.report.highest_nf)} className="h-6 px-2 text-[13px]">{out.report.highest_nf}</Badge>
          <span className="ml-4 text-[13px] text-text-2">Candidate keys</span>
          {out.candidate_keys.map((k) => <Badge key={k.join()} tone="accent" className="font-mono">{"{"}{k.join(", ")}{"}"}</Badge>)}
        </div>
        <div className="grid-auto-sm mt-3 gap-2 text-xs">
          <div><span className="text-muted">Prime: </span><span className="font-mono">{out.report.prime_attributes.join(", ") || "—"}</span></div>
          <div><span className="text-muted">Non-prime: </span><span className="font-mono">{out.report.non_prime_attributes.join(", ") || "—"}</span></div>
        </div>
        {out.report.violations.length > 0 && (
          <div className="mt-3 space-y-1">
            {out.report.violations.map((v, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Badge tone="danger">violates {v.target_nf}</Badge>
                <span className="font-mono">{v.fd.lhs.join(", ")} → {v.fd.rhs.join(", ")}</span>
                <span className="text-text-2">{v.reason}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      {out.report.highest_nf !== "BCNF" && (
        <div className="grid-auto-md gap-4">
          <DecompCard title="3NF synthesis" d={out["3nf"]} />
          <DecompCard title="BCNF decomposition" d={out.bcnf} />
        </div>
      )}
    </>
  );
}

function DecompCard({ title, d }: { title: string; d: Decomp }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{title}</span>
        <Badge tone={d.lossless ? "ok" : "danger"}>{d.lossless ? "lossless join" : "lossy"}</Badge>
        <Badge tone={d.dependency_preserving ? "ok" : "warn"}>{d.dependency_preserving ? "preserves FDs" : "loses FDs"}</Badge>
      </div>
      <div className="space-y-1.5">
        {d.relations.map((r, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-xs">
            <span className="text-accent">R{i + 1}</span><ArrowRight className="size-3 text-muted" />({r.join(", ")})
          </div>
        ))}
      </div>
      {d.lost.length > 0 && <div className="mt-2 text-xs text-warn">Lost: {d.lost.map((f) => `${f.lhs.join(",")}→${f.rhs.join(",")}`).join("; ")}</div>}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-text-2">Chase tableau</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="font-mono text-[11px]">
            <thead><tr>{d.attribute_order.map((a) => <th key={a} className="border border-border px-1.5 py-0.5">{a}</th>)}</tr></thead>
            <tbody>{d.chase_tableau.map((row, i) => (
              <tr key={i}>{row.map((c, j) => <td key={j} className={cn("border border-border px-1.5 py-0.5", c.startsWith("a") && "bg-ok-soft text-ok")}>{c}</td>)}</tr>
            ))}</tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted">A row of all a-values means the join is lossless.</p>
        </div>
      </details>
    </Card>
  );
}
