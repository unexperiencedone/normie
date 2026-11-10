"use client";

import {
  ArrowUp,
  Brain,
  BrainCircuit,
  Code2,
  History,
  Inbox,
  LayoutDashboard,
  Network,
  PlugZap,
  ShieldCheck,
  Table2,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Logo, Wordmark } from "@/components/logo";
import { cn } from "@/lib/utils";
import { ChenClinic } from "./chen-clinic";
import { WorkspaceLayer } from "./specialists";
import { TrafficLights } from "./traffic-lights";

type View = "overview" | "tables" | "sql" | "schema" | "approvals" | "roles" | "history" | "lab" | "connect";

const NAV: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tables", label: "Table editor", icon: Table2 },
  { id: "sql", label: "SQL editor", icon: Code2 },
  { id: "schema", label: "Schema diagram", icon: Network },
  { id: "approvals", label: "Approvals", icon: Inbox },
  { id: "roles", label: "Roles & access", icon: ShieldCheck },
  { id: "history", label: "History & backups", icon: History },
  { id: "lab", label: "Normalisation lab", icon: BrainCircuit },
  { id: "connect", label: "Connect & settings", icon: PlugZap },
];

const SUGGESTIONS = ["Design a library database", "Which doctors are busiest?", "Is my orders table in 3NF?"];
const REASONING = ["Reading your request", "Matching it to entities, keys and relationships", "Working out what would need your approval"];

type Msg = { id: number; role: "user" | "assistant"; text: string; signup?: boolean };

