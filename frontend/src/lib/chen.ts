// Chen-notation ER model reverse-engineered from the live relational schema, plus its layout.
//
// Reverse mapping (the textbook ER -> relational rules, run backwards):
//   table with a PK                          -> ENTITY (rectangle)
//   table whose PK = >=2 FK columns to >=2
//     tables and <=3 other columns           -> M:N RELATIONSHIP (diamond); other columns are
//                                               relationship attributes
//   table whose PK contains an FK column     -> WEAK ENTITY (double rectangle) + IDENTIFYING
//     (and is not a junction)                   relationship (double diamond); remaining PK
//                                               columns are the partial key
//   FK  child.c -> parent                    -> 1:N relationship  parent (1) — child (N)
//   FK whose columns are UNIQUE / the PK     -> 1:1
//   FK columns NOT NULL                      -> TOTAL participation of the child (double line)
import dagre from "@dagrejs/dagre";
import type { Schema, TableInfo } from "@/lib/api";

export type AttrKind = "pk" | "partial" | "fk" | "plain";

export interface ChenAttr {
  id: string;
  owner: string; // entity id or relationship id
  name: string;
  type: string;
  kind: AttrKind;
  nullable: boolean;
}
export interface ChenEntity {
  id: string;
  name: string;
  weak: boolean;
}
export interface ChenEnd {
  entity: string;
  card: "1" | "N" | "M";
  total: boolean;
}
export interface ChenRel {
  id: string;
  name: string;
  identifying: boolean;
  ends: [ChenEnd, ChenEnd];
  via: string; // the FK / junction table that implements it
}
export interface ChenModel {
  entities: ChenEntity[];
  rels: ChenRel[];
  attrs: ChenAttr[];
}

const isJunction = (t: TableInfo) => {
  const fkCols = new Set(t.foreign_keys.flatMap((f) => f.columns));
  const refTables = new Set(t.foreign_keys.map((f) => f.ref_table));
  const pk = t.primary_key;
  const pkAllFk = pk.length >= 2 && pk.every((c) => fkCols.has(c));
  // surrogate-key junctions: (id PK, a_id FK, b_id FK, UNIQUE(a_id, b_id))
  const uniqueFkPair = t.unique.some((u) => u.length >= 2 && u.every((c) => fkCols.has(c)));
  const others = t.columns.filter((c) => !fkCols.has(c.name) && !pk.includes(c.name)).length;
  return refTables.size >= 2 && (pkAllFk || uniqueFkPair) && others <= 3;
};

function relName(t: TableInfo, fk: TableInfo["foreign_keys"][number]) {
  if (fk.comment) return fk.comment;
  // role-named FKs (manager_id -> employee) carry meaning: use the role
  const col = fk.columns[0] ?? "";
  const role = col.replace(/_?id$/i, "");
  if (role && role.toLowerCase() !== fk.ref_table.toLowerCase()) return role;
  return t.name.includes(fk.ref_table) ? "has" : "has";
}

