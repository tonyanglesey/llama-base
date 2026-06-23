"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SchemaTable = { schema: string; name: string };
type ForeignKey = {
  name: string;
  schema: string;
  table: string;
  refSchema: string;
  refTable: string;
};
type Resp =
  | { ok: true; tables: SchemaTable[]; foreignKeys: ForeignKey[] }
  | { ok: false; error: string };

type Pt = { x: number; y: number };

const SCHEMA_COLORS = ["#b8f24a", "#6db8f2", "#e9b949", "#e879c4", "#7ee0a0"];
const tid = (schema: string, name: string) => `${schema}.${name}`;

// Fruchterman–Reingold force layout — no dependencies. Deterministic (seeded
// on a circle) so the same schema always lays out the same way.
function computeLayout(
  ids: string[],
  edges: { s: string; t: string }[],
  widthOf: Record<string, number>
): { pos: Record<string, Pt>; viewBox: string } {
  const N = ids.length;
  if (N === 0) return { pos: {}, viewBox: "0 0 100 100" };
  const W = 900;
  const H = 560;
  const k = 0.9 * Math.sqrt((W * H) / N);
  const pos: Record<string, Pt> = {};
  ids.forEach((id, i) => {
    const a = (2 * Math.PI * i) / N;
    pos[id] = { x: W / 2 + W * 0.34 * Math.cos(a), y: H / 2 + H * 0.34 * Math.sin(a) };
  });
  let temp = W * 0.1;
  for (let it = 0; it < 500; it++) {
    const disp: Record<string, Pt> = {};
    for (const id of ids) disp[id] = { x: 0, y: 0 };
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = ids[i];
        const b = ids[j];
        const dx = pos[a].x - pos[b].x;
        const dy = pos[a].y - pos[b].y;
        const d = Math.hypot(dx, dy) || 0.01;
        const f = (k * k) / d;
        disp[a].x += (dx / d) * f;
        disp[a].y += (dy / d) * f;
        disp[b].x -= (dx / d) * f;
        disp[b].y -= (dy / d) * f;
      }
    }
    for (const e of edges) {
      if (e.s === e.t || !pos[e.s] || !pos[e.t]) continue;
      const dx = pos[e.s].x - pos[e.t].x;
      const dy = pos[e.s].y - pos[e.t].y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d * d) / k;
      disp[e.s].x -= (dx / d) * f;
      disp[e.s].y -= (dy / d) * f;
      disp[e.t].x += (dx / d) * f;
      disp[e.t].y += (dy / d) * f;
    }
    for (const id of ids) {
      disp[id].x += (W / 2 - pos[id].x) * 0.03;
      disp[id].y += (H / 2 - pos[id].y) * 0.03;
      const d = Math.hypot(disp[id].x, disp[id].y) || 0.01;
      const lim = Math.min(d, temp);
      pos[id].x += (disp[id].x / d) * lim;
      pos[id].y += (disp[id].y / d) * lim;
      // keep within the frame so disconnected clusters stay compact + legible
      pos[id].x = Math.max(0, Math.min(W, pos[id].x));
      pos[id].y = Math.max(0, Math.min(H, pos[id].y));
    }
    temp = Math.max(temp * 0.97, 1);
  }

  // Overlap-removal pass: the force sim treats nodes as points, so wide sibling
  // labels can still collide. Nudge any overlapping boxes apart along the axis
  // of least penetration until they're clear.
  const GAP = 16;
  for (let pass = 0; pass < 50; pass++) {
    let moved = false;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = ids[i];
        const b = ids[j];
        const hwA = (widthOf[a] ?? 70) / 2 + GAP / 2;
        const hwB = (widthOf[b] ?? 70) / 2 + GAP / 2;
        const hh = NODE_H / 2 + GAP / 2;
        const dx = pos[b].x - pos[a].x;
        const dy = pos[b].y - pos[a].y;
        const ox = hwA + hwB - Math.abs(dx);
        const oy = hh + hh - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (ox < oy) {
            const s = (ox / 2) * (dx < 0 ? -1 : 1);
            pos[a].x -= s;
            pos[b].x += s;
          } else {
            const s = (oy / 2) * (dy < 0 ? -1 : 1);
            pos[a].y -= s;
            pos[b].y += s;
          }
        }
      }
    }
    if (!moved) break;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    minX = Math.min(minX, pos[id].x);
    minY = Math.min(minY, pos[id].y);
    maxX = Math.max(maxX, pos[id].x);
    maxY = Math.max(maxY, pos[id].y);
  }
  const pad = 90;
  return {
    pos,
    viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${
      maxY - minY + 2 * pad
    }`,
  };
}

const nodeW = (label: string) => Math.max(72, label.length * 8 + 22);
const NODE_H = 32;
const FONT = 14;

function borderPoint(from: Pt, to: Pt, halfW: number, halfH: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return to;
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
  return { x: to.x - dx * scale, y: to.y - dy * scale };
}

export default function SchemaMap({ db }: { db: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [pos, setPos] = useState<Record<string, Pt>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/relations?db=${encodeURIComponent(db)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Resp) => setData(d))
      .catch((e) =>
        setData({ ok: false, error: e instanceof Error ? e.message : "failed" })
      )
      .finally(() => setLoading(false));
  }, [db]);

  const model = useMemo(() => {
    if (!data?.ok) return null;
    const colorOf = new Map<string, string>();
    let ci = 0;
    const schemaColor = (s: string) => {
      if (s === "public") return SCHEMA_COLORS[0];
      if (!colorOf.has(s)) {
        ci += 1;
        colorOf.set(s, SCHEMA_COLORS[1 + ((ci - 1) % (SCHEMA_COLORS.length - 1))]);
      }
      return colorOf.get(s)!;
    };

    const all = data.tables.map((t) => tid(t.schema, t.name));
    const allSet = new Set(all);
    const edges = data.foreignKeys
      .map((f) => ({ s: tid(f.schema, f.table), t: tid(f.refSchema, f.refTable) }))
      .filter((e) => allSet.has(e.s) && allSet.has(e.t));

    const degree = new Map<string, number>();
    for (const e of edges) {
      if (e.s === e.t) continue;
      degree.set(e.s, (degree.get(e.s) ?? 0) + 1);
      degree.set(e.t, (degree.get(e.t) ?? 0) + 1);
    }

    const ids = showAll ? all : all.filter((id) => (degree.get(id) ?? 0) > 0);
    const idSet = new Set(ids);
    const visEdges = edges.filter((e) => idSet.has(e.s) && idSet.has(e.t));

    const meta = new Map<string, { name: string; color: string }>();
    for (const t of data.tables) {
      const id = tid(t.schema, t.name);
      meta.set(id, { name: t.name, color: schemaColor(t.schema) });
    }
    const schemas = Array.from(new Set(data.tables.map((t) => t.schema)));
    return {
      ids,
      edges: visEdges,
      meta,
      schemas: schemas.map((s) => ({ schema: s, color: schemaColor(s) })),
      totalTables: all.length,
      totalFks: data.foreignKeys.length,
      hidden: all.length - ids.length,
    };
  }, [data, showAll]);

  const layout = useMemo(() => {
    if (!model) return null;
    const widths: Record<string, number> = {};
    for (const id of model.ids) widths[id] = nodeW(model.meta.get(id)?.name ?? id);
    return computeLayout(model.ids, model.edges, widths);
  }, [model]);

  useEffect(() => {
    if (layout) setPos(layout.pos);
  }, [layout]);

  const toSvg = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const l = p.matrixTransform(ctm.inverse());
    return { x: l.x, y: l.y };
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--inset)] p-3">
      <div className="mb-2.5 flex items-center gap-2 font-mono text-[11px] text-[var(--muted)]">
        <span>schema map</span>
        {model && (
          <span className="text-[var(--muted)]">
            · {model.totalTables} tables · {model.totalFks} foreign keys
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {model && model.schemas.length > 1 && (
            <span className="flex items-center gap-2">
              {model.schemas.map((s) => (
                <span key={s.schema} className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: s.color }}
                  />
                  {s.schema}
                </span>
              ))}
            </span>
          )}
          {model && model.hidden > 0 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="rounded border border-[var(--border)] px-2 py-0.5 hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
            >
              show {model.hidden} unconnected
            </button>
          )}
          {showAll && (
            <button
              onClick={() => setShowAll(false)}
              className="rounded border border-[var(--border)] px-2 py-0.5 hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
            >
              connected only
            </button>
          )}
          {layout && (
            <button
              onClick={() => setPos(layout.pos)}
              title="reset layout"
              className="rounded border border-[var(--border)] px-2 py-0.5 hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
            >
              reset
            </button>
          )}
        </div>
      </div>

      {loading && (
        <p className="px-1 py-8 text-center font-mono text-xs text-[var(--muted)]">
          mapping relationships…
        </p>
      )}
      {data && !data.ok && (
        <pre className="overflow-auto rounded bg-[var(--code)] p-3 font-mono text-xs text-[var(--danger)]">
          {data.error}
        </pre>
      )}
      {model && model.ids.length === 0 && (
        <p className="px-1 py-8 text-center font-mono text-xs italic text-[var(--muted)]">
          no foreign-key relationships in this database
        </p>
      )}

      {layout && model && model.ids.length > 0 && (
        <svg
          ref={svgRef}
          viewBox={layout.viewBox}
          className="w-full touch-none select-none"
          style={{
            aspectRatio: layout.viewBox.split(" ").slice(2).join(" / "),
            maxHeight: "78vh",
          }}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={(e) => {
            if (!drag) return;
            const p = toSvg(e.clientX, e.clientY);
            if (p) setPos((prev) => ({ ...prev, [drag]: p }));
          }}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          <defs>
            <marker
              id="fk-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L9,5 L0,9" fill="none" stroke="#5a6150" strokeWidth="1.5" />
            </marker>
          </defs>

          {model.edges.map((e, i) => {
            const s = pos[e.s];
            const t = pos[e.t];
            if (!s || !t || e.s === e.t) return null;
            const tw = nodeW(model.meta.get(e.t)?.name ?? "") / 2;
            const sw = nodeW(model.meta.get(e.s)?.name ?? "") / 2;
            const start = borderPoint(t, s, sw, NODE_H / 2);
            const end = borderPoint(s, t, tw, NODE_H / 2);
            return (
              <line
                key={i}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="#3a4030"
                strokeWidth="1"
                markerEnd="url(#fk-arrow)"
              />
            );
          })}

          {model.ids.map((id) => {
            const p = pos[id];
            const m = model.meta.get(id);
            if (!p || !m) return null;
            const w = nodeW(m.name);
            return (
              <g
                key={id}
                transform={`translate(${p.x - w / 2}, ${p.y - NODE_H / 2})`}
                className="cursor-grab"
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setDrag(id);
                }}
              >
                <rect
                  width={w}
                  height={NODE_H}
                  rx="5"
                  fill="#14160f"
                  stroke={m.color}
                  strokeWidth="1"
                />
                <text
                  x={w / 2}
                  y={NODE_H / 2 + FONT * 0.35}
                  textAnchor="middle"
                  fontSize={FONT}
                  fontFamily="ui-monospace, monospace"
                  fill={m.color}
                >
                  {m.name}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
