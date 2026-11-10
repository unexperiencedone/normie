"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { cn, formatCell } from "@/lib/utils";

export function ResultGrid({
  columns,
  rows,
  className,
  compact,
  rowOffset = 0,
  onCellDoubleClick,
  selectedRow,
  onRowClick,
}: {
  columns: { name: string; type?: string }[];
  rows: unknown[][];
  className?: string;
  compact?: boolean;
  rowOffset?: number;
  onCellDoubleClick?: (row: number, col: number) => void;
  selectedRow?: number | null;
  onRowClick?: (row: number) => void;
}) {
  if (!columns.length) return <div className="px-3 py-6 text-center text-[13px] text-muted">Statement returned no columns.</div>;
  return (
    <div className={cn("overflow-auto", className)}>
      <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[12px]">
        <thead className="sticky top-0 z-[1]">
          <tr>
            <th className="sticky left-0 z-[2] w-10 border-b border-r border-border bg-surface-2 px-2 py-1.5 text-right font-normal text-muted">#</th>
            {columns.map((c) => (
              <th key={c.name} className="border-b border-r border-border bg-surface-2 px-3 py-1.5 text-left font-sans font-medium whitespace-nowrap">
                <span className="text-[12px] text-text">{c.name}</span>
                {c.type && <span className="ml-1.5 text-[10.5px] font-normal text-muted">{c.type}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(i) : undefined}
              className={cn(
                "group",
                onRowClick && "cursor-pointer",
                selectedRow === i ? "[&>td]:bg-accent-soft" : "hover:[&>td]:bg-surface-2",
              )}
            >
              <td className="sticky left-0 border-b border-r border-border bg-surface px-2 text-right text-muted">{rowOffset + i + 1}</td>
              {r.map((v, j) => (
                <td
                  key={j}
                  onDoubleClick={onCellDoubleClick ? () => onCellDoubleClick(i, j) : undefined}
                  title={formatCell(v)}
                  className={cn(
                    "max-w-[360px] truncate border-b border-r border-border bg-surface px-3 whitespace-nowrap",
                    compact ? "py-1" : "py-1.5",
                    v === null && "italic text-muted",
                    typeof v === "number" && "text-right tabular-nums",
                    typeof v === "boolean" && (v ? "text-ok" : "text-danger"),
                  )}
                >
                  {formatCell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CopyCsv({ columns, rows }: { columns: { name: string }[]; rows: unknown[][] }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        const esc = (v: unknown) => {
          const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [columns.map((c) => esc(c.name)).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
        navigator.clipboard.writeText(csv);
        toast.success(`Copied ${rows.length} rows as CSV`);
      }}
    >
      <Copy className="size-3.5" /> CSV
    </Button>
  );
}

export function RecordTable({ rows, max = 5 }: { rows: Record<string, unknown>[]; max?: number }) {
  if (!rows?.length) return null;
  const cols = Object.keys(rows[0]);
  return (
    <ResultGrid
      compact
      className="max-h-48 rounded-md border border-border"
      columns={cols.map((name) => ({ name }))}
      rows={rows.slice(0, max).map((r) => cols.map((c) => r[c]))}
    />
  );
}