export function toChen(schema: Schema, opts: { showFk: boolean }): ChenModel {
  const tables = schema.tables.filter((t) => t.kind === "table");
  const junctions = new Set(tables.filter(isJunction).map((t) => t.name));
  const entities: ChenEntity[] = [];
  const rels: ChenRel[] = [];
  const attrs: ChenAttr[] = [];

  for (const t of tables) {
    if (junctions.has(t.name)) continue;
    const fkCols = new Set(t.foreign_keys.flatMap((f) => f.columns));
    const weak = t.primary_key.length > 1 && t.primary_key.some((c) => fkCols.has(c));
    entities.push({ id: t.name, name: t.name, weak });
    for (const c of t.columns) {
      const isFk = fkCols.has(c.name);
      if (isFk && !opts.showFk && !t.primary_key.includes(c.name)) continue;
      if (weak && isFk && t.primary_key.includes(c.name)) continue; // owner key comes via the identifying rel
      const kind: AttrKind = t.primary_key.includes(c.name) ? (weak ? "partial" : "pk") : isFk ? "fk" : "plain";
      attrs.push({ id: `${t.name}.${c.name}`, owner: t.name, name: c.name, type: c.type, kind, nullable: c.nullable });
    }
  }
  const entityIds = new Set(entities.map((e) => e.id));

  for (const t of tables) {
    if (junctions.has(t.name)) {
      const [a, b] = t.foreign_keys;
      if (!entityIds.has(a.ref_table) || !entityIds.has(b.ref_table)) continue;
      const id = `rel:${t.name}`;
      rels.push({
        id,
        name: t.name,
        identifying: false,
        via: t.name,
        ends: [
          { entity: a.ref_table, card: "M", total: false },
          { entity: b.ref_table, card: "N", total: false },
        ],
      });
      const fkCols = new Set(t.foreign_keys.flatMap((f) => f.columns));
      for (const c of t.columns)
        if (!fkCols.has(c.name) && !t.primary_key.includes(c.name))
          attrs.push({ id: `${id}.${c.name}`, owner: id, name: c.name, type: c.type, kind: "plain", nullable: c.nullable });
      continue;
    }
    for (const fk of t.foreign_keys) {
      if (!entityIds.has(fk.ref_table) || !entityIds.has(t.name)) continue;
      const cols = t.columns.filter((c) => fk.columns.includes(c.name));
      const total = cols.length > 0 && cols.every((c) => !c.nullable);
      const oneToOne =
        t.unique.some((u) => u.length === fk.columns.length && u.every((c) => fk.columns.includes(c))) ||
        (t.primary_key.length === fk.columns.length && t.primary_key.every((c) => fk.columns.includes(c)));
      const weak = entities.find((e) => e.id === t.name)?.weak && fk.columns.some((c) => t.primary_key.includes(c));
      rels.push({
        id: `rel:${t.name}.${fk.name}`,
        name: relName(t, fk),
        identifying: !!weak,
        via: `${t.name}(${fk.columns.join(", ")})`,
        ends: [
          { entity: fk.ref_table, card: "1", total: false },
          { entity: t.name, card: oneToOne ? "1" : "N", total: total || !!weak },
        ],
      });
    }
  }
  return { entities, rels, attrs };
}

// ------------------------------------------------------------------ geometry / layout

export const ENTITY_H = 44;
export const ATTR_H = 32;
export const REL_H = 58;
const textW = (s: string, px: number) => s.length * px;
export const entityW = (name: string) => Math.max(120, textW(name.toUpperCase(), 9) + 32);
export const attrW = (name: string, kind: AttrKind) => Math.max(76, textW(name, 7.1) + (kind === "fk" ? 46 : 28));
export const relW = (name: string) => Math.max(112, textW(name, 7.8) + 60);

export interface Placed {
  id: string;
  kind: "entity" | "attr" | "rel";
  x: number; // centre
  y: number;
  w: number;
  h: number;
}

/**
 * Spread n items over the angular gaps left by `blocked` directions (relationship lines).
 * Each gap g gets a capacity  cap = floor((g - 2·margin) / minSep) + 1 (0 if g < 2·margin),
 * where minSep is the angle two ellipses need on a circle of radius R. Items are then
 * apportioned by Hamilton's largest-remainder method, never exceeding a gap's capacity.
 * Returns null when the gaps cannot hold n items at this radius (caller grows R).
 */
function spreadAngles(n: number, blocked: number[], minSep: number): number[] | null {
  if (n === 0) return [];
  const TAU = Math.PI * 2;
  const b = [...new Set(blocked.map((a) => ((a % TAU) + TAU) % TAU))].sort((x, y) => x - y);
  if (b.length === 0) {
    if (TAU / n < minSep) return null;
    return Array.from({ length: n }, (_, i) => -Math.PI / 2 + (i * TAU) / n);
  }
  const margin = minSep * 0.6; // keep ellipses off the relationship lines themselves
  const gaps = b.map((a, i) => {
    const next = i + 1 < b.length ? b[i + 1] : b[0] + TAU;
    const size = next - a;
    const cap = size < 2 * margin ? 0 : Math.floor((size - 2 * margin) / minSep) + 1;
    return { start: a, size, cap };
  });
  if (gaps.reduce((s, g) => s + g.cap, 0) < n) return null;
  const usable = gaps.filter((g) => g.cap > 0);
  const total = usable.reduce((s, g) => s + g.size, 0);
  const counts = new Map(usable.map((g) => [g, Math.min(g.cap, Math.floor((n * g.size) / total))]));
  let left = n - [...counts.values()].reduce((s, c) => s + c, 0);
  while (left > 0) {
    // give the next item to the gap with the most room per item that still has capacity
    const g = usable.filter((x) => counts.get(x)! < x.cap).sort((x, y) => y.size / (counts.get(y)! + 1) - x.size / (counts.get(x)! + 1))[0];
    counts.set(g, counts.get(g)! + 1);
    left--;
  }
  // m items spread edge-to-edge over the usable span: spacing = span/(m-1) >= minSep (by cap)
  const out: number[] = [];
  for (const g of usable) {
    const m = counts.get(g)!;
    const span = g.size - 2 * margin;
    for (let k = 0; k < m; k++) out.push(m === 1 ? g.start + g.size / 2 : g.start + margin + (span * k) / (m - 1));
  }
  return out;
}

