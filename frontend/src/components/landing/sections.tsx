import Link from "next/link";
import { Reveal } from "./motion";
import { TrafficLights } from "./traffic-lights";

const H2 = "font-display text-[clamp(32px,3.8vw,50px)] leading-[1.08] font-semibold tracking-[-0.04em]";

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Reveal className="flex flex-col items-center gap-[18px] text-center">
      <h2 className={H2}>{children}</h2>
      {sub && <p className="max-w-[620px] text-lg text-text-2">{sub}</p>}
    </Reveal>
  );
}

export function NumberedColumns({ items }: { items: { title: string; body: string }[] }) {
  return (
    <div className="grid gap-8 md:grid-cols-3">
      {items.map((it, i) => (
        <Reveal key={it.title} delay={i * 90} className="flex flex-col gap-3.5 border-t border-border-strong pt-5">
          <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="font-display text-[clamp(18px,1.5vw,21px)] font-medium tracking-[-0.02em]">{it.title}</h3>
          <p className="text-text-2">{it.body}</p>
        </Reveal>
      ))}
    </div>
  );
}

/** Pastel panel with soft line art; a cropped app window rides on top of it. */
function Panel({ bg, line, children }: { bg: string; line: string; children: React.ReactNode }) {
  return (
    <div className="lift-lg relative h-[300px] overflow-hidden rounded-[20px] shadow-e2" style={{ background: bg }}>
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="none" fill="none" stroke={line} strokeWidth="2">
        <path d="M-10 220C100 160 200 280 410 180" />
        <path d="M260 -10c-40 120 40 200-20 320" />
      </svg>
      {children}
    </div>
  );
}