/** The real Normie window, made playable: every sidebar item opens its screen, and the copilot answers. */
export function HeroApp() {
  const [view, setView] = React.useState<View>("schema");
  const [erMode, setErMode] = React.useState<"er" | "tables">("er");
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState<number | null>(null); // index of the reasoning step shown
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = React.useRef(1);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking]);

  const reply = (text: string) => {
    const t = text.trim();
    if (!t || thinking !== null) return;
    setMsgs((m) => [...m, { id: nextId.current++, role: "user", text: t }]);
    setInput("");
    setThinking(0);
    REASONING.forEach((_, i) => timers.current.push(setTimeout(() => setThinking(i), 250 + i * 750)));
    timers.current.push(
      setTimeout(() => {
        setThinking(null);
        setMsgs((m) => [
          ...m,
          {
            id: nextId.current++,
            role: "assistant",
            signup: true,
            text: "I can build that for real. Sign up for Normie and I'll design it on your own PostgreSQL database, dry-run every change, and wait for your approval before anything is applied.",
          },
        ]);
      }, 250 + REASONING.length * 750),
    );
  };

  return (
    <div className="group/window animate-rise relative z-[2] mx-auto mt-[clamp(48px,6vw,84px)] flex h-[clamp(540px,46vw,640px)] max-w-[1200px] overflow-hidden rounded-[18px] border border-border bg-surface text-left shadow-e3 [animation-delay:260ms]">
      {/* ------------------------------------------------ sidebar: every item is live */}
      <nav aria-label="Demo app pages" className="hidden w-[216px] shrink-0 flex-col gap-0.5 border-r border-border bg-surface-2 px-2.5 py-3.5 text-[13.5px] md:flex">
        <TrafficLights className="px-2 pb-3.5" />
        <div className="flex items-center px-2 pb-3.5">
          <Wordmark height={20} />
        </div>
        {NAV.map((n) => {
          const on = n.id === view;
          return (
            <button
              key={n.id}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => setView(n.id)}
              className={cn(
                "group/nav relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-[background-color,color] duration-200",
                on ? "bg-surface-3 font-semibold text-text" : "text-text-2 hover:bg-surface-3/60 hover:text-text",
              )}
            >
              {on && <span aria-hidden className="animate-pop absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />}
              <n.icon className={cn("size-4 transition-transform duration-200 group-hover/nav:scale-110", on && "text-accent")} />
              <span className="flex-1">{n.label}</span>
              {n.id === "approvals" && <span className="rounded-md bg-warn-soft px-1.5 font-mono text-[11px] text-warn">1</span>}
            </button>
          );
        })}
      </nav>

      {/* ------------------------------------------------ main page */}
      <div className="hidden min-w-0 flex-1 flex-col border-r border-border lg:flex">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-[18px] text-[13px]">
          <span className="text-text-2">
            Projects › <b className="text-text">clinic</b>
            <span className="ml-1.5 rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px]">schema v0</span>
          </span>
          <button type="button" onClick={() => setView("approvals")} className="ring-pulse rounded-full bg-warn-soft px-2.5 py-0.5 text-xs text-warn">
            1 awaiting approval
          </button>
        </div>
        <div key={view} className="animate-rise flex min-h-0 flex-1 flex-col">
          <MainView view={view} erMode={erMode} setErMode={setErMode} onDecide={reply} />
        </div>
      </div>

      {/* ------------------------------------------------ copilot: type anything */}
      <div className="flex w-full flex-col bg-surface md:w-[380px] md:shrink-0">
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4 text-[13.5px]">
          <Logo size={20} />
          <b className="font-display text-[13px] tracking-[-0.02em]">Copilot</b>
          <span className="text-text-2">Chat</span>
          <span className="ml-auto rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[10.5px] text-brand-text">demo</span>
        </div>
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 text-[13.5px] leading-normal">
          <ScriptedOpening onDecide={reply} />
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="animate-rise max-w-[88%] self-end rounded-2xl rounded-br-md bg-accent-soft px-3 py-2.5 whitespace-pre-wrap">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="animate-rise flex flex-col gap-2.5">
                <p>{m.text}</p>
                {m.signup && (
                  <div className="flex flex-wrap gap-2">
                    <Link href="/login?mode=register" className="lp-btn-primary lp-btn-sm">
                      Sign up for Normie
                    </Link>
                    <Link href="/login" className="lp-btn-secondary lp-btn-sm">
                      Log in
                    </Link>
                  </div>
                )}
              </div>
            ),
          )}
          {thinking !== null && <Thinking step={thinking} />}
        </div>
        <div className="border-t border-border px-3.5 pt-2.5 pb-3.5">
          <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={thinking !== null}
                onClick={() => reply(s)}
                className="pressable shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] text-text-2 hover:border-accent-ring hover:text-text disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reply(input);
            }}
            className="flex items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2 transition-[border-color,box-shadow] duration-200 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/15"
          >
            <label htmlFor="hero-ask" className="sr-only">
              Ask the demo copilot
            </label>
            <textarea
              id="hero-ask"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  reply(input);
                }
              }}
              placeholder="Ask anything about your database…"
              className="max-h-24 min-h-[26px] flex-1 resize-none bg-transparent py-0.5 text-[13px] placeholder:text-muted focus:outline-none focus-visible:outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!input.trim() || thinking !== null}
              className="pressable grid size-[28px] shrink-0 place-items-center rounded-lg bg-accent text-accent-fg shadow-glow hover:bg-accent-hover disabled:opacity-40"
            >
              <ArrowUp className="size-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Thinking state: a pulsing brain, the current reasoning step shimmering, finished steps ticked off. */
function Thinking({ step }: { step: number }) {
  return (
    <div className="animate-rise flex flex-col gap-1.5 text-xs" role="status" aria-live="polite">
      <span className="flex items-center gap-1.5 text-text-2">
        <Brain className="size-3.5 animate-pulse text-accent" /> Thinking…
      </span>
      <div className="flex flex-col gap-1 border-l-2 border-accent-ring pl-2.5">
        {REASONING.slice(0, step + 1).map((r, i) => (
          <span key={r} className={cn("animate-rise", i === step ? "thinking-shimmer" : "text-muted")}>
            {i < step ? "✓ " : ""}
            {r}
          </span>
        ))}
      </div>
      <span className="flex gap-1 px-0.5 pt-0.5">
        <span className="typing-dot size-1.5 rounded-full bg-accent" />
        <span className="typing-dot size-1.5 rounded-full bg-accent" />
        <span className="typing-dot size-1.5 rounded-full bg-accent" />
      </span>
    </div>
  );
}