/** Radius so adjacent ellipses (width w, angular spacing Δ) don't overlap: chord 2R·sin(Δ/2) ≥ w + pad. */
function radiusFor(n: number, maxW: number, base: number) {
  if (n <= 1) return base;
  const delta = (Math.PI * 2 * 0.8) / n; // ~80% of the circle is available on average
  return Math.max(base, (maxW + 10) / (2 * Math.sin(delta / 2)));
}

export function layoutChen(m: ChenModel, dir: "LR" | "TB") {
  const byOwner = new Map<string, ChenAttr[]>();
  for (const a of m.attrs) byOwner.set(a.owner, [...(byOwner.get(a.owner) ?? []), a]);

  // 1) lay out ENTITIES only. A cluster = entity + its attribute halo; ranks are separated by one
  //    diamond width so every relationship diamond fits between the two entities it links.
  const radius = new Map<string, number>();
  const g = new dagre.graphlib.Graph({ multigraph: true });
  const maxRelW = Math.max(112, ...m.rels.map((r) => relW(r.name)));
  // gap between halos >= one diamond width => the midpoint diamond never intrudes into a halo
  g.setGraph({ rankdir: dir, nodesep: 28, ranksep: maxRelW + 16, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const e of m.entities) {
    const as = byOwner.get(e.id) ?? [];
    const maxW = Math.max(0, ...as.map((a) => attrW(a.name, a.kind)));
    const R = radiusFor(as.length, maxW, entityW(e.name) / 2 + 56);
    radius.set(e.id, R);
    g.setNode(e.id, { width: 2 * R + maxW * 0.8, height: 2 * R * 0.72 + ATTR_H + 8 });
  }
  for (const r of m.rels) if (r.ends[0].entity !== r.ends[1].entity) g.setEdge(r.ends[0].entity, r.ends[1].entity, {}, r.id);
  dagre.layout(g);

  const pos = new Map<string, { x: number; y: number }>();
  for (const e of m.entities) pos.set(e.id, g.node(e.id) as { x: number; y: number });

  // 2) each diamond sits on the midpoint of its two entities (short, direct Chen lines).
  //    m parallel relationships between the same pair fan out along the normal:
  //    offset_k = (k - (m-1)/2) * (REL_H + 26)
  const pairKey = (r: ChenRel) => [r.ends[0].entity, r.ends[1].entity].sort().join("|");
  const groups = new Map<string, ChenRel[]>();
  for (const r of m.rels) groups.set(pairKey(r), [...(groups.get(pairKey(r)) ?? []), r]);
  for (const rs of groups.values()) {
    rs.forEach((r, k) => {
      // canonical (sorted) orientation, so relationships declared A→B and B→A share one normal
      const [ea, eb] = [r.ends[0].entity, r.ends[1].entity].sort();
      const a = pos.get(ea)!;
      const b = pos.get(eb)!;
      if (r.ends[0].entity === r.ends[1].entity) {
        // recursive relationship: loop the diamond above the entity, outside its attribute halo
        const R = radius.get(a === b ? r.ends[0].entity : "") ?? 120;
        pos.set(r.id, { x: a.x + (k - (rs.length - 1) / 2) * (relW(r.name) + 20), y: a.y - R * 0.72 - REL_H - 30 });
        return;
      }
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const off = (k - (rs.length - 1) / 2) * (REL_H + 26);
      pos.set(r.id, { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off });
      radius.set(r.id, 62);
    });
  }

  const placed: Placed[] = [];
  for (const e of m.entities) placed.push({ id: e.id, kind: "entity", ...pos.get(e.id)!, w: entityW(e.name), h: ENTITY_H });
  for (const r of m.rels) placed.push({ id: r.id, kind: "rel", ...pos.get(r.id)!, w: relW(r.name), h: REL_H });

  // 3) attributes orbit their owner (entity or relationship), avoiding the owner's own lines
  for (const [owner, as] of byOwner) {
    const c = pos.get(owner);
    if (!c) continue;
    const blocked = m.rels
      .flatMap((r) =>
        r.id === owner ? r.ends.map((e) => pos.get(e.entity)!) : r.ends.some((e) => e.entity === owner) ? [pos.get(r.id)!] : [],
      )
      .map((p) => Math.atan2(p.y - c.y, p.x - c.x));
    // key attributes first so they land in the biggest, most readable gap
    const order = [...as].sort((a, b) => rank(a.kind) - rank(b.kind));
    const maxW = Math.max(...order.map((a) => attrW(a.name, a.kind)));
    let R = radius.get(owner) ?? 120;
    let angles: number[] | null = null;
    for (let i = 0; i < 12 && !angles; i++) {
      const minSep = 2 * Math.asin(Math.min(1, (maxW + 18) / (2 * R))); // neighbours at the top/bottom sit side by side: need ~full width
      angles = spreadAngles(order.length, blocked, minSep);
      if (!angles) R *= 1.12; // not enough room between the lines: grow the orbit and retry
    }
    angles ??= spreadAngles(order.length, [], 0)!;
    angles.forEach((ang, i) => {
      const a = order[i];
      // ellipse orbit (wider than tall) matches the landscape shape of the labels
      placed.push({ id: a.id, kind: "attr", x: c.x + R * Math.cos(ang), y: c.y + R * 0.72 * Math.sin(ang), w: attrW(a.name, a.kind), h: ATTR_H });
    });
  }

  // 4) tight bounding box of what was actually drawn, normalised to start at (pad, pad)
  const pad = 20;
  const minX = Math.min(...placed.map((p) => p.x - p.w / 2)) - pad;
  const minY = Math.min(...placed.map((p) => p.y - p.h / 2)) - pad;
  const maxX = Math.max(...placed.map((p) => p.x + p.w / 2)) + pad;
  const maxY = Math.max(...placed.map((p) => p.y + p.h / 2)) + pad;
  for (const p of placed) {
    p.x -= minX;
    p.y -= minY;
  }
  return { placed, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Sub-model: one entity plus everything one relationship away (focus mode for big schemas). */
export function focusChen(m: ChenModel, entity: string | null): ChenModel {
  if (!entity) return m;
  const rels = m.rels.filter((r) => r.ends.some((e) => e.entity === entity));
  const keep = new Set([entity, ...rels.flatMap((r) => r.ends.map((e) => e.entity))]);
  const relIds = new Set(rels.map((r) => r.id));
  return {
    entities: m.entities.filter((e) => keep.has(e.id)),
    rels,
    attrs: m.attrs.filter((a) => (keep.has(a.owner) && (a.owner === entity || a.kind !== "plain" || keep.size <= 4)) || relIds.has(a.owner)),
  };
}

const rank = (k: AttrKind) => (k === "pk" || k === "partial" ? 0 : k === "fk" ? 2 : 1);

/** Point where the segment from a shape's centre towards (tx, ty) leaves the shape outline. */
export function boundary(kind: Placed["kind"], cx: number, cy: number, w: number, h: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const a = w / 2;
  const b = h / 2;
  let s: number;
  if (kind === "entity") s = Math.min(a / Math.abs(dx || 1e-9), b / Math.abs(dy || 1e-9));
  else if (kind === "attr") s = 1 / Math.sqrt((dx / a) ** 2 + (dy / b) ** 2);
  else s = 1 / (Math.abs(dx) / a + Math.abs(dy) / b); // diamond: |x|/a + |y|/b = 1
  return { x: cx + dx * s, y: cy + dy * s };
}
