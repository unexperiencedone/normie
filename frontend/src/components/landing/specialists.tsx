"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useInView, useReducedMotion } from "./motion";

export type Kind = "design" | "query" | "norm" | "secure" | "tune" | "recover";
type Tone = 0 | 1 | 2; // plain, result (lime), problem (tangerine)

interface Spec {
  kind: Kind;
  label: string;
  sub: string;
  title: string;
  body: string;
  tool: string;
  prompt: string;
  lines: [string, Tone][];
  steps: string[];
  approval: { title: string; risk: string; riskTone: "ok" | "warn"; items: string[]; note: string; action: string };
}

const SPECS: Spec[] = [
  {
    kind: "design", label: "Design", sub: "Describe it, get a schema.", title: "From one sentence to a schema", tool: "design_from_er",
    body: "Tell Normie what you are building. It drafts an ER model, maps it to tables with keys and foreign keys, and shows the migration before anything runs.",
    prompt: "A clinic: patients book appointments with doctors, and each doctor has a specialty.",
    lines: [["entity  Patient (patient_id PK, name, phone)", 0], ["entity  Doctor (doctor_id PK, name, specialty)", 0], ["Appointment: 1:N from Patient and from Doctor", 0], ["→ 3 tables · 2 foreign keys · waiting for approval", 1]],
    steps: ["You describe", "ER model drafted", "Tables mapped", "Dry run", "You approve"],
    approval: { title: "Schema migration", risk: "medium risk", riskTone: "warn", items: ["+ create table patient", "+ create table doctor", "+ create table appointment", "= 2 foreign keys, 2 indexes"], note: "Dry run OK · nothing has changed yet", action: "Approve & apply" },
  },
  {
    kind: "query", label: "Query", sub: "Ask in plain English.", title: "Questions in, verified SQL out", tool: "run_query",
    body: "Your question becomes relational algebra and SQL, is checked by a parser, and runs on a read-only login with a row limit and a timeout.",
    prompt: "Which doctors have the most appointments?",
    lines: [["τ appointments↓ (γ name, specialty; count → appointments (Doctor ⟕ Appointment))", 0], ["SELECT d.name, d.specialty, count(a.appointment_id) …", 0], ["LEFT JOIN appointment a ON a.doctor_id = d.doctor_id", 0], ["→ 5 rows · read-only role · 1.76 ms", 1]],
    steps: ["You ask", "Algebra", "SQL checked", "Read-only run", "Result"],
    approval: { title: "Read query", risk: "read only", riskTone: "ok", items: ["= runs as the project's ro login", "= statement_timeout 5 s", "= row limit 1000", "= default_transaction_read_only on"], note: "Nothing can change, so nothing needs approval.", action: "Open in SQL editor" },
  },
  {
    kind: "norm", label: "Normalise", sub: "Find the FDs, fix the form.", title: "Normal forms, checked on your data", tool: "analyze_normalization",
    body: "Normie reads the keys you declared and the dependencies your rows actually follow. You confirm the FDs; code finds the keys, the normal form and a lossless split.",
    prompt: "Is my orders table in 3NF?",
    lines: [["observed  customer_id → customer_name, city", 0], ["candidate key  {order_id}", 0], ["not 3NF: customer_id → city, and customer_id is not a key", 2], ["→ split into orders + customers · join-back check runs next", 1]],
    steps: ["Read keys", "Find FDs", "You confirm", "Decompose", "Join-back test"],
    approval: { title: "Decomposition", risk: "medium risk", riskTone: "warn", items: ["+ create table customers as select distinct …", "+ add primary key (customer_id)", "~ drop customer_name, city from orders", "= join-back compared row by row"], note: "A backup is taken automatically before this applies.", action: "Approve & apply" },
  },
  {
    kind: "secure", label: "Secure", sub: "Roles in plain words.", title: "Permissions you can say out loud", tool: "create_business_role",
    body: "Describe who can see what. Normie writes the role, column grants, views and row policies, then tests them against sample statements before you approve.",
    prompt: "Receptionists can book appointments but cannot see diagnoses.",
    lines: [["CREATE ROLE receptionist NOLOGIN;", 0], ["GRANT SELECT (patient_id, name, phone) ON patient …", 0], ["GRANT INSERT ON appointment TO receptionist;", 0], ["→ test: SELECT diagnosis … permission denied, as intended", 1]],
    steps: ["You describe", "Role drafted", "Grants", "Access tested", "You approve"],
    approval: { title: "Business role", risk: "low risk", riskTone: "ok", items: ["+ create role receptionist", "+ grant select (3 columns) on patient", "+ grant select, insert on appointment", "= simulate_access: both checks behave as intended"], note: "Tested against sample statements before deploy.", action: "Approve & apply" },
  },
  {
    kind: "tune", label: "Tune", sub: "Why is this slow?", title: "Indexes proven before they exist", tool: "benchmark_index",
    body: "Normie reads the slow-query log and the plan, tries an index inside a rolled-back transaction, and only suggests it when the benchmark gets faster.",
    prompt: "Why is the appointments page slow?",
    lines: [["Seq Scan on appointment · filter doctor_id, at", 0], ["what-if index (doctor_id, at) · Index Scan", 0], ["benchmarked inside a rolled-back transaction", 0], ["→ create index … waiting for approval", 1]],
    steps: ["Slow log", "Read plan", "What-if index", "Benchmark", "You approve"],
    approval: { title: "Index", risk: "low risk", riskTone: "ok", items: ["+ create index on appointment (doctor_id, at)", "= suggested only if the benchmark is faster", "= built concurrently, no table lock"], note: "Measured inside a transaction that was rolled back.", action: "Approve & apply" },
  },
  {
    kind: "recover", label: "Recover", sub: "Undo, restore, relax.", title: "Every change has a way back", tool: "request_undo",
    body: "Each statement lands in an append-only audit log. Updates and deletes keep before-images, so undo is one approval, and backups restore the rest.",
    prompt: "Undo the delete I approved this morning.",
    lines: [["audit  DELETE FROM appointment · rows captured", 0], ["before-images found · reversible", 0], ["INSERT … SELECT * FROM jsonb_populate_recordset(…)", 0], ["→ rows back · logged as a new audit entry", 1]],
    steps: ["Find action", "Before-images", "Undo planned", "You approve", "Restored"],
    approval: { title: "Undo", risk: "medium risk", riskTone: "warn", items: ["+ re-insert the deleted rows from before-images", "= ids kept as they were", "= logged as a new audit entry"], note: "Dry run first: you see exactly which rows come back.", action: "Approve & apply" },
  },
];

