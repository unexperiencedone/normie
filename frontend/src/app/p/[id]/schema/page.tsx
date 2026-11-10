"use client";

import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { KeyRound, Link2, Network, Sparkles } from "lucide-react";
import * as React from "react";
import { useAssistant } from "@/components/assistant/assistant";
import { ChenDiagram, readingDirection } from "@/components/chen-diagram";
import { Button, EmptyState, PageHeader, Spinner } from "@/components/ui";
import type { TableInfo } from "@/lib/api";
import { useSchema } from "@/lib/project";
import { useIsDark } from "@/components/sql-editor";
import { cn } from "@/lib/utils";

const W = 260;
const ROW = 22;
const HEAD = 34;

type TableNodeData = { table: TableInfo; dir: "LR" | "TB" };

function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const t = data.table;
  const tb = data.dir === "TB";
  return (
    <div className="overflow-hidden rounded-lg border border-border-strong bg-surface shadow-card" style={{ width: W }}>
      <Handle type="target" position={tb ? Position.Top : Position.Left} className="!size-2 !border-0 !bg-accent" />
      <Handle type="source" position={tb ? Position.Bottom : Position.Right} className="!size-2 !border-0 !bg-info" />
      <div className={cn("flex items-center justify-between px-3", t.kind === "table" ? "bg-surface-3" : "bg-info-soft")} style={{ height: HEAD }}>
        <span className="truncate font-mono text-[12.5px] font-semibold">{t.name}</span>
        <span className="text-[10.5px] text-muted">{t.kind === "table" ? `~${t.row_estimate} rows` : t.kind}</span>
      </div>
      {t.columns.map((c) => (
        <div key={c.name} className="flex items-center gap-1.5 border-t border-border px-3 font-mono text-[11.5px]" style={{ height: ROW }}>
          <span className="flex w-3.5 justify-center">
            {c.is_pk ? <KeyRound className="size-3 text-accent" /> : c.is_fk ? <Link2 className="size-3 text-info" /> : null}
          </span>
          <span className={cn("truncate", c.is_pk && "font-semibold")}>{c.name}</span>
          <span className="ml-auto truncate pl-2 text-[10.5px] text-muted">{c.type}</span>
          {!c.nullable && !c.is_pk && <span className="text-[9px] text-warn" title="NOT NULL">●</span>}
        </div>
      ))}
    </div>
  );
}

const nodeTypes = { table: TableNode };

type Dir = "LR" | "TB";

function layout(tables: TableInfo[], dir: Dir): { nodes: Node<TableNodeData>[]; edges: Edge[]; width: number; height: number } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: dir === "LR" ? 40 : 48, ranksep: dir === "LR" ? 110 : 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of tables) g.setNode(t.name, { width: W, height: HEAD + t.columns.length * ROW });
  const edges: Edge[] = [];
  for (const t of tables)
    for (const fk of t.foreign_keys) {
      if (!tables.find((x) => x.name === fk.ref_table)) continue;
      g.setEdge(fk.ref_table, t.name);
      edges.push({
        id: `${t.name}.${fk.name}`,
        source: fk.ref_table,
        target: t.name,
        type: "smoothstep",
        label: `${fk.columns.join(", ")} · 1:N`,
        labelShowBg: true,
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        labelStyle: { fontSize: 10, fontFamily: "var(--font-dm-mono), monospace", fill: "var(--text-2)" },
        labelBgStyle: { fill: "var(--surface-2)", stroke: "var(--border)" },
        style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted)" },
      });
    }
  dagre.layout(g);
  const nodes = tables.map((t) => {
    const n = g.node(t.name);
    // explicit size => fitView is exact on first paint (no wait for DOM measurement)
    return {
      id: t.name,
      type: "table",
      position: { x: n.x - n.width / 2, y: n.y - n.height / 2 },
      width: W,
      height: HEAD + t.columns.length * ROW,
      data: { table: t, dir },
    };
  });
  const { width = 1, height = 1 } = g.graph();
  return { nodes, edges, width, height };
}



export default function SchemaPage() {
  const schema = useSchema();
  const { ask } = useAssistant();
  const dark = useIsDark();
  const boxRef = React.useRef<HTMLDivElement>(null);
  // null until measured: never lay out against a guessed size (that froze the wrong orientation)
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [schema.data]);
  const [view, setView] = React.useState<"er" | "tables">("er");
  // both directions are laid out once per schema; the choice between them follows the live size
  const layouts = React.useMemo(() => {
    const t = schema.data?.tables ?? [];
    return { lr: layout(t, "LR"), tb: layout(t, "TB") };
  }, [schema.data]);
  const dir = box ? readingDirection(layouts.lr, layouts.tb, box) : "lr";
  const graph = layouts[dir];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Schema diagram"
        description={
          view === "er"
            ? "Chen-notation ER diagram, reverse-engineered from the live schema: FK → relationship, junction table → M:N, composite PK with FK → weak entity."
            : "Physical table diagram read straight from the PostgreSQL catalog."
        }
        actions={
          <>
          <div className="flex rounded-md border border-border bg-surface-2 p-0.5 text-xs" role="tablist" aria-label="Diagram type">
            {([["er", "ER diagram"], ["tables", "Table diagram"]] as const).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={view === k}
                onClick={() => setView(k)}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${view === k ? "bg-surface text-text shadow-card" : "text-text-2 hover:text-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => ask("Review my schema: is it normalised (3NF/BCNF)? Point out missing constraints, indexes or anomalies and propose fixes.")}>
            <Sparkles className="size-3.5 text-accent" /> Review with copilot
          </Button>
          </>
        }
      />
      <div ref={boxRef} className="min-h-0 flex-1">
        {schema.isLoading || !box ? (
          <div className="flex justify-center p-16"><Spinner /></div>
        ) : !schema.data?.tables.length ? (
          <EmptyState icon={<Network className="size-5" />} title="Nothing to draw yet">Tables and their relationships will appear here.</EmptyState>
        ) : view === "er" ? (
          <ChenDiagram schema={schema.data} box={box} />
        ) : (
          <ReactFlow
            key={`${dir}-${graph.nodes.length}`}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 1.15 }}
            minZoom={0.2}
            colorMode={dark ? "dark" : "light"}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
          >
            <Background gap={20} size={1} color="var(--border)" />
            <Controls showInteractive={false} />
            {graph.nodes.length >= 8 && (
              // SVG fill attributes cannot resolve CSS variables: use concrete theme colours
              <MiniMap
                pannable
                zoomable
                nodeColor={dark ? "#2e3643" : "#cdd1c4"}
                maskColor={dark ? "rgb(0 0 0 / 0.45)" : "rgb(0 0 0 / 0.08)"}
                bgColor={dark ? "#11151c" : "#ffffff"}
              />
            )}
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