const step = (n: number) => ({ animationDelay: `${300 + n * 350}ms` });

function ScriptedOpening({ onDecide }: { onDecide: (text: string) => void }) {
  return (
    <>
      <div className="animate-rise max-w-[88%] self-end rounded-2xl rounded-br-md bg-accent-soft px-3 py-2.5" style={step(0)}>
        Design a clinic database: patients, doctors, appointments and prescriptions. Receptionists must not see diagnoses.
      </div>
      <p className="animate-rise" style={step(1)}>
        Four entities. Appointments link a patient to a doctor, and each prescription belongs to one appointment.
      </p>
      <span className="animate-rise font-mono text-[11.5px] text-muted" style={step(2)}>
        get_schema · 0 tables
      </span>
      <span className="animate-rise font-mono text-[11.5px] text-muted" style={step(3)}>
        design_from_er · 4 entities, 3 relationships
      </span>
      <ApprovalMini onDecide={onDecide} style={step(4)} />
    </>
  );
}

function ApprovalMini({ onDecide, style, className }: { onDecide: (text: string) => void; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={cn("animate-rise flex flex-col gap-2 rounded-xl border border-warn/50 bg-surface p-3 shadow-e2", className)} style={style}>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11.5px]">Schema migration</span>
        <span className="ring-pulse rounded-md bg-warn-soft px-2 py-0.5 text-[11.5px] text-warn">medium risk</span>
      </div>
      <div className="flex flex-col gap-0.5 font-mono text-xs">
        {["patient", "doctor", "appointment", "prescription"].map((t) => (
          <span key={t}>
            <b className="text-brand-text">+</b> create table {t}
          </span>
        ))}
      </div>
      <span className="text-[11.5px] text-muted">8 statements · dry run OK in 79.01 ms · nothing has changed yet</span>
      <div className="flex justify-end gap-2 text-[12.5px]">
        <button type="button" onClick={() => onDecide("Reject this migration")} className="pressable rounded-lg px-3 py-1.5 text-text-2 hover:bg-surface-3">
          Reject
        </button>
        <button type="button" onClick={() => onDecide("Approve & apply")} className="pressable rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-fg shadow-glow hover:bg-accent-hover">
          Approve &amp; apply
        </button>
      </div>
    </div>
  );
}

