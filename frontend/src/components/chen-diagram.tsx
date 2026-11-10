"use client";

import { Download, Maximize2, Minus, Plus } from "lucide-react";
import * as React from "react";
import { useIsDark } from "@/components/sql-editor";
import { Button, Switch } from "@/components/ui";
import type { Schema } from "@/lib/api";
import { boundary, focusChen, layoutChen, toChen, type ChenAttr, type ChenRel, type Placed } from "@/lib/chen";

type Palette = Record<"bg" | "surface" | "surface2" | "text" | "text2" | "muted" | "accent" | "accentSoft" | "info" | "border", string>;

/** Concrete colours (not var(--x)) so the exported PNG/SVG looks identical outside the app. */
function usePalette(): Palette {
  const dark = useIsDark();
  return React.useMemo(() => {
    const fallback: Palette = dark
      ? { bg: "#0a0c10", surface: "#11151c", surface2: "#161b23", text: "#eef1f5", text2: "#b8c0cc", muted: "#8b94a3", accent: "#8b7cff", accentSoft: "#1c1640", info: "#8beaf3", border: "#2e3643" }
      : { bg: "#f4f5f0", surface: "#ffffff", surface2: "#f7f8f4", text: "#0a0c10", text2: "#4a505b", muted: "#646a75", accent: "#6d5cf5", accentSoft: "#eeebff", info: "#0d6f7b", border: "#cdd1c4" };
    if (typeof window === "undefined") return fallback;
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    return {
      bg: v("--bg", fallback.bg), surface: v("--surface", fallback.surface), surface2: v("--surface-2", fallback.surface2),
      text: v("--text", fallback.text), text2: v("--text-2", fallback.text2), muted: v("--muted", fallback.muted),
      accent: v("--accent", fallback.accent), accentSoft: v("--accent-soft", fallback.accentSoft), info: v("--info", fallback.info),
      border: v("--border-strong", fallback.border),
    };
  }, [dark]);
}

const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

/**
 * ER diagrams read left-to-right (the textbook convention), so LR is the default. Switch to
 * top-to-bottom only when the space is clearly portrait (phones), or when LR would be unreadably
 * small (fitted scale < 0.45) and TB is at least 1.5x larger. The choice depends only on the
 * current size, so it is identical however the page was reached.
 */
export function readingDirection(lr: { width: number; height: number }, tb: { width: number; height: number }, box: { w: number; h: number }): "lr" | "tb" {
  const fit = (l: { width: number; height: number }) => Math.min(box.w / l.width, box.h / l.height);
  if (box.h > box.w * 1.15) return "tb";
  return fit(lr) < 0.45 && fit(tb) > fit(lr) * 1.5 ? "tb" : "lr";
}

