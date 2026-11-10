import { ChartNoAxesColumnIncreasing, GitFork, KeyRound, Network, TableProperties, Undo2 } from "lucide-react";
import Link from "next/link";
import { HeroApp } from "./hero-app";

// Pastel tiles float around the headline; each names one thing Normie does.
const TILES = [
  { label: "ER diagram", icon: Network, bg: "#e7fbb4", pos: "left-[4%] top-14", size: 96, dur: "8s", delay: "0s", fade: false },
  { label: "3NF check", icon: TableProperties, bg: "#d6d0ff", pos: "left-[17%] top-[200px]", size: 92, dur: "10s", delay: "-3s", fade: false },
  { label: "Role: receptionist", icon: KeyRound, bg: "#ffd3b3", pos: "left-[5%] top-[330px]", size: 84, dur: "12s", delay: "-5s", fade: true },
  { label: "Slow query", icon: ChartNoAxesColumnIncreasing, bg: "#c4f5fa", pos: "left-[79%] top-11", size: 96, dur: "10s", delay: "-4s", fade: false },
  { label: "BCNF split", icon: GitFork, bg: "#e7fbb4", pos: "left-[88%] top-[210px]", size: 92, dur: "11s", delay: "-6s", fade: false },
  { label: "Undo delete", icon: Undo2, bg: "#ebede5", pos: "left-[76%] top-[330px]", size: 84, dur: "9s", delay: "-1s", fade: true },
];

const STACK = ["Python", "FastAPI", "PostgreSQL 18", "psql", "pg_dump", "sqlglot", "PydanticAI", "NVIDIA Nemotron", "Next.js"];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-4 pt-[clamp(72px,10vw,150px)] pb-[clamp(64px,8vw,110px)]">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 hidden h-[520px] lg:block">
        {TILES.map((t) => (
          <div key={t.label} className={`tile-drift absolute flex flex-col gap-2 ${t.pos}`} style={{ animationDuration: t.dur, animationDelay: t.delay, opacity: t.fade ? 0.6 : 1 }}>
            <div
              className="grid place-items-center rounded-[18px] text-[#0a0c10]"
              style={{ width: t.size, height: t.size, background: t.bg, boxShadow: t.fade ? "none" : "var(--shadow-2)" }}
            >
              <t.icon className="size-10" strokeWidth={1.4} />
            </div>
            <span className="text-[13px] text-muted">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="relative mx-auto flex max-w-[820px] flex-col items-center gap-[26px] text-center">
        <h1 className="animate-rise font-display text-[clamp(40px,5.6vw,74px)] leading-[1.04] font-semibold tracking-[-0.045em]">
          Your data, but make it <span className="marker">normal.</span>
        </h1>
        <p className="animate-rise max-w-[600px] text-[clamp(17px,1.4vw,20px)] leading-[1.55] text-text-2 [animation-delay:80ms]">
          Describe what you&apos;re building. Normie designs the schema, writes the SQL and waits for your yes before anything changes.
        </p>
        <div className="animate-rise flex flex-wrap justify-center gap-3 [animation-delay:160ms]">
          <Link href="/projects" className="lp-btn-primary">
            Start a project
          </Link>
          <a href="#work" className="lp-btn-secondary">
            See it work
          </a>
        </div>
      </div>

      {/* ------------------------------------------------ the product, as it really looks (and playable) */}
      <HeroApp />

      <div className="relative mt-11 flex flex-col items-center gap-3.5">
        <span className="text-[13px] text-muted">Runs on parts you already trust</span>
        <ul className="stagger flex max-w-3xl flex-wrap justify-center gap-2 font-mono text-[12.5px]">
          {STACK.map((s) => (
            <li key={s} className="lift rounded-[10px] border border-border bg-surface px-3 py-2 shadow-card">
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