function MainView({
  view,
  erMode,
  setErMode,
  onDecide,
}: {
  view: View;
  erMode: "er" | "tables";
  setErMode: (m: "er" | "tables") => void;
  onDecide: (text: string) => void;
}) {
  const pad = "grid min-h-0 flex-1 place-items-center overflow-auto bg-surface-2 p-6";
  switch (view) {
    case "schema":
      return (
        <>
          <div className="flex items-center justify-between px-[18px] pt-3.5">
            <div role="tablist" aria-label="Diagram type" className="flex rounded-lg bg-surface-3 p-[3px] text-[12.5px]">
              {(["er", "tables"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={erMode === m}
                  onClick={() => setErMode(m)}
                  className={cn("rounded-md px-3 py-1 transition-[background-color,box-shadow,color] duration-200", erMode === m ? "bg-surface font-semibold shadow-card" : "text-text-2 hover:text-text")}
                >
                  {m === "er" ? "ER" : "Tables"}
                </button>
              ))}
            </div>
            <span className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-2">PNG</span>
          </div>
          {erMode === "er" ? (
            <div key="er" className="animate-rise grid min-h-0 flex-1 place-items-center px-[18px] pt-2 pb-[18px]">
              <ChenClinic className="h-full max-h-[470px] w-full" />
            </div>
          ) : (
            <div key="tables" className={cn(pad, "animate-rise bg-transparent")}>
              <WorkspaceLayer kind="design" />
            </div>
          )}
        </>
      );
    case "overview":
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-[18px]">
          <h3 className="font-display text-xl font-semibold tracking-[-0.03em]">clinic</h3>
          <div className="stagger grid grid-cols-4 gap-2.5">
            {[
              ["Tables", "4"],
              ["Rows (est.)", "31"],
              ["Size", "224 KB"],
              ["Awaiting", "1"],
            ].map(([k, v]) => (
              <div key={k} className="lift rounded-xl border border-border bg-surface p-3 shadow-card">
                <div className="text-[11.5px] text-muted">{k}</div>
                <div className={cn("font-display text-lg font-semibold", k === "Awaiting" && "text-warn")}>{v}</div>
              </div>
            ))}
          </div>
          <div className="stagger divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-[13px] shadow-card">
            {[
              ["appointment", "7 columns", "2 FK", "~12 rows"],
              ["doctor", "6 columns", "", "~5 rows"],
              ["patient", "7 columns", "", "~8 rows"],
              ["prescription", "6 columns", "1 FK", "~6 rows"],
            ].map(([t, c, fk, r]) => (
              <div key={t} className="flex items-center gap-3 px-3 py-2">
                <Table2 className="size-3.5 text-muted" />
                <span className="font-mono">{t}</span>
                <span className="text-xs text-muted">{c}</span>
                {fk && <span className="rounded-md bg-info-soft px-1.5 text-[11px] text-info">{fk}</span>}
                <span className="ml-auto text-xs text-muted">{r}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "tables":
      return (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex items-center gap-4 border-b border-border px-[18px] py-2 text-[13px]">
            <b className="font-mono">doctor</b>
            <span className="border-b-2 border-accent pb-1 font-medium">Data</span>
            <span className="pb-1 text-text-2">Structure</span>
          </div>
          <div className="font-mono text-[12px]">
            <div className="grid grid-cols-[3rem_1fr_1fr] border-b border-border bg-surface-2 px-[18px] py-2 text-muted">
              <span>id</span>
              <span>name</span>
              <span>specialty</span>
            </div>
            {[
              ["Dr. Alice Smith", "Cardiology"],
              ["Dr. Bob Johnson", "Dermatology"],
              ["Dr. Carol Williams", "Pediatrics"],
              ["Dr. David Brown", "Orthopedics"],
              ["Dr. Eva Martinez", "Neurology"],
            ].map(([n, s], i) => (
              <div key={n} className="animate-rise grid grid-cols-[3rem_1fr_1fr] border-b border-border px-[18px] py-2 transition-colors hover:bg-surface-2" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="text-muted">{11 + i}</span>
                <span>{n}</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <p className="px-[18px] py-3 text-xs text-muted">Double-click a cell to edit · every edit goes through the approval gate</p>
        </div>
      );
    case "sql":
      return (
        <div className={pad}>
          <WorkspaceLayer kind="query" />
        </div>
      );
    case "approvals":
      return (
        <div className={pad}>
          <ApprovalMini onDecide={onDecide} className="w-full max-w-[460px]" />
        </div>
      );
    case "roles":
      return (
        <div className={pad}>
          <WorkspaceLayer kind="secure" />
        </div>
      );
    case "history":
      return (
        <div className={pad}>
          <WorkspaceLayer kind="recover" />
        </div>
      );
    case "lab":
      return (
        <div className={pad}>
          <WorkspaceLayer kind="norm" />
        </div>
      );
    case "connect":
      return (
        <div className={pad}>
          <div className="flex w-full max-w-[460px] flex-col gap-2.5 rounded-2xl bg-surface p-5 shadow-e3">
            <span className="text-[13px] font-semibold">Connect · clinic</span>
            {[
              ["owner", "migrations only · keep private"],
              ["rw", "reads and approved writes"],
              ["ro", "read only, forced READ ONLY"],
            ].map(([r, d], i) => (
              <div key={r} className="animate-rise flex items-center justify-between rounded-[10px] border border-border px-3 py-2.5 font-mono text-xs" style={{ animationDelay: `${i * 80}ms` }}>
                <span>{r}</span>
                <span className="text-muted">{d}</span>
              </div>
            ))}
            <code className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-[11px] break-all text-text-2">psql postgresql://t_…_ro:••••@localhost:5432/…</code>
          </div>
        </div>
      );
  }
}