const LAYERS = [
  { name: "Copilot", dot: "bg-brand-strong", panel: "#ddf894", line: "#f2fdd0" },
  { name: "Workspace", dot: "bg-accent", panel: "#d6d0ff", line: "#e6e2ff" },
  { name: "Approval", dot: "bg-[#ff8a3d]", panel: "#ffd3b3", line: "#ffe4cf" },
];

// depth 0 = front. Back layers rise and shrink so their top edge peeks out above the front one.
const DEPTH = [
  { transform: "translateY(0) scale(1)", zIndex: 3, boxShadow: "var(--shadow-3)", filter: "none" },
  { transform: "translateY(-38px) scale(0.95)", zIndex: 2, boxShadow: "var(--shadow-2)", filter: "saturate(0.9)" },
  { transform: "translateY(-74px) scale(0.9)", zIndex: 1, boxShadow: "var(--shadow)", filter: "saturate(0.8)" },
];

const TONE = ["text-text", "text-brand-text", "text-warn"];
const SIGN: Record<string, string> = { "+": "text-brand-text", "~": "text-warn", "=": "text-muted" };

export function Specialists() {
  const [tab, setTab] = React.useState(0);
  const [front, setFront] = React.useState(0);
  const [run, setRun] = React.useState(0);
  const [userPaused, setUserPaused] = React.useState<boolean | null>(null);
  const reduced = useReducedMotion();
  const [stackRef, inView] = useInView<HTMLDivElement>(0.35);
  const paused = userPaused ?? reduced;
  const spec = SPECS[tab];

  React.useEffect(() => {
    if (paused || !inView) return;
    const t = setInterval(() => setFront((f) => (f + 1) % 3), 3600);
    return () => clearInterval(t);
  }, [paused, inView]);

  const pick = (i: number) => {
    setTab(i);
    setFront(0);
    setRun((r) => r + 1);
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = (tab + (e.key === "ArrowRight" ? 1 : SPECS.length - 1)) % SPECS.length;
    pick(n);
    document.getElementById(`spec-tab-${n}`)?.focus();
  };

  return (
    <div className="flex flex-col gap-14">
      <div role="tablist" aria-label="Specialists" onKeyDown={onTabKey} className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {SPECS.map((s, i) => (
          <button
            key={s.kind}
            id={`spec-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === tab}
            aria-controls="spec-panel"
            tabIndex={i === tab ? 0 : -1}
            onClick={() => pick(i)}
            className={cn(
              "flex min-h-[88px] flex-col gap-1.5 rounded-2xl px-[18px] py-4 text-left transition-[background-color,box-shadow,transform] duration-300 ease-spring",
              i === tab ? "bg-surface shadow-e2" : "hover:-translate-y-0.5 hover:bg-surface/60",
            )}
          >
            <span className="text-[15px] font-semibold">{s.label}</span>
            <span className="text-[13px] leading-snug text-text-2">{s.sub}</span>
          </button>
        ))}
      </div>

      <div id="spec-panel" role="tabpanel" aria-labelledby={`spec-tab-${tab}`} className="grid items-center gap-14 lg:grid-cols-[4fr_7fr]">
        <div key={`copy-${tab}`} className="flex gap-7">
          <ol aria-label="Steps" className="hidden flex-col gap-[22px] pt-1.5 sm:flex">
            {spec.steps.map((st, i) => (
              <li key={`${run}-${st}`} className="flex items-center gap-2.5 font-mono text-xs whitespace-nowrap text-muted">
                <span className="size-[9px] rounded-full bg-border-strong">
                  <span className="block size-full animate-pop rounded-full bg-brand-strong" style={{ animationDelay: `${200 + i * 350}ms`, animationFillMode: "both" }} />
                </span>
                {st}
              </li>
            ))}
          </ol>
          <div className="animate-rise flex flex-col gap-4">
            <span className="self-start rounded-lg border border-border bg-bg px-2.5 py-1 font-mono text-xs text-text-2">{spec.label} specialist</span>
            <h3 className="font-display text-[clamp(24px,2.2vw,30px)] leading-[1.15] font-semibold tracking-[-0.035em]">{spec.title}</h3>
            <p className="text-base text-text-2">{spec.body}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div ref={stackRef} className="relative h-[clamp(520px,44vw,560px)]">
            {LAYERS.map((layer, i) => {
              const depth = (i - front + 3) % 3;
              return (
                <div
                  key={layer.name}
                  aria-hidden={depth !== 0}
                  className="layer-card absolute inset-x-0 top-[76px] bottom-0 grid place-items-center overflow-hidden rounded-[18px] p-[clamp(16px,3vw,36px)]"
                  style={{ background: layer.panel, ...DEPTH[depth] }}
                >
                  <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 700 480" preserveAspectRatio="none" fill="none" stroke={layer.line} strokeWidth="2">
                    <path d={i === 0 ? "M-10 120C120 60 210 190 340 150S560 40 720 90" : i === 1 ? "M-10 300C140 240 260 360 380 300S600 200 720 260" : "M-10 60C150 140 300 20 460 100S640 180 720 120"} />
                    <path d={i === 0 ? "M80 500C120 330 260 300 300 200S420 20 470 -10" : i === 1 ? "M200 -10C230 120 160 240 260 500" : "M120 500c60-140 20-260 120-380"} />
                    <path d={i === 0 ? "M380 500c40-90 150-120 210-200s80-120 130-150" : i === 1 ? "M560 -10c-30 120 40 260-20 510" : "M640 500c-60-120-10-220-110-330"} />
                  </svg>
                  <div className="relative w-full" key={`${tab}-${run}-${i}`}>
                    {i === 0 && <CopilotLayer spec={spec} />}
                    {i === 1 && <WorkspaceLayer kind={spec.kind} />}
                    {i === 2 && <ApprovalLayer spec={spec} />}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {LAYERS.map((l, i) => (
              <button
                key={l.name}
                type="button"
                aria-pressed={i === front}
                onClick={() => {
                  setFront(i);
                  setUserPaused(true);
                }}
                className={cn(
                  "pressable flex min-h-[38px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium",
                  i === front ? "border-border bg-surface text-text shadow-e2" : "border-transparent text-text-2 hover:bg-surface/60",
                )}
              >
                <span className={cn("size-2 rounded-full", l.dot)} />
                {l.name}
              </button>
            ))}
            <span className="flex-1" />
            <button type="button" onClick={() => setUserPaused(!paused)} className="lp-btn-secondary lp-btn-sm">
              {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {paused ? "Play" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRun((r) => r + 1);
                setFront(0);
                setUserPaused(false);
              }}
              className="lp-btn-secondary lp-btn-sm"
            >
              <RotateCcw className="size-3.5" /> Replay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopilotLayer({ spec }: { spec: Spec }) {
  return (
    <div className="mx-auto max-w-[500px] overflow-hidden rounded-2xl bg-surface shadow-e3">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3.5 text-[13px]">
        <b className="font-display tracking-[-0.02em]">Copilot</b>
        <span className="text-text-2">Chat</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="animate-rise max-w-[90%] self-end rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 text-sm">{spec.prompt}</div>
        <div className="flex flex-col gap-[7px] font-mono text-xs leading-normal">
          {spec.lines.map(([t, tone], i) => (
            <span key={t} className={cn("animate-rise", TONE[tone])} style={{ animationDelay: `${350 + i * 320}ms` }}>
              {t}
            </span>
          ))}
        </div>
        <span className="font-mono text-[11px] text-muted">nemotron · {spec.tool}</span>
      </div>
    </div>
  );
}

function ApprovalLayer({ spec }: { spec: Spec }) {
  const a = spec.approval;
  return (
    <div className="mx-auto flex max-w-[440px] flex-col gap-3 rounded-2xl bg-surface p-[18px] shadow-e3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs">{a.title}</span>
        <span className={cn("rounded-md px-2 py-0.5 text-xs", a.riskTone === "ok" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>{a.risk}</span>
        <span className="ml-auto text-[11.5px] text-muted">proposed by copilot · just now</span>
      </div>
      <div className="flex flex-col gap-[5px] font-mono text-xs">
        {a.items.map((it, i) => (
          <span key={it} className="animate-rise" style={{ animationDelay: `${150 + i * 120}ms` }}>
            <b className={SIGN[it[0]]}>{it[0]}</b> {it.slice(2)}
          </span>
        ))}
      </div>
      <span className="border-t border-border pt-2.5 text-xs text-muted">{a.note}</span>
      <div className="flex justify-end gap-2 text-[13px]">
        {a.action.startsWith("Approve") && <span className="px-3 py-2 text-text-2">Reject</span>}
        <span className="rounded-[10px] bg-accent px-3.5 py-2 font-semibold text-accent-fg shadow-glow">{a.action}</span>
      </div>
    </div>
  );
}

/** One real Normie screen per specialist, cropped like a product shot. */
export function WorkspaceLayer({ kind }: { kind: Kind }) {
  const frame = "mx-auto max-w-[560px] overflow-hidden rounded-2xl shadow-e3";
  const bar = "flex h-[38px] items-center justify-between border-b px-3.5 text-[12.5px]";
  if (kind === "design")
    return (
      <div className={cn(frame, "bg-surface")}>
        <div className={cn(bar, "border-border")}>
          <b>Schema diagram</b>
          <span className="flex rounded-lg bg-surface-3 p-0.5 text-[11.5px]">
            <span className="px-2.5 py-0.5 text-text-2">ER</span>
            <span className="rounded-md bg-surface px-2.5 py-0.5 font-semibold shadow-card">Tables</span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3.5 bg-surface-2 p-[22px] font-mono text-[11.5px]">
          {[
            ["patient", [["patient_id", "PK"], ["name"], ["phone"]]],
            ["appointment", [["appointment_id", "PK"], ["patient_id", "FK"], ["doctor_id", "FK"], ["at"]]],
            ["doctor", [["doctor_id", "PK"], ["name"], ["specialty"]]],
          ].map(([name, cols], i) => (
            <div key={name as string} className="animate-rise overflow-hidden rounded-[10px] border border-border-strong bg-surface" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="bg-text px-2.5 py-1.5 font-medium text-bg">{name as string}</div>
              {(cols as string[][]).map(([c, k]) => (
                <div key={c} className="flex justify-between border-t border-border px-2.5 py-1.5 first:border-t-0">
                  <span>{c}</span>
                  {k && <span className={k === "PK" ? "text-brand-text" : "text-accent"}>{k}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  if (kind === "query")
    return (
      <div className={cn(frame, "bg-[#0e1117] text-[#dce1e8]")}>
        <div className={cn(bar, "justify-start gap-2 border-[#1c222c] text-xs")}>
          <span className="rounded-md bg-[#6d5cf5] px-2.5 py-0.5 font-semibold text-white">Run</span>
          <span className="rounded-md border border-[#2e3643] px-2.5 py-0.5">Explain</span>
          <span className="rounded-md border border-[#2e3643] px-2.5 py-0.5">Explain analyze</span>
        </div>
        <div className="border-b border-[#1c222c] px-3.5 py-3 font-mono text-[11.5px] leading-[1.7]">
          <K>SELECT</K> d.name <K>AS</K> doctor, d.specialty, <F>count</F>(a.appointment_id) <K>AS</K> appointments
          <br />
          <K>FROM</K> doctor d <K>LEFT JOIN</K> appointment a <K>ON</K> a.doctor_id = d.doctor_id
          <br />
          <K>GROUP BY</K> d.name, d.specialty <K>ORDER BY</K> appointments <K>DESC</K>
        </div>
        <div className="flex h-[34px] items-center justify-between border-b border-[#1c222c] px-3.5 text-[11.5px]">
          <span className="flex gap-4">
            <span className="border-b-2 border-[#c8f560] py-2 text-[#eef1f5]">Results</span>
            <span className="py-2 text-[#8b94a3]">Relational algebra</span>
            <span className="py-2 text-[#8b94a3]">Query plan</span>
          </span>
          <span className="font-mono text-[#8b94a3]">5 rows · 1.76 ms</span>
        </div>
        <div className="font-mono text-[11.5px]">
          <div className="grid grid-cols-[5fr_4fr_3fr] border-b border-[#1c222c] px-3.5 py-[7px] text-[#8b94a3]">
            <span>doctor</span>
            <span>specialty</span>
            <span className="text-right">appointments</span>
          </div>
          {[
            ["Dr. Bob Johnson", "Dermatology", 3],
            ["Dr. Alice Smith", "Cardiology", 3],
            ["Dr. Eva Martinez", "Neurology", 2],
            ["Dr. David Brown", "Orthopedics", 2],
          ].map(([d, s, n], i) => (
            <div key={d} className="animate-rise grid grid-cols-[5fr_4fr_3fr] border-b border-[#161b23] px-3.5 py-1.5 last:border-0" style={{ animationDelay: `${200 + i * 80}ms` }}>
              <span>{d}</span>
              <span>{s}</span>
              <span className="text-right">{n}</span>
            </div>
          ))}
        </div>
      </div>
    );
  if (kind === "norm")
    return (
      <div className={cn(frame, "bg-surface")}>
        <div className={cn(bar, "border-border")}>
          <b>Normalisation lab</b>
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[11.5px]">orders · 5 columns</span>
        </div>
        <div className="flex flex-col gap-3 p-4 font-mono text-xs">
          <span className="text-[11px] text-muted">DECLARED</span>
          <Check on>{"{order_id} → all columns"}</Check>
          <span className="text-[11px] text-muted">OBSERVED IN YOUR ROWS · confirm before use</span>
          <Check on>customer_id → customer_name, city</Check>
          <Check>
            customer_name → customer_id <span className="font-sans text-[11px] text-muted">(coincidence)</span>
          </Check>
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3 font-sans">
            <span className="rounded-md bg-warn-soft px-2 py-0.5 text-xs text-warn">2NF · not 3NF</span>
            <span className="flex gap-1.5 text-xs">
              <span className="rounded-lg border border-border px-2.5 py-1">3NF migration</span>
              <span className="rounded-lg bg-accent px-2.5 py-1 font-semibold text-accent-fg">BCNF migration</span>
            </span>
          </div>
        </div>
      </div>
    );
  if (kind === "secure")
    return (
      <div className={cn(frame, "bg-surface")}>
        <div className={cn(bar, "border-border")}>
          <b>Roles &amp; access</b>
          <span className="rounded-md bg-warn-soft px-2 py-0.5 font-mono text-[11.5px] text-warn">receptionist</span>
        </div>
        <div className="font-mono text-[11.5px]">
          {[
            ["table", "granted", "text-muted"],
            ["patient", "SELECT (patient_id, name, phone)", ""],
            ["appointment", "SELECT, INSERT", ""],
            ["prescription", "none", "text-muted"],
          ].map(([t, g, c]) => (
            <div key={t} className={cn("grid grid-cols-[3fr_5fr] border-b border-border px-3.5 py-2", c)}>
              <span>{t}</span>
              <span>{g}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-[7px] bg-surface-2 px-3.5 py-3 font-mono text-[11.5px]">
          <span className="text-muted">SIMULATE ACCESS</span>
          <span className="animate-rise [animation-delay:300ms]">
            SELECT diagnosis FROM prescription; <b className="text-danger">permission denied</b>
          </span>
          <span className="animate-rise [animation-delay:600ms]">
            INSERT INTO appointment …; <b className="text-brand-text">allowed · rolled back</b>
          </span>
        </div>
      </div>
    );
  if (kind === "tune")
    return (
      <div className={cn(frame, "bg-[#0e1117] text-[#dce1e8]")}>
        <div className={cn(bar, "border-[#1c222c]")}>
          <b>Query plan</b>
          <span className="font-mono text-[11px] text-[#8b94a3]">EXPLAIN (ANALYZE, BUFFERS)</span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-3.5 font-mono text-[11.5px] leading-[1.7]">
          <div className="rounded-[10px] border border-[#232a35] px-3 py-2.5">
            <span className="text-[#8b94a3]">now</span>
            <br />Sort<br />└ HashAggregate<br />
            &nbsp;&nbsp;└ <span className="text-[#ffb27d]">Seq Scan</span> on appointment
          </div>
          <div className="rounded-[10px] border border-[#4f6b0f] px-3 py-2.5">
            <span className="text-[#c8f560]">with what-if index</span>
            <br />Sort<br />└ GroupAggregate<br />
            &nbsp;&nbsp;└ <span className="text-[#c8f560]">Index Scan</span> (doctor_id, at)
          </div>
        </div>
        <div className="flex flex-col gap-1.5 px-3.5 pb-3.5 text-[11.5px]">
          <span className="flex items-center gap-2.5">
            <span className="w-[84px] text-[#8b94a3]">before</span>
            <span className="h-2 flex-1 origin-left animate-[grow_900ms_var(--ease-out)_both] rounded bg-[#ff8a3d]" />
          </span>
          <span className="flex items-center gap-2.5">
            <span className="w-[84px] text-[#8b94a3]">with index</span>
            <span className="h-2 w-[18%] origin-left animate-[grow_900ms_var(--ease-out)_300ms_both] rounded bg-[#c8f560]" />
          </span>
          <span className="mt-1 text-[#8b94a3]">illustrative · Normie measures the real timings on your data</span>
        </div>
      </div>
    );
  return (
    <div className={cn(frame, "bg-surface")}>
      <div className={cn(bar, "border-border")}>
        <b>History &amp; backups</b>
        <span className="font-mono text-[11px] text-muted">audit log · append-only</span>
      </div>
      <div className="text-[12.5px]">
        {[
          ["write", "bg-warn-soft text-warn", "DELETE FROM appointment WHERE …", "Undo"],
          ["migration", "bg-accent-soft text-accent", "create table prescription", "backup taken"],
          ["seed", "bg-brand-soft text-brand-text", "insert sample rows into patient", "reversible"],
        ].map(([k, c, t, r], i) => (
          <div key={k} className="animate-rise flex items-center justify-between gap-2.5 border-b border-border px-3.5 py-2.5" style={{ animationDelay: `${i * 100}ms` }}>
            <span>
              <span className={cn("mr-2 rounded-[5px] px-1.5 py-px font-mono text-[11px]", c)}>{k}</span>
              {t}
            </span>
            {r === "Undo" ? (
              <span className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg">Undo</span>
            ) : (
              <span className="text-[11.5px] text-muted">{r}</span>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between bg-surface-2 px-3.5 py-2.5 font-mono text-[11.5px]">
          <span>pg_dump · before migration v1</span>
          <span className="text-accent">Restore</span>
        </div>
      </div>
    </div>
  );
}

const K = ({ children }: { children: React.ReactNode }) => <span className="text-[#b3a8ff]">{children}</span>;
const F = ({ children }: { children: React.ReactNode }) => <span className="text-[#8beaf3]">{children}</span>;
function Check({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("flex items-center gap-2", !on && "text-muted")}>
      <span className={cn("grid size-3.5 place-items-center rounded", on ? "bg-accent" : "border-[1.5px] border-border-strong")}>
        {on && <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="var(--accent-fg)" strokeWidth="1.8"><path d="M2 5.2l2 2 4-4.4" /></svg>}
      </span>
      {children}
    </span>
  );
}