export function ChenDiagram({ schema, box }: { schema: Schema; box: { w: number; h: number } }) {
  const P = usePalette();
  const [showFk, setShowFk] = React.useState(true);
  const [focus, setFocus] = React.useState<string | null>(null);
  const fullModel = React.useMemo(() => toChen(schema, { showFk }), [schema, showFk]);
  const focusValid = focus && fullModel.entities.some((e) => e.id === focus) ? focus : null;
  const model = React.useMemo(() => focusChen(fullModel, focusValid), [fullModel, focusValid]);
  // Lay out both directions once per model; choose with the CURRENT box on every render.
  // (Memoising the choice froze whatever size was known at mount: the orientation bug.)
  const layouts = React.useMemo(() => ({ lr: layoutChen(model, "LR"), tb: layoutChen(model, "TB") }), [model]);
  const lay = layouts[readingDirection(layouts.lr, layouts.tb, box)];

  const svgRef = React.useRef<SVGSVGElement>(null);
  const full = React.useMemo(() => ({ x: 0, y: 0, w: lay.width, h: lay.height }), [lay]);
  const [vb, setVb] = React.useState(full);
  const [lastFull, setLastFull] = React.useState(full);
  if (lastFull !== full) {
    setLastFull(full);
    setVb(full);
  }

  // readable if one diagram unit renders at >= 0.5px; below that, suggest focus mode
  const fitScale = Math.min(box.w / lay.width, box.h / lay.height);
  const at = new Map(lay.placed.map((p) => [p.id, p]));
  const attrOf = new Map(model.attrs.map((a) => [a.id, a]));
  const relOf = new Map(model.rels.map((r) => [r.id, r]));

  // ---- pan & zoom on the viewBox (zoom about the cursor: keep the point under it fixed)
  const onWheel = (e: React.WheelEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const k = Math.exp(e.deltaY * 0.0015);
    const scale = Math.max(vb.w / r.width, vb.h / r.height);
    const px = vb.x + (e.clientX - r.left - (r.width - vb.w / scale) / 2) * scale;
    const py = vb.y + (e.clientY - r.top - (r.height - vb.h / scale) / 2) * scale;
    const w = Math.min(full.w * 4, Math.max(full.w / 8, vb.w * k));
    const h = (vb.h * w) / vb.w;
    setVb({ x: px - ((px - vb.x) * w) / vb.w, y: py - ((py - vb.y) * h) / vb.h, w, h });
  };
  const drag = React.useRef<{ x: number; y: number; vb: typeof vb } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vb };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || !svg) return;
    const r = svg.getBoundingClientRect();
    const scale = Math.max(d.vb.w / r.width, d.vb.h / r.height);
    setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.x) * scale, y: d.vb.y - (e.clientY - d.y) * scale });
  };
  const zoom = (k: number) => setVb((v) => ({ x: v.x + (v.w * (1 - k)) / 2, y: v.y + (v.h * (1 - k)) / 2, w: v.w * k, h: v.h * k }));

  async function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("viewBox", `0 0 ${full.w} ${full.h}`);
    const scale = 2;
    clone.setAttribute("width", String(full.w * scale));
    clone.setAttribute("height", String(full.h * scale));
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = full.w * scale;
    c.height = full.h * scale;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = P.surface;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement("a");
    a.download = "er-diagram.png";
    a.href = c.toDataURL("image/png");
    a.click();
  }

  // ---- lines
  const lines: React.ReactNode[] = [];
  for (const a of model.attrs) {
    const p = at.get(a.id);
    const o = at.get(a.owner);
    if (!p || !o) continue;
    const s = boundary(o.kind, o.x, o.y, o.w, o.h, p.x, p.y);
    const t = boundary(p.kind, p.x, p.y, p.w, p.h, o.x, o.y);
    lines.push(<line key={`l-${a.id}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={P.muted} strokeWidth={1.1} />);
  }
  for (const r of model.rels) {
    const d = at.get(r.id);
    if (!d) continue;
    r.ends.forEach((end, i) => {
      const e = at.get(end.entity);
      if (!e) return;
      const s = boundary("entity", e.x, e.y, e.w, e.h, d.x, d.y);
      const t = boundary("rel", d.x, d.y, d.w, d.h, e.x, e.y);
      const len = Math.hypot(t.x - s.x, t.y - s.y) || 1;
      const nx = -(t.y - s.y) / len;
      const ny = (t.x - s.x) / len;
      if (end.total) {
        // total participation: two parallel lines, 2.4px either side of the centre line
        for (const k of [-2.4, 2.4])
          lines.push(<line key={`r-${r.id}-${i}-${k}`} x1={s.x + nx * k} y1={s.y + ny * k} x2={t.x + nx * k} y2={t.y + ny * k} stroke={P.text2} strokeWidth={1.3} />);
      } else {
        lines.push(<line key={`r-${r.id}-${i}`} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={P.text2} strokeWidth={1.4} />);
      }
      // cardinality label: 30% of the way from the diamond towards the entity, nudged off the line
      const lx = t.x + (s.x - t.x) * 0.3 + nx * 11;
      const ly = t.y + (s.y - t.y) * 0.3 + ny * 11;
      lines.push(
        <text key={`c-${r.id}-${i}`} x={lx} y={ly} fill={P.accent} fontFamily={FONT} fontSize={13} fontWeight={700} textAnchor="middle" dominantBaseline="central">
          {end.card}
        </text>,
      );
    });
  }

  return (
    <div className="relative h-full w-full select-none" style={{ background: P.surface }}>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full cursor-grab active:cursor-grabbing"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        role="img"
        aria-label="Entity-relationship diagram in Chen notation"
      >
        <rect x={-1e4} y={-1e4} width={3e4} height={3e4} fill={P.surface} />
        {lines}
        {lay.placed.map((p) =>
          p.kind === "entity" ? (
            <g
              key={p.id}
              className="cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setFocus(focusValid === p.id ? null : p.id)}
            >
              <EntityShape p={p} weak={!!model.entities.find((e) => e.id === p.id)?.weak} focused={focusValid === p.id} P={P} />
            </g>
          ) : p.kind === "rel" ? (
            <RelShape key={p.id} p={p} r={relOf.get(p.id)!} P={P} />
          ) : (
            <AttrShape key={p.id} p={p} a={attrOf.get(p.id)!} P={P} />
          ),
        )}
      </svg>

      <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 text-xs">
        <select
          aria-label="Focus on entity"
          value={focusValid ?? ""}
          onChange={(e) => setFocus(e.target.value || null)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text shadow-card"
        >
          <option value="">All entities ({fullModel.entities.length})</option>
          {fullModel.entities.map((e) => (
            <option key={e.id} value={e.id}>
              Focus: {e.name} + neighbours
            </option>
          ))}
        </select>
        {!focusValid && fitScale < 0.5 && (
          <span className="rounded-md bg-warn-soft px-2 py-1.5 text-warn">Large schema: click an entity to focus on its relationships</span>
        )}
        {focusValid && <span className="rounded-md bg-surface/90 px-2 py-1.5 text-text-2">Click the entity again to show everything</span>}
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface/90 p-1 shadow-card backdrop-blur">
        <label className="flex items-center gap-2 px-2 text-xs text-text-2">
          <Switch checked={showFk} onCheckedChange={setShowFk} /> FK attributes
        </label>
        <Button size="icon" variant="ghost" onClick={() => zoom(0.8)} aria-label="Zoom in"><Plus className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => zoom(1.25)} aria-label="Zoom out"><Minus className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => setVb(full)} aria-label="Fit"><Maximize2 className="size-3.5" /></Button>
        <Button size="sm" variant="ghost" onClick={exportPng}><Download className="size-3.5" /> PNG</Button>
      </div>
      <Legend P={P} />
    </div>
  );
}

function EntityShape({ p, weak, focused, P }: { p: Placed; weak: boolean; focused: boolean; P: Palette }) {
  const x = p.x - p.w / 2;
  const y = p.y - p.h / 2;
  return (
    <g>
      <title>{`Entity ${p.id}${weak ? " (weak)" : ""} · click to focus`}</title>
      <rect x={x} y={y} width={p.w} height={p.h} fill={focused ? P.accentSoft : P.surface} stroke={P.accent} strokeWidth={focused ? 2.6 : 1.8} />
      {weak && <rect x={x + 4} y={y + 4} width={p.w - 8} height={p.h - 8} fill="none" stroke={P.accent} strokeWidth={1.2} />}
      <text x={p.x} y={p.y} fill={P.text} fontFamily={FONT} fontSize={14.5} fontWeight={700} letterSpacing={0.6} textAnchor="middle" dominantBaseline="central">
        {p.id.toUpperCase()}
      </text>
    </g>
  );
}

function RelShape({ p, r, P }: { p: Placed; r: ChenRel; P: Palette }) {
  const pts = (k: number) => `${p.x},${p.y - (p.h / 2) * k} ${p.x + (p.w / 2) * k},${p.y} ${p.x},${p.y + (p.h / 2) * k} ${p.x - (p.w / 2) * k},${p.y}`;
  return (
    <g>
      <title>{`Relationship ${r.name}, implemented by ${r.via}`}</title>
      <polygon points={pts(1)} fill={P.accentSoft} stroke={P.text2} strokeWidth={1.5} />
      {r.identifying && <polygon points={pts(0.8)} fill="none" stroke={P.text2} strokeWidth={1.1} />}
      <text x={p.x} y={p.y} fill={P.text} fontFamily={FONT} fontSize={13} fontWeight={600} textAnchor="middle" dominantBaseline="central">
        {r.name}
      </text>
    </g>
  );
}

function AttrShape({ p, a, P }: { p: Placed; a: ChenAttr; P: Palette }) {
  const key = a.kind === "pk" || a.kind === "partial";
  const label = a.name;
  const tw = label.length * 7.1;
  return (
    <g>
      <title>{`${a.name}: ${a.type}${a.kind === "pk" ? " · primary key" : a.kind === "partial" ? " · partial key" : a.kind === "fk" ? " · foreign key" : ""}${a.nullable ? "" : " · NOT NULL"}`}</title>
      <ellipse
        cx={p.x}
        cy={p.y}
        rx={p.w / 2}
        ry={p.h / 2}
        fill={P.surface}
        stroke={a.kind === "fk" ? P.info : key ? P.accent : P.text2}
        strokeWidth={key ? 1.6 : 1.1}
        strokeDasharray={a.kind === "fk" ? "4 3" : undefined}
      />
      <text
        x={a.kind === "fk" ? p.x - 9 : p.x}
        y={p.y}
        fill={P.text}
        fontFamily={FONT}
        fontSize={12.5}
        fontWeight={key ? 700 : 400}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
      {key && (
        <line
          x1={p.x - tw / 2}
          x2={p.x + tw / 2}
          y1={p.y + 8}
          y2={p.y + 8}
          stroke={P.text}
          strokeWidth={1.1}
          strokeDasharray={a.kind === "partial" ? "3 2" : undefined}
        />
      )}
      {a.kind === "fk" && (
        <text x={p.x + tw / 2 - 2} y={p.y} fill={P.info} fontFamily={FONT} fontSize={9} fontWeight={700} dominantBaseline="central">
          FK
        </text>
      )}
    </g>
  );
}

function Item({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="46" height="24" viewBox="0 0 46 24" aria-hidden>
        {icon}
      </svg>
      <span>{label}</span>
    </div>
  );
}

function Legend({ P }: { P: Palette }) {
  return (
    <div className="absolute bottom-3 left-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-border bg-surface/95 px-3 py-2.5 text-[11px] text-text-2 shadow-card backdrop-blur max-sm:hidden">
      <Item label="Entity" icon={<rect x="3" y="5" width="40" height="14" fill="none" stroke={P.accent} strokeWidth="1.5" />} />
      <Item label="Weak entity" icon={<><rect x="3" y="4" width="40" height="16" fill="none" stroke={P.accent} strokeWidth="1.3" /><rect x="6" y="7" width="34" height="10" fill="none" stroke={P.accent} strokeWidth="1" /></>} />
      <Item label="Attribute" icon={<ellipse cx="23" cy="12" rx="19" ry="8" fill="none" stroke={P.text2} />} />
      <Item label="Primary key (underlined)" icon={<><ellipse cx="23" cy="12" rx="19" ry="8" fill="none" stroke={P.accent} strokeWidth="1.4" /><line x1="15" x2="31" y1="15" y2="15" stroke={P.text} /></>} />
      <Item label="Foreign key (dashed)" icon={<ellipse cx="23" cy="12" rx="19" ry="8" fill="none" stroke={P.info} strokeDasharray="4 3" />} />
      <Item label="Partial key (weak entity)" icon={<><ellipse cx="23" cy="12" rx="19" ry="8" fill="none" stroke={P.accent} /><line x1="15" x2="31" y1="15" y2="15" stroke={P.text} strokeDasharray="3 2" /></>} />
      <Item label="Relationship" icon={<polygon points="23,2 43,12 23,22 3,12" fill={P.accentSoft} stroke={P.text2} />} />
      <Item label="Identifying relationship" icon={<><polygon points="23,2 43,12 23,22 3,12" fill="none" stroke={P.text2} /><polygon points="23,5 37,12 23,19 9,12" fill="none" stroke={P.text2} /></>} />
      <Item label="Total participation" icon={<><line x1="3" x2="43" y1="10" y2="10" stroke={P.text2} /><line x1="3" x2="43" y1="14" y2="14" stroke={P.text2} /></>} />
      <Item label="Cardinality 1 / N / M" icon={<><line x1="3" x2="43" y1="12" y2="12" stroke={P.text2} /><text x="23" y="8" fill={P.accent} fontSize="9" fontWeight="700" textAnchor="middle">N</text></>} />
    </div>
  );
}
