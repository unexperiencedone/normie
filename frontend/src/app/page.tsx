import type { Metadata } from "next";
import { LandingFooter, LandingNav } from "@/components/landing/chrome";
import { Hero } from "@/components/landing/hero";
import { AskBox, Faq, RolePicker } from "@/components/landing/interactive";
import { Reveal } from "@/components/landing/motion";
import { Capabilities, NumberedColumns, SectionTitle, Ways } from "@/components/landing/sections";
import { Specialists } from "@/components/landing/specialists";

export const metadata: Metadata = {
  title: { absolute: "Normie · your data, but make it normal" },
};

const WRAP = "mx-auto max-w-[1320px] px-[clamp(16px,3vw,40px)]";

export default function Landing() {
  return (
    <div className="bg-bg text-[15px] leading-[1.55] text-text">
      <LandingNav />
      <main>
        <Hero />

        <section className={`${WRAP} pt-5 pb-[clamp(80px,9vw,130px)]`}>
          <NumberedColumns
            items={[
              { title: "Design from a sentence", body: "Say what the app needs to remember. Get an ER model, tables with keys and a migration you can read before it runs." },
              { title: "Ask, don't write", body: "Questions become relational algebra, then SQL, then a result. It runs on a read-only login with a row limit and a timeout." },
              { title: "Change with a safety net", body: "Every write is rehearsed in a transaction, scored for risk and held for approval. Before-values are kept so you can undo." },
            ]}
          />
        </section>

        <section id="work" className="scroll-mt-20 bg-surface-3 py-[clamp(80px,9vw,140px)]">
          <div className={`${WRAP} flex flex-col gap-14`}>
            <SectionTitle sub="Six specialists share one copilot. Pick one and watch the layers trade places: what you ask, the screen it changes, and the approval it waits for.">
              Put Normie to work
            </SectionTitle>
            <Reveal>
              <Specialists />
            </Reveal>
          </div>
        </section>

        <section id="ways" className="scroll-mt-20 py-[clamp(80px,9vw,130px)]">
          <div className={`${WRAP} flex flex-col gap-14`}>
            <SectionTitle>One database, three ways in</SectionTitle>
            <Ways />
          </div>
        </section>

        <section id="syllabus" className="scroll-mt-20 bg-surface py-[clamp(80px,9vw,130px)]">
          <div className={`${WRAP} flex flex-col gap-14`}>
            <SectionTitle>Built on the DBMS syllabus</SectionTitle>
            <NumberedColumns
              items={[
                { title: "Theory does the work", body: "Closure, candidate keys and normal-form checks are plain code. The model proposes; the algorithms decide." },
                { title: "You see every step", body: "Algebra next to SQL, FDs next to the decomposition, the dry-run count next to the approve button." },
                { title: "Nothing changes silently", body: "Writes are rehearsed and approved, every statement is in the audit log, and before-values make undo possible." },
              ]}
            />
            <Capabilities />
          </div>
        </section>

        <section className="bg-surface-3 py-[clamp(80px,9vw,130px)]">
          <Reveal className={WRAP}>
            <RolePicker />
          </Reveal>
        </section>

        <section id="faq" className="scroll-mt-20 bg-surface-3 pt-5 pb-[clamp(80px,9vw,130px)]">
          <div className="mx-auto flex max-w-[760px] flex-col gap-10 px-6">
            <SectionTitle>FAQ</SectionTitle>
            <Faq />
          </div>
        </section>

        <section className="bg-surface-3 px-6 pb-[clamp(90px,10vw,150px)]">
          <Reveal className="mx-auto flex max-w-[760px] flex-col items-center gap-8 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,44px)] leading-[1.12] font-semibold tracking-[-0.04em]">Not sure where to start? Ask Normie.</h2>
            <AskBox />
          </Reveal>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
