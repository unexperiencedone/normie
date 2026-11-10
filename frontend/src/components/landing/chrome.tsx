"use client";

import Link from "next/link";
import * as React from "react";
import { Wordmark } from "@/components/logo";
import { cn } from "@/lib/utils";
import { AskBox } from "./interactive";

const LINKS = [
  ["#work", "Product"],
  ["#ways", "Surfaces"],
  ["#syllabus", "Syllabus"],
  ["#faq", "FAQ"],
];

/** Sticky header: transparent at the top, frosted with a hairline once the page scrolls. */
export function LandingNav() {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b transition-[background-color,border-color,box-shadow] duration-300",
        scrolled ? "border-border bg-bg/80 shadow-card backdrop-blur-md" : "border-transparent bg-bg",
      )}
    >
      {/* Three columns (1fr | auto | 1fr): the links sit at the true centre of the page,
          whatever the widths of the logo and the buttons on either side. */}
      <div className="mx-auto grid h-[72px] max-w-[1320px] grid-cols-[1fr_auto] items-center gap-6 px-[clamp(16px,3vw,40px)] md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label="Normie home" className="justify-self-start">
          <Wordmark height={28} />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-[15px] md:flex">
          {[...LINKS, ["/login", "Log in"]].map(([href, label]) => (
            <a key={href} href={href} className="relative text-text-2 transition-colors hover:text-text after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:scale-x-100">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2.5 justify-self-end">
          <Link href="/login?mode=register" className="lp-btn-secondary hidden sm:inline-flex">
            Sign up
          </Link>
          <Link href="/projects" className="lp-btn-primary">
            Start a project
          </Link>
        </div>
      </div>
    </header>
  );
}

export function LandingFooter() {
  const year = new Date().getFullYear();
  const cols: [string, [string, string][]][] = [
    ["Product", [["#work", "Copilot"], ["#ways", "SQL editor"], ["#ways", "ER diagrams"], ["#work", "Normalisation lab"]]],
    ["Learn", [["#syllabus", "Syllabus map"], ["#work", "How it works"], ["#faq", "FAQ"]]],
    ["Account", [["/projects", "Your projects"], ["/login", "Log in"], ["/login?mode=register", "Create an account"]]],
  ];
  return (
    <footer className="bg-[#0a0c10] pt-20 pb-12 text-[#eef1f5]">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-[clamp(16px,3vw,40px)] md:grid-cols-[3fr_2fr_2fr_2fr]">
        <div className="flex flex-col gap-[22px]">
          <Wordmark height={36} tone="dark" className="self-start" />
          <p className="max-w-xs text-sm text-[#b8c0cc]">Your data, but make it normal. A database copilot that asks before it changes anything.</p>
          <AskBox variant="footer" />
        </div>
        {cols.map(([title, links]) => (
          <div key={title} className="flex flex-col gap-2.5 text-sm">
            <span className="text-[13px] text-[#8b94a3]">{title}</span>
            {links.map(([href, label]) => (
              <Link key={label} href={href} className="w-fit text-[#eef1f5] transition-colors hover:text-[#c8f560]">
                {label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-14 flex max-w-[1320px] flex-wrap items-center justify-between gap-3 border-t border-[#232a35] px-[clamp(16px,3vw,40px)] pt-6 font-mono text-xs text-[#8b94a3]">
        <span>
          © {year} <span className="text-[#eef1f5]">AAKSHANT KUMAR</span>. All rights reserved.
        </span>
        <span>normie · a DBMS project</span>
      </div>
    </footer>
  );
}
