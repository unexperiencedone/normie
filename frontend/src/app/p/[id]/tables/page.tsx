"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, KeyRound, Link2, Plus, RefreshCw, Search, Sparkles, Table2, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ApprovalCard, useInvalidateProject } from "@/components/approval-card";
import { useAssistant } from "@/components/assistant/assistant";
import { ResultGrid } from "@/components/result-grid";
import { Badge, Button, Card, Dialog, EmptyState, ErrorBox, Input, Label, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { api, type Approval, type QueryResult, type TableInfo, type WriteResponse } from "@/lib/api";
import { useProjectId, useSchema } from "@/lib/project";
import { cn, formatBytes, formatCell } from "@/lib/utils";

const PAGE = 50;

export default function TablesPage() {
  const id = useProjectId();
  const schema = useSchema();
  const { ask } = useAssistant();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");

  const tables = React.useMemo(() => schema.data?.tables ?? [], [schema.data]);
  // derived: fall back to the first table when nothing (or a dropped table) is selected
  const table = tables.find((t) => t.name === selected) ?? tables[0];

  return (
    <div className="@container/tables flex h-full">
      {/* list column only when the area is >= 48rem; below that a picker lives in the toolbar */}
      <div className="hidden w-[clamp(11rem,18cqi,15rem)] shrink-0 flex-col border-r border-border bg-surface @3xl/tables:flex">
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-2 size-3.5 text-muted" />
            <Input className="h-7 pl-7 text-xs" placeholder="Search tables" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {schema.isLoading && <Spinner className="m-3" />}
          {tables
            .filter((t) => t.name.includes(filter.toLowerCase()))
            .map((t) => (
              <button
                key={t.name}
                onClick={() => setSelected(t.name)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                  table?.name === t.name ? "bg-surface-3 font-medium" : "text-text-2 hover:bg-surface-2",
                )}
              >
                {t.kind === "table" ? <Table2 className="size-3.5 shrink-0 text-muted" /> : <Eye className="size-3.5 shrink-0 text-muted" />}
                <span className="truncate">{t.name}</span>
                <span className="ml-auto text-[11px] tabular-nums text-muted">{t.kind === "table" ? t.row_estimate : "view"}</span>
              </button>
            ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {schema.data && tables.length === 0 ? (
          <EmptyState
            icon={<Table2 className="size-5" />}
            title="This database has no tables yet"
            action={
              <Button variant="primary" onClick={() => ask("Help me design the tables for this project. Ask me what I need to store.")}>
                <Sparkles className="size-3.5" /> Design tables with the copilot
              </Button>
            }
          >
            Create them in the SQL editor, or let the copilot design a normalised schema for you.
          </EmptyState>
        ) : table ? (
          <TableView key={table.name} projectId={id} table={table} tables={tables} onSelect={setSelected} />
        ) : null}
      </div>
    </div>
  );
}

function useWriteHandler(projectId: string, onPending: (a: Approval) => void) {
  const invalidate = useInvalidateProject(projectId);
  return (r: WriteResponse) => {
    invalidate();
    if (r.status === "executed") toast.success(`Saved · ${r.result.rows_affected} row${r.result.rows_affected === 1 ? "" : "s"}`, { description: "Undo from History if needed." });
    else onPending(r.approval);
  };
}

function TableView({ projectId, table, tables, onSelect }: { projectId: string; table: TableInfo; tables: TableInfo[]; onSelect: (t: string) => void }) {
  const [page, setPage] = React.useState(0);
  const [order, setOrder] = React.useState<{ col: string; desc: boolean } | null>(null);
  const [rowIdx, setRowIdx] = React.useState<number | null>(null);
  const [editing, setEditing] = React.useState<{ row: number; col: number; value: string } | null>(null);
  const [insertOpen, setInsertOpen] = React.useState(false);
  const [pendingApproval, setPendingApproval] = React.useState<Approval | null>(null);
  const handle = useWriteHandler(projectId, setPendingApproval);

  const rows = useQuery({
    queryKey: ["rows", projectId, table.name, page, order],
    queryFn: () =>
      api.get<QueryResult & { total: number; total_exact: boolean }>(
        `/projects/${projectId}/tables/${encodeURIComponent(table.name)}/rows?limit=${PAGE}&offset=${page * PAGE}` +
          (order ? `&order=${encodeURIComponent(order.col)}&desc=${order.desc}` : ""),
      ),
    placeholderData: keepPreviousData,
  });

  const pkOf = (r: unknown[]) => {
    const cols = rows.data?.columns ?? [];
    return Object.fromEntries(table.primary_key.map((k) => [k, r[cols.findIndex((c) => c.name === k)]]));
  };

  const update = useMutation({
    mutationFn: (v: { pk: Record<string, unknown>; values: Record<string, unknown> }) =>
      api.post<WriteResponse>(`/projects/${projectId}/tables/${encodeURIComponent(table.name)}/update`, v),
    onSuccess: handle,
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (pk: Record<string, unknown>) =>
      api.post<WriteResponse>(`/projects/${projectId}/tables/${encodeURIComponent(table.name)}/delete`, { pk }),
    onSuccess: (r) => {
      setRowIdx(null);
      handle(r);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const editable = table.kind === "table" && table.primary_key.length > 0;
  const total = rows.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const current = rowIdx !== null ? rows.data?.rows[rowIdx] : null;

  function commitEdit() {
    if (!editing || !rows.data) return;
    const r = rows.data.rows[editing.row];
    const col = rows.data.columns[editing.col].name;
    const before = formatCell(r[editing.col]);
    setEditing(null);
    if (before === editing.value) return;
    update.mutate({ pk: pkOf(r), values: { [col]: editing.value === "NULL" ? null : editing.value } });
  }

  return (
    <Tabs defaultValue="data" className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 border-b border-border bg-surface pl-3 pr-2">
        <div className="flex min-w-0 items-center gap-2 py-2">
          <select
            aria-label="Choose table"
            value={table.name}
            onChange={(e) => onSelect(e.target.value)}
            className="h-7 max-w-[50cqi] rounded-md border border-border bg-surface-2 px-1.5 font-mono text-[13px] font-semibold @3xl/tables:hidden"
          >
            {tables.map((t) => <option key={t.name}>{t.name}</option>)}
          </select>
          <span className="hidden truncate font-mono text-[13px] font-semibold @3xl/tables:inline">{table.name}</span>
          {table.rls && <Badge tone="info">RLS on</Badge>}
          {table.kind !== "table" && <Badge>{table.kind}</Badge>}
        </div>
        <TabsList className="border-none px-0">
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="structure">Structure</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => rows.refetch()} aria-label="Refresh">
            <RefreshCw className={cn("size-3.5", rows.isFetching && "animate-spin")} />
          </Button>
          {table.kind === "table" && (
            <Button size="sm" variant="primary" onClick={() => setInsertOpen(true)}>
              <Plus className="size-3.5" /> Insert row
            </Button>
          )}
        </div>
      </div>

      <TabsContent value="data" className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {rows.error ? (
            <div className="min-h-0 flex-1"><ErrorBox className="m-4" error={rows.error} /></div>
          ) : !rows.data ? (
            <div className="min-h-0 flex-1"><Spinner className="m-6" /></div>
          ) : rows.data.rows.length === 0 ? (
            <div className="min-h-0 flex-1">
              <EmptyState title="No rows yet">Insert a row, or ask the copilot to add sample data.</EmptyState>
            </div>
          ) : (
            <div className="relative min-h-0 flex-1">
              <SortHeader columns={rows.data.columns.map((c) => c.name)} table={table} order={order} setOrder={(o) => { setOrder(o); setPage(0); }} />
              <ResultGrid
                className="h-[calc(100%-30px)]"
                columns={rows.data.columns.map((c) => ({ name: c.name, type: table.columns.find((x) => x.name === c.name)?.type ?? c.type }))}
                rows={rows.data.rows}
                rowOffset={page * PAGE}
                selectedRow={rowIdx}
                onRowClick={(i) => setRowIdx(i === rowIdx ? null : i)}
                onCellDoubleClick={
                  editable
                    ? (row, col) => setEditing({ row, col, value: formatCell(rows.data!.rows[row][col]) })
                    : undefined
                }
              />
            </div>
          )}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 border-t border-border bg-surface px-3 py-1.5 text-xs text-muted">
            <span className="hidden @2xl/tables:inline">
              {editable ? "Double-click a cell to edit · click a row to inspect" : table.kind === "table" ? "No primary key: rows are read-only here" : "Views are read-only"}
            </span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">
                {total === 0 ? 0 : page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {rows.data?.total_exact === false ? "~" : ""}
                {total}
              </span>
              <Button size="icon" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {current && rows.data && (
          <RowInspector
            key={`${page}-${rowIdx}`}
            table={table}
            columns={rows.data.columns.map((c) => c.name)}
            row={current}
            editable={editable}
            saving={update.isPending}
            deleting={del.isPending}
            onSave={(values) => update.mutate({ pk: pkOf(current), values })}
            onDelete={() => del.mutate(pkOf(current))}
            onClose={() => setRowIdx(null)}
          />
        )}
      </TabsContent>

      <TabsContent value="structure" className="px-fluid py-fluid min-h-0 flex-1 overflow-auto">
        <Structure table={table} />
      </TabsContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={`Edit ${rows.data && editing ? rows.data.columns[editing.col].name : ""}`}
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" onClick={commitEdit}>Save</Button></>}>
        <Input autoFocus value={editing?.value ?? ""} onChange={(e) => editing && setEditing({ ...editing, value: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && commitEdit()} className="font-mono" />
        <p className="mt-2 text-xs text-muted">Type NULL to clear. The edit is dry-run first; single-row edits are low risk.</p>
      </Dialog>

      {insertOpen && <InsertDialog open={insertOpen} onOpenChange={setInsertOpen} projectId={projectId} table={table} onDone={handle} />}

      <Dialog open={!!pendingApproval} onOpenChange={(o) => !o && setPendingApproval(null)} title="Approval required" wide
        description="This change touches more than one row, so it waits for your explicit approval.">
        {pendingApproval && <ApprovalCard approval={pendingApproval} projectId={projectId} />}
      </Dialog>
    </Tabs>
  );
}

function SortHeader({ columns, table, order, setOrder }: { columns: string[]; table: TableInfo; order: { col: string; desc: boolean } | null; setOrder: (o: { col: string; desc: boolean } | null) => void }) {
  return (
    <div className="flex h-[30px] items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2 text-[11px] text-muted">
      <span className="mr-1">Sort:</span>
      {columns.map((c) => {
        const col = table.columns.find((x) => x.name === c);
        const active = order?.col === c;
        return (
          <button
            key={c}
            onClick={() => setOrder(active ? (order!.desc ? null : { col: c, desc: true }) : { col: c, desc: false })}
            className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 whitespace-nowrap hover:bg-surface-2", active && "bg-accent-soft text-accent")}
          >
            {col?.is_pk && <KeyRound className="size-3" />}
            {col?.is_fk && <Link2 className="size-3" />}
            {c}
            {active && (order!.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
          </button>
        );
      })}
    </div>
  );
}

function RowInspector({ table, columns, row, editable, saving, deleting, onSave, onDelete, onClose }: {
  table: TableInfo; columns: string[]; row: unknown[]; editable: boolean; saving: boolean; deleting: boolean;
  onSave: (v: Record<string, unknown>) => void; onDelete: () => void; onClose: () => void;
}) {
  const [draft, setDraft] = React.useState<Record<string, string>>({}); // reset via `key` when the row changes
  const changed = Object.keys(draft).length > 0;
  return (
    // overlay on narrow areas, docked column once the editor is >= 56rem wide
    <div className="absolute inset-y-0 right-0 z-10 flex w-[min(100%,22rem)] flex-col border-l border-border bg-surface shadow-card @4xl/tables:static @4xl/tables:w-[clamp(18rem,26cqi,22rem)] @4xl/tables:shadow-none">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[13px] font-medium">Row details</span>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {columns.map((c, i) => {
          const col = table.columns.find((x) => x.name === c);
          const ro = !editable || col?.is_pk || col?.is_generated;
          return (
            <div key={c}>
              <Label hint={col?.type}>
                <span className="flex items-center gap-1 font-mono">
                  {col?.is_pk && <KeyRound className="size-3 text-accent" />}
                  {col?.is_fk && <Link2 className="size-3 text-info" />}
                  {c}
                </span>
              </Label>
              <Input
                className="font-mono text-xs"
                readOnly={ro}
                value={draft[c] ?? formatCell(row[i])}
                onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))}
              />
            </div>
          );
        })}
      </div>
      {editable && (
        <div className="flex gap-2 border-t border-border p-3">
          <Button size="sm" variant="ghost" className="text-danger" loading={deleting} onClick={onDelete}>
            <Trash2 className="size-3.5" /> Delete row
          </Button>
          <Button size="sm" variant="primary" className="ml-auto" disabled={!changed} loading={saving}
            onClick={() => onSave(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v === "NULL" ? null : v])))}>
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}

function InsertDialog({ open, onOpenChange, projectId, table, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; projectId: string; table: TableInfo; onDone: (r: WriteResponse) => void;
}) {
  const [values, setValues] = React.useState<Record<string, string>>({}); // mounted fresh each time it opens
  const insert = useMutation({
    mutationFn: () => api.post<WriteResponse>(`/projects/${projectId}/tables/${encodeURIComponent(table.name)}/insert`, { values }),
    onSuccess: (r) => { onOpenChange(false); onDone(r); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Insert into ${table.name}`} description="Leave a field empty to use its default (identity/serial columns fill themselves)."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={insert.isPending} onClick={() => insert.mutate()}>Insert row</Button></>}>
      <div className="space-y-3">
        {table.columns.filter((c) => !c.is_generated).map((c) => {
          const auto = c.is_identity || (c.default ?? "").includes("nextval");
          return (
            <div key={c.name}>
              <Label hint={`${c.type}${!c.nullable && !auto && !c.default ? " · required" : ""}`}>
                <span className="font-mono">{c.name}</span>
              </Label>
              <Input className="font-mono text-xs" placeholder={auto ? "auto-generated" : c.default ? `default: ${c.default}` : c.nullable ? "NULL" : ""}
                value={values[c.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))} />
            </div>
          );
        })}
        <ErrorBox error={insert.error} />
      </div>
    </Dialog>
  );
}

function Structure({ table }: { table: TableInfo }) {
  return (
    <div className="max-w-4xl space-y-5">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-[13px]">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">Column</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Nullable</th>
              <th className="px-3 py-2 font-medium">Default</th>
              <th className="px-3 py-2 font-medium">Keys</th>
            </tr>
          </thead>
          <tbody>
            {table.columns.map((c) => (
              <tr key={c.name} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 font-mono">{c.name}</td>
                <td className="px-3 py-1.5 font-mono text-text-2">{c.type}</td>
                <td className="px-3 py-1.5">{c.nullable ? "yes" : <span className="text-text-2">NOT NULL</span>}</td>
                <td className="max-w-[220px] truncate px-3 py-1.5 font-mono text-xs text-muted">{c.is_identity ? "identity" : c.default ?? ""}</td>
                <td className="px-3 py-1.5">
                  <div className="flex gap-1">
                    {c.is_pk && <Badge tone="accent">PK</Badge>}
                    {c.is_fk && <Badge tone="info">FK</Badge>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid-auto-md gap-4">
        <Card className="p-3">
          <div className="mb-2 text-xs font-medium text-muted">Foreign keys</div>
          {table.foreign_keys.length ? table.foreign_keys.map((f) => (
            <div key={f.name} className="font-mono text-xs">({f.columns.join(", ")}) → {f.ref_table}({f.ref_columns.join(", ")}) <span className="text-muted">on delete {f.on_delete.toLowerCase()}</span></div>
          )) : <div className="text-xs text-muted">none</div>}
          {table.checks.length > 0 && <div className="mb-1 mt-3 text-xs font-medium text-muted">Checks</div>}
          {table.checks.map((c) => <div key={c} className="font-mono text-xs">{c}</div>)}
        </Card>
        <Card className="p-3">
          <div className="mb-2 flex justify-between text-xs font-medium text-muted"><span>Indexes</span><span>{formatBytes(table.size_bytes)} total</span></div>
          {table.indexes.map((i) => (
            <div key={i.name} className="mb-1 font-mono text-xs"><span className="text-text">{i.name}</span> <span className="text-muted">{formatBytes(i.size_bytes)}</span><div className="truncate text-muted" title={i.definition}>{i.definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON \S+ USING /, "")}</div></div>
          ))}
          {!table.indexes.length && <div className="text-xs text-muted">none</div>}
        </Card>
      </div>
    </div>
  );
}
