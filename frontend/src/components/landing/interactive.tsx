"use client";

import { ArrowUp, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ "I'm a ___ and I need to ___"
const ROLES: { name: string; tasks: [string, string, string][] }[] = [
  {
    name: "student",
    tasks: [
      ["normalise my tables", "Check my enrolment table for 3NF and show the decomposition.", "You get the FDs, the candidate keys, the normal form and a migration that splits it losslessly."],
      ["check my ER diagram", "Here is my library ER model. Is every entity keyed and every relationship mapped?", "Normie validates the model, flags weak entities and draws it in Chen notation."],
      ["practise relational algebra", "Show the algebra for: students who took every course in semester 3.", "You get the division expression, the SQL it becomes and the result on your data."],
    ],
  },
  {
    name: "teacher",
    tasks: [
      ["set an FD lab", "Create a sales table with a hidden transitive dependency and 200 rows.", "A ready dataset where observed FDs reveal the problem for students to find."],
      ["show a lossless split", "Decompose orders into BCNF and prove the join gives back the same rows.", "Both tables, the join-back query and a row-by-row comparison."],
      ["give each student a database", "Make a project per student with read-only logins I can hand out.", "One database each, with credentials you can copy or rotate."],
    ],
  },
  {
    name: "founder",
    tasks: [
      ["design a schema", "Marketplace: sellers list items, buyers order them, orders have many lines.", "An ER model, normalised tables and a migration waiting for your approval."],
      ["add a column safely", "We now also need a refund status on orders.", "A forward and backward migration, rehearsed before it touches your data."],
      ["give support read access", "Support can see orders but not payment details.", "A role with column grants, tested against sample queries."],
    ],
  },
  {
    name: "analyst",
    tasks: [
      ["ask without SQL", "Top five products by revenue this quarter, by region.", "The SQL, the algebra and a result table you can export as CSV."],
      ["fix a slow report", "The weekly revenue query is slow.", "The plan, a what-if index and the measured improvement."],
      ["check data quality", "Which columns in customers have duplicates or nulls?", "Counts per column and the queries that found them."],
    ],
  },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Four pastel cards; each pick sends the front card to the back and brings the next colour forward.
const DECK = [
  { bg: "#c4f5fa", line: "#e2fbfd" },
  { bg: "#d6d0ff", line: "#e6e2ff" },
  { bg: "#ffd3b3", line: "#ffe4cf" },
  { bg: "#ddf894", line: "#f2fdd0" },
];
const STACK_DEPTH: React.CSSProperties[] = [
  { transform: "translateY(0) scale(1)", zIndex: 4, boxShadow: "var(--shadow-2)", opacity: 1 },
  { transform: "translateY(-22px) scale(0.95)", zIndex: 3, boxShadow: "var(--shadow)", opacity: 1 },
  { transform: "translateY(-44px) scale(0.9)", zIndex: 2, boxShadow: "none", opacity: 1 },
  { transform: "translateY(-44px) scale(0.86)", zIndex: 1, boxShadow: "none", opacity: 0 },
];

export function RolePicker() {
  const [role, setRole] = React.useState(0);
  const [task, setTask] = React.useState(0);
  const [turn, setTurn] = React.useState(0);
  const r = ROLES[role];
  const [taskName, prompt, out] = r.tasks[task];
  return (
    <div className="flex flex-col gap-[60px]">
      <p className="text-center font-display text-[clamp(22px,2.4vw,32px)] leading-[1.35] font-medium tracking-[-0.03em]" aria-live="polite">
        I&apos;m a <span className="underline decoration-brand-strong decoration-[3px] underline-offset-[6px]">{r.name}</span> and I need to{" "}
        <span className="underline decoration-accent decoration-[3px] underline-offset-[6px]">{taskName}</span>.
      </p>
      <div className="grid items-center gap-12 lg:grid-cols-[2fr_6fr_3fr]">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-2 font-display text-[17px] font-medium">I&apos;m a</legend>
          {ROLES.map((x, i) => (
            <button
              key={x.name}
              type="button"
              aria-pressed={i === role}
              onClick={() => {
                if (i === role) return;
                setRole(i);
                setTask(0);
                setTurn((t) => t + 1);
              }}
              className={cn(
                "flex min-h-9 items-center gap-2.5 py-2 text-left text-sm transition-[color,transform] duration-200 hover:translate-x-0.5 hover:text-accent",
                i === role ? "font-semibold text-text" : "text-muted",
              )}
            >
              <span aria-hidden className={cn("h-px bg-current transition-[width] duration-300 ease-spring", i === role ? "w-6" : "w-3.5")} />
              {cap(x.name)}
            </button>
          ))}
        </fieldset>

        <div className="relative h-[clamp(400px,34vw,420px)]">
          {DECK.map((c, i) => {
            const depth = (i - (turn % DECK.length) + DECK.length) % DECK.length;
            return (
              <div
                key={c.bg}
                aria-hidden
                className="layer-card absolute inset-x-0 top-[44px] bottom-0 overflow-hidden rounded-2xl"
                style={{ background: c.bg, ...STACK_DEPTH[depth] }}
              >
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 360" preserveAspectRatio="none" fill="none" stroke={c.line} strokeWidth="2">
                  <path d="M-10 90C130 30 250 170 380 120S560 40 610 70" />
                  <path d="M90 370C130 250 240 220 280 140S380 20 420 -10" />
                </svg>
              </div>
            );
          })}
          <div className="absolute inset-x-0 top-[44px] bottom-0 z-10 grid place-items-center p-[clamp(20px,4vw,48px)]">
            <div key={`${role}-${task}`} className="animate-pop flex w-full max-w-[440px] flex-col gap-3 rounded-[14px] bg-surface p-[22px] shadow-e3">
              <span className="font-mono text-[11.5px] text-muted">TRY THIS PROMPT</span>
              <p className="text-[15.5px] leading-normal font-medium">{prompt}</p>
              <p className="text-sm text-text-2">{out}</p>
              <a href={`/projects?describe=${encodeURIComponent(prompt)}`} className="lp-btn-primary lp-btn-sm self-end">
                Use this prompt
              </a>
            </div>
          </div>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 font-display text-[17px] font-medium">I need to</legend>
          {r.tasks.map(([t], i) => (
            <button
              key={t}
              type="button"
              aria-pressed={i === task}
              onClick={() => {
                if (i === task) return;
                setTask(i);
                setTurn((t) => t + 1);
              }}
              className={cn("min-h-9 py-2 text-left text-sm transition-[color,transform] duration-200 hover:translate-x-0.5 hover:text-accent", i === task ? "font-semibold text-text" : "text-muted")}
            >
              {cap(t)}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ FAQ (height animates via grid rows 0fr -> 1fr)
const FAQS = [
  ["What is Normie?", "A database platform with a copilot. It creates a real PostgreSQL database for each project, designs and normalises schemas from plain English, writes queries, and asks before it changes anything."],
  ["Is my data safe with an AI writing SQL?", "The copilot never commits on its own. Reads run on a read-only login. Writes and migrations are rehearsed in a transaction, scored for risk and held until you approve them, with before-values kept for undo."],
  ["Do I need to know SQL?", "No, but you will learn it. Every answer shows the relational algebra and the SQL next to the result, and you can edit and rerun it in the SQL editor."],
  ["Can I connect with my own tools?", "Yes. Each project has owner, read-write and read-only logins that work with psql or any PostgreSQL client."],
  ["Which model does it use?", "NVIDIA Nemotron through an OpenAI-compatible endpoint. The checks that matter, such as attribute closure, normal forms and SQL validation, are deterministic code, not the model."],
  ["Who built it?", "Normie is a DBMS project by Aakshant Kumar: a FastAPI and PostgreSQL backend with a Next.js front end."],
];

export function Faq() {
  const [open, setOpen] = React.useState(0);
  return (
    <div className="flex flex-col">
      {FAQS.map(([q, a], i) => {
        const isOpen = open === i;
        return (
          <div key={q} className="border-t border-border-strong">
            <h3>
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={isOpen}
                aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex min-h-11 w-full items-center justify-between gap-4 py-[22px] text-left font-display text-base font-medium transition-colors hover:text-accent"
              >
                {q}
                <span className="relative size-4 shrink-0">
                  <Minus className="absolute inset-0 size-4" />
                  <Plus className={cn("absolute inset-0 size-4 transition-[transform,opacity] duration-300 ease-spring", isOpen && "rotate-90 opacity-0")} />
                </span>
              </button>
            </h3>
            <div
              id={`faq-a-${i}`}
              role="region"
              aria-labelledby={`faq-q-${i}`}
              className={cn("grid transition-[grid-template-rows] duration-300 ease-spring", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
            >
              <div className="overflow-hidden">
                <p className={cn("pr-10 pb-6 text-[15px] text-text-2 transition-opacity duration-300", isOpen ? "opacity-100" : "opacity-0")}>{a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ "Ask Normie" prompt boxes -> new project with the text prefilled
export function AskBox({ variant = "large" }: { variant?: "large" | "footer" }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const go = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    router.push(t ? `/projects?describe=${encodeURIComponent(t)}` : "/projects");
  };
  if (variant === "footer")
    return (
      <form onSubmit={go} className="flex max-w-[320px] items-center gap-2 rounded-xl border border-[#232a35] bg-[#161b23] py-1.5 pr-1.5 pl-3.5 transition-colors focus-within:border-[#8b7cff]">
        <label htmlFor="foot-q" className="sr-only">
          Ask Normie
        </label>
        <input
          id="foot-q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What should my tables look like?"
          className="min-w-0 flex-1 bg-transparent text-sm text-[#eef1f5] placeholder:text-[#8b94a3] focus:outline-none focus-visible:outline-none"
        />
        <button type="submit" aria-label="Ask" className="lp-btn-primary size-9 min-h-9 rounded-[9px] p-0">
          <ArrowUp className="size-4" />
        </button>
      </form>
    );
  return (
    <form
      onSubmit={go}
      className="flex w-full items-end gap-3 rounded-[18px] border border-border bg-surface py-3.5 pr-3.5 pl-5 text-left shadow-e3 transition-[box-shadow,border-color] duration-300 focus-within:border-accent-ring"
    >
      <label htmlFor="cta-q" className="sr-only">
        Describe your database
      </label>
      <textarea
        id="cta-q"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) go();
        }}
        placeholder="A library where members borrow books and pay late fees…"
        className="flex-1 resize-none bg-transparent pt-1.5 text-[15px] leading-normal placeholder:text-muted focus:outline-none focus-visible:outline-none"
      />
      <button type="submit" aria-label="Start a project with this description" className="lp-btn-primary size-11 p-0">
        <ArrowUp className="size-4" />
      </button>
    </form>
  );
}
