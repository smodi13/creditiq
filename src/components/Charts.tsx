"use client";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Cell, LabelList } from "recharts";

const COL = { base: "#1d4ed8", downside: "#d97706", severe: "#b91c1c" };
const axis = { fontSize: 11, fill: "#64748b" };

export interface WallPoint { label: string; amount: number; liquidity: number; requirement: number; risk: "Low" | "Medium" | "High" }
/** Maturities by period against projected liquidity; the red segment is the refinancing requirement. */
export function MaturityWallChart({ data }: { data: WallPoint[] }) {
  const rows = data.map((d) => ({ ...d, covered: Math.min(d.amount, d.liquidity), shortfall: d.requirement }));
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="label" tick={axis} interval={0} />
          <YAxis tick={axis} tickFormatter={(v) => `$${v}M`} width={58} />
          <Tooltip formatter={(v, n) => [`$${Number(v).toFixed(0)}M`, n === "covered" ? "Covered by projected liquidity" : n === "shortfall" ? "Refinancing requirement" : "Projected liquidity"]} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "covered" ? "Covered by liquidity" : v === "shortfall" ? "Refinancing requirement" : "Projected liquidity")} />
          <Bar dataKey="covered" stackId="a" fill="#1d4ed8" />
          <Bar dataKey="shortfall" stackId="a" fill="#b91c1c" />
          <Line dataKey="liquidity" stroke="#15803d" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScenarioLines({ data, unit = "$M", dec = 0 }: { data: Record<string, number | null>[]; unit?: string; dec?: number }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="year" tick={axis} />
          <YAxis tick={axis} width={52} tickFormatter={(v) => (unit === "x" ? `${v}x` : `${v}`)} />
          <Tooltip formatter={(v) => (v == null ? "n/m" : unit === "x" ? `${Number(v).toFixed(dec)}x` : `$${Number(v).toFixed(dec)}M`)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="base" name="Base" stroke={COL.base} dot={false} strokeWidth={2} />
          <Line dataKey="downside" name="Downside" stroke={COL.downside} dot={false} strokeWidth={2} />
          <Line dataKey="severe" name="Severe" stroke={COL.severe} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StackedRecovery({ data }: { data: { name: string; recovery: number; loss: number }[] }) {
  return (
    <div style={{ height: Math.max(180, data.length * 34 + 60) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 70, right: 8 }}>
          <CartesianGrid stroke="#eef2f6" horizontal={false} />
          <XAxis type="number" tick={axis} tickFormatter={(v) => `$${v}M`} />
          <YAxis type="category" dataKey="name" tick={axis} width={150} />
          <Tooltip formatter={(v) => `$${Number(v).toFixed(0)}M`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="recovery" stackId="a" name="Recovery" fill="#15803d" />
          <Bar dataKey="loss" stackId="a" name="Loss" fill="#b91c1c" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IrrBars({ data, hurdle }: { data: { name: string; irr: number }[]; hurdle?: number }) {
  return (
    <div style={{ height: 210 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 16 }}>
          <CartesianGrid stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="name" tick={axis} />
          <YAxis tick={axis} tickFormatter={(v) => `${v}%`} width={48} />
          <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          {hurdle != null && <ReferenceLine y={hurdle * 100} stroke="#4338ca" strokeDasharray="4 3" label={{ value: `Hurdle ${(hurdle * 100).toFixed(0)}%`, fill: "#4338ca", fontSize: 10, position: "insideTopRight" }} />}
          <Bar dataKey="irr" name="IRR">
            {data.map((d) => <Cell key={d.name} fill={d.irr >= (hurdle ?? 0) * 100 ? "#1d4ed8" : d.irr >= 0 ? "#d97706" : "#b91c1c"} />)}
            <LabelList dataKey="irr" position="top" formatter={(v) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 10 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface MatrixPoint { id: string; label: string; ret: number; protect: number; kind: "public" | "demo" }
/** Expected return (probability-weighted IRR) vs downside protection (severe valuation recovery % of the target tranche). */
export function RiskReturnMatrix({ data, hurdle, protect }: { data: MatrixPoint[]; hurdle: number; protect: number }) {
  const pts = data.map((d) => ({ ...d, x: +(d.protect * 100).toFixed(1), y: +(d.ret * 100).toFixed(1) }));
  const ymax = Math.ceil((Math.max(15, ...pts.map((p) => p.y)) + 1) / 5) * 5, ymin = Math.floor((Math.min(-5, ...pts.map((p) => p.y)) - 1) / 5) * 5;
  const ticks = Array.from({ length: (ymax - ymin) / 5 + 1 }, (_, i) => ymin + i * 5);
  return (
    <div>
      <div style={{ height: 330 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ left: 8, right: 40, top: 10, bottom: 22 }}>
            <CartesianGrid stroke="#eef2f6" />
            <XAxis type="number" dataKey="x" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={axis} tickFormatter={(v) => `${v}%`} label={{ value: "Downside protection: severe-case valuation recovery of the target tranche →", position: "insideBottom", offset: -12, fontSize: 11, fill: "#475569" }} />
            <YAxis type="number" dataKey="y" domain={[ymin, ymax]} ticks={ticks} tick={axis} tickFormatter={(v) => `${v}%`} width={44} label={{ value: "Expected IRR", angle: -90, position: "insideLeft", fontSize: 11, fill: "#475569" }} />
            <ZAxis range={[70, 70]} />
            <ReferenceArea x1={protect * 100} x2={100} y1={hurdle * 100} y2={ymax} fill="#dcfce7" fillOpacity={0.6} />
            <ReferenceArea x1={0} x2={protect * 100} y1={hurdle * 100} y2={ymax} fill="#fef3c7" fillOpacity={0.6} />
            <ReferenceArea x1={protect * 100} x2={100} y1={ymin} y2={hurdle * 100} fill="#e0f2fe" fillOpacity={0.6} />
            <ReferenceArea x1={0} x2={protect * 100} y1={ymin} y2={hurdle * 100} fill="#fee2e2" fillOpacity={0.6} />
            <ReferenceLine x={protect * 100} stroke="#64748b" strokeDasharray="4 3" />
            <ReferenceLine y={hurdle * 100} stroke="#64748b" strokeDasharray="4 3" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
              const p = payload?.[0]?.payload as (typeof pts)[number] | undefined;
              return p ? <div className="bg-white border border-line px-2 py-1 text-[11px]"><b>{p.label}</b><br />Expected IRR {p.y}% · protection {p.x}%</div> : null;
            }} />
            <Scatter data={pts.filter((p) => p.kind === "demo")} fill="#64748b"><LabelList dataKey="label" position="top" style={{ fontSize: 9, fill: "#475569" }} /></Scatter>
            <Scatter data={pts.filter((p) => p.kind === "public")} fill="#047857"><LabelList dataKey="label" position="top" style={{ fontSize: 11, fontWeight: 700, fill: "#047857" }} /></Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 text-[10px] text-muted gap-x-3">
        <span>Top-left: <b>speculative</b> (return, thin protection) · Top-right: <b>strong candidates</b></span>
        <span>Bottom-left: <b>avoid</b> · Bottom-right: <b>low-risk, low-return</b></span>
      </div>
    </div>
  );
}