export function Ways() {
  return (
    <div className="grid gap-7 md:grid-cols-3">
      <Reveal className="group flex flex-col gap-3.5">
        <Panel bg="#ddf894" line="#f2fdd0">
          <div className="absolute top-9 -right-5 -bottom-5 left-7 rounded-[14px] bg-surface p-4 shadow-e3 transition-transform duration-500 ease-spring group-hover:-translate-y-1.5">
            <svg role="img" aria-label="Chen diagram: patient books appointment" viewBox="0 0 320 170" className="w-full">
              <path d="M100 85H128" stroke="var(--text)" strokeWidth="1.3" />
              <path d="M212 85H240" stroke="var(--text)" strokeWidth="4.5" />
              <path d="M212 85H240" stroke="var(--surface)" strokeWidth="1.6" />
              <path d="M40 40L55 66M95 40L80 66M270 40L282 66" stroke="var(--muted)" strokeWidth="1.2" />
              <rect x="10" y="66" width="90" height="38" rx="2" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.6" />
              <path d="M170 64l42 21-42 21-42-21z" fill="var(--accent-soft)" stroke="var(--text-2)" strokeWidth="1.4" />
              <rect x="240" y="66" width="76" height="38" rx="2" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.6" />
              <ellipse cx="38" cy="28" rx="36" ry="12" fill="var(--brand-soft)" stroke="var(--brand-strong)" strokeWidth="1.2" />
              <ellipse cx="104" cy="28" rx="24" ry="12" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.2" />
              <ellipse cx="270" cy="28" rx="18" ry="12" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.2" />
              <g fontSize="10" textAnchor="middle" fill="var(--text)">
                <text x="38" y="31" textDecoration="underline">patient_id</text>
                <text x="104" y="31">name</text>
                <text x="270" y="31">at</text>
              </g>
              <g fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--text)">
                <text x="55" y="89">PATIENT</text>
                <text x="278" y="89">APPT</text>
              </g>
              <text x="170" y="89" fontSize="10.5" fontWeight="600" textAnchor="middle" fill="var(--text)">books</text>
              <g fontSize="10" fontWeight="700" fill="var(--accent)">
                <text x="108" y="78">1</text>
                <text x="224" y="78">N</text>
              </g>
              <g fontSize="10" fill="var(--muted)">
                <text x="10" y="140">Double line: every appointment needs a patient</text>
                <text x="10" y="158">Read back from the foreign keys you already have</text>
              </g>
            </svg>
          </div>
        </Panel>
        <h3 className="mt-2 font-display text-[19px] font-medium tracking-[-0.02em]">See it</h3>
        <p className="text-[14.5px] text-text-2">ER diagrams in Chen notation, drawn from your live tables: keys, cardinality, participation and weak entities.</p>
      </Reveal>

      <Reveal delay={90} className="group flex flex-col gap-3.5">
        <Panel bg="#d6d0ff" line="#e6e2ff">
          <div className="group/window absolute inset-x-7 top-9 -bottom-5 overflow-hidden rounded-[14px] bg-[#0e1117] text-[#dce1e8] shadow-e3 transition-transform duration-500 ease-spring group-hover:-translate-y-1.5">
            <TrafficLights size={9} rest="bg-[#2e3643]" className="border-b border-[#1c222c] px-3.5 py-3" />
            <pre className="px-3.5 py-3 font-mono text-[11.5px] leading-[1.75] whitespace-pre-wrap">
              <span className="text-[#8b94a3]">-- which patients saw a cardiologist?</span>
              {"\n"}
              <span className="text-[#b3a8ff]">SELECT</span> p.name <span className="text-[#b3a8ff]">FROM</span> patient p{"\n"}
              <span className="text-[#b3a8ff]">JOIN</span> appointment a <span className="text-[#b3a8ff]">USING</span> (patient_id){"\n"}
              <span className="text-[#b3a8ff]">JOIN</span> doctor d <span className="text-[#b3a8ff]">USING</span> (doctor_id){"\n"}
              <span className="text-[#b3a8ff]">WHERE</span> d.specialty = <span className="text-[#ddf894]">&apos;Cardiology&apos;</span>
              {"\n\n"}
              <span className="text-[#c8f560]">π</span> name (<span className="text-[#c8f560]">σ</span> specialty=&apos;Cardiology&apos; (Patient ⋈ Appointment ⋈ Doctor))
            </pre>
          </div>
        </Panel>
        <h3 className="mt-2 font-display text-[19px] font-medium tracking-[-0.02em]">Query it</h3>
        <p className="text-[14.5px] text-text-2">A real SQL editor with schema autocomplete, EXPLAIN, and the relational algebra for every query beside the result.</p>
      </Reveal>

      <Reveal delay={180} className="group flex flex-col gap-3.5">
        <Panel bg="#c4f5fa" line="#e2fbfd">
          <div className="absolute top-9 right-7 -bottom-5 -left-5 flex flex-col gap-[9px] rounded-[14px] bg-surface py-4 pr-4 pl-9 shadow-e3 transition-transform duration-500 ease-spring group-hover:-translate-y-1.5">
            <span className="text-[12.5px] font-semibold">Connect · clinic</span>
            {[
              ["owner", "migrations only", false],
              ["rw", "approved writes", false],
              ["ro", "read only", true],
            ].map(([r, d, on]) => (
              <div
                key={r as string}
                className={`flex items-center justify-between rounded-[9px] border px-2.5 py-2 font-mono text-[11.5px] ${on ? "border-brand-strong bg-brand-soft" : "border-border"}`}
              >
                <span>{r as string}</span>
                <span className={on ? "text-brand-text" : "text-muted"}>{d as string}</span>
              </div>
            ))}
            <code className="rounded-lg bg-surface-2 px-2.5 py-2 font-mono text-[11px] break-all text-text-2">psql postgresql://t_…_ro:••••@localhost:5432/…</code>
          </div>
        </Panel>
        <h3 className="mt-2 font-display text-[19px] font-medium tracking-[-0.02em]">Connect it</h3>
        <p className="text-[14.5px] text-text-2">Every project is its own PostgreSQL database with three generated logins. Use psql, a GUI client or your own app.</p>
      </Reveal>
    </div>
  );
}

const CAPS = [
  ["ER modelling", "Entities, keys, cardinality, participation, weak entities and ISA, drawn in Chen notation."],
  ["Relational mapping", "ER to tables, primary and foreign keys, junction tables, generated DDL."],
  ["Normalisation", "Attribute closure, candidate keys, minimal cover, 1NF to BCNF, lossless and dependency-preserving splits."],
  ["Querying", "Relational algebra beside SQL: selection, projection, joins, division, aggregation, subqueries."],
  ["Transactions", "ACID, isolation levels, dry runs that roll back, drift checks at commit."],
  ["Security", "Roles, column GRANT and REVOKE, views and row-level security, tested before deploy."],
  ["Indexing", "EXPLAIN plans, B+ tree indexes, composite order, what-if benchmarks."],
  ["Recovery", "Audit log, undo from before-images, backups and restore."],
];

export function Capabilities() {
  return (
    <div className="grid gap-x-8 gap-y-10 border-t border-border pt-12 sm:grid-cols-2 lg:grid-cols-4">
      {CAPS.map(([t, d], i) => (
        <Reveal key={t} delay={(i % 4) * 70} className="flex flex-col gap-2.5">
          <h3 className="font-display text-base font-medium tracking-[-0.01em]">{t}</h3>
          <p className="text-sm text-text-2">{d}</p>
        </Reveal>
      ))}
    </div>
  );
}

export function StartLink({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/projects" className="lp-btn-primary">
      {children}
    </Link>
  );
}
