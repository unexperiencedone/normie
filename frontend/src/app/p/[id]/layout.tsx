"use client";

import {
  BrainCircuit,
  ChevronRight,
  Code2,
  History,
  Inbox,
  LayoutDashboard,
  Menu,
  Moon,
  Network,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Sun,
  Table2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { ViewTransition } from "react";
import { AssistantPanel, AssistantProvider, useAssistant } from "@/components/assistant/assistant";
import { Logo, Wordmark } from "@/components/logo";
import { Badge, Button, ErrorBox, Kbd, Skeleton, Tip } from "@/components/ui";
import { computeLayout, PANEL_MAX, PANEL_MIN, SIDEBAR_RAIL, clamp } from "@/lib/layout";
import { useProject, useProjectId } from "@/lib/project";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/tables", label: "Table editor", icon: Table2 },
  { href: "/sql", label: "SQL editor", icon: Code2 },
  { href: "/schema", label: "Schema diagram", icon: Network },
  { href: "/approvals", label: "Approvals", icon: Inbox },
  { href: "/roles", label: "Roles & access", icon: ShieldCheck },
  { href: "/history", label: "History & backups", icon: History },
  { href: "/lab", label: "Normalisation lab", icon: BrainCircuit },
  { href: "/settings", label: "Connect & settings", icon: PlugZap },
];

function useViewportWidth() {
  const [w, setW] = React.useState<number | null>(null);
  React.useEffect(() => {
    const on = () => setW(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <AssistantProvider>
      <Shell>{children}</Shell>
    </AssistantProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const id = useProjectId();
  const pathname = usePathname();
  const project = useProject();
  const { open, setOpen, ask } = useAssistant();
  const vw = useViewportWidth() ?? 1440;
  const [userPanelW, setUserPanelW] = React.useState<number | null>(null);
  const [drawer, setDrawer] = React.useState(false);
  const L = computeLayout(vw, userPanelW);
  const initialised = React.useRef(false);

  // First paint on a narrow screen: start with the copilot closed (it would cover the page).
  React.useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const hasAsk = new URLSearchParams(window.location.search).has("ask");
    if (!hasAsk && !computeLayout(window.innerWidth, null).dock) setOpen(false);
  }, [setOpen]);

  // prompt handed over from the "new project" dialog
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("ask");
    if (p) {
      window.history.replaceState(null, "", window.location.pathname);
      ask(p);
    }
  }, [ask]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape" && open && !L.dock) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen, L.dock]);

  // Losing the room to dock (window shrank) collapses the copilot instead of letting it suddenly
  // cover the page; re-open it explicitly as a sheet.
  const wasDocked = React.useRef(L.dock);
  React.useEffect(() => {
    if (wasDocked.current && !L.dock) setOpen(false);
    wasDocked.current = L.dock;
  }, [L.dock, setOpen]);

  // close the mobile drawer on navigation (derived-state pattern, no effect needed)
  const [lastPath, setLastPath] = React.useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawer(false);
  }

  const startDrag = (e: React.PointerEvent) => {
    const startX = e.clientX;
    const startW = L.panel;
    const move = (ev: PointerEvent) => setUserPanelW(clamp(startW + (startX - ev.clientX), PANEL_MIN, PANEL_MAX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (project.error)
    return (
      <div className="mx-auto max-w-md p-10">
        <ErrorBox error={project.error} />
        <Link href="/projects" className="mt-4 inline-block text-[13px] text-accent hover:underline">
          ← Back to projects
        </Link>
      </div>
    );

  const base = `/p/${id}`;
  const pending = project.data?.pending_approvals ?? 0;
  const labelled = L.mode === "full";

  const nav = (withLabels: boolean) =>
    NAV.map((n) => {
      const href = base + n.href;
      const active = n.href === "" ? pathname === base : pathname.startsWith(href);
      const Icon = n.icon;
      const link = (
        <Link
          key={n.href}
          href={href}
          aria-label={n.label}
          className={cn(
            "group/nav relative flex h-9 items-center gap-2.5 rounded-lg text-[13px] transition-[background-color,color] duration-200",
            withLabels ? "px-2.5" : "justify-center",
            active ? "bg-surface-3 font-medium text-text" : "text-text-2 hover:bg-surface-2 hover:text-text",
          )}
        >
          {active && withLabels && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent animate-pop" />}
          <Icon className={cn("size-4 shrink-0 transition-transform duration-200 group-hover/nav:scale-110", active && "text-accent")} />
          {withLabels && <span className="flex-1 truncate">{n.label}</span>}
          {n.href === "/approvals" &&
            pending > 0 &&
            (withLabels ? (
              <span className="rounded-md bg-warn-soft px-1.5 text-[11px] font-medium text-warn">{pending}</span>
            ) : (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-warn" />
            ))}
        </Link>
      );
      return withLabels ? link : <Tip key={n.href} label={n.label}>{link}</Tip>;
    });

  const showPanel = open && !!project.data;

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* ------------------------------------------------ sidebar (full / rail) */}
      {L.mode !== "mobile" && (
        <nav className="flex shrink-0 flex-col gap-0.5 border-r border-border bg-surface px-2 py-2.5" style={{ width: L.sidebar }}>
          <Link href="/projects" className={cn("mb-3 flex h-8 items-center gap-2", labelled ? "px-1.5" : "justify-center")} aria-label="All projects">
            {labelled ? <Wordmark height={22} /> : <Logo size={28} />}
          </Link>
          {nav(labelled)}
          <div className="mt-auto">
            <ThemeToggle labelled={labelled} />
          </div>
        </nav>
      )}

      {/* ------------------------------------------------ mobile drawer */}
      {L.mode === "mobile" && drawer && (
        <div className="fixed inset-0 z-50">
          <div className="overlay-anim absolute inset-0 bg-black/45" data-state="open" onClick={() => setDrawer(false)} />
          <nav className="absolute inset-y-0 left-0 flex w-[min(280px,85vw)] animate-[slide-in-left_280ms_var(--ease-out)_both] flex-col gap-0.5 border-r border-border bg-surface px-2 py-2.5 shadow-e3">
            <div className="mb-3 flex items-center justify-between px-1.5">
              <Link href="/projects" className="flex items-center gap-2">
                <Wordmark height={22} />
              </Link>
              <Button variant="ghost" size="icon" onClick={() => setDrawer(false)} aria-label="Close menu">
                <X className="size-4" />
              </Button>
            </div>
            {nav(true)}
            <div className="mt-auto">
              <ThemeToggle labelled />
            </div>
          </nav>
        </div>
      )}

      {/* ------------------------------------------------ main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="@container flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
          {L.mode === "mobile" && (
            <Button variant="ghost" size="icon" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
          )}
          <Link href="/projects" className="hidden text-[13px] text-text-2 transition-colors hover:text-text @md:inline">
            Projects
          </Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-muted @md:block" />
          <span className="min-w-0 truncate text-[13px] font-medium">{project.data?.name ?? "…"}</span>
          {project.data && <Badge className="hidden shrink-0 @lg:inline-flex">schema v{project.data.schema_version}</Badge>}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {pending > 0 && (
              <Link href={`${base}/approvals`} className="hidden @sm:block">
                <Badge tone="warn" className="ring-pulse h-6 px-2">
                  {pending} awaiting approval
                </Badge>
              </Link>
            )}
            {(!open || !L.dock) && (
              <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-label="Open copilot">
                <Sparkles className="size-3.5 text-accent" />
                <span className="hidden @md:inline">Copilot</span>
                <span className="hidden @2xl:inline">
                  <Kbd>⌘J</Kbd>
                </span>
              </Button>
            )}
          </div>
        </header>
        <main className="@container/main min-h-0 flex-1 overflow-auto">
          {project.isLoading ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-96 max-w-full" />
              <div className="grid-auto-sm gap-3 pt-4">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            </div>
          ) : (
            // keyed by path: each navigation is an exit + enter, which the browser crossfades
            <ViewTransition key={pathname} enter="page" exit="page" default="none">
              <div className="h-full">{children}</div>
            </ViewTransition>
          )}
        </main>
      </div>

      {/* ------------------------------------------------ copilot: docked column, or overlay sheet */}
      {showPanel && L.dock && (
        <div className="relative shrink-0" style={{ width: L.panel }}>
          <div
            onPointerDown={startDrag}
            className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-accent/25"
            aria-label="Resize copilot"
          />
          <div className="animate-slide-right h-full">
            <AssistantPanel projectId={id} projectName={project.data!.name} />
          </div>
        </div>
      )}
      {showPanel && !L.dock && (
        <div className="fixed inset-0 z-40">
          {L.mode !== "mobile" && <div className="overlay-anim absolute inset-0 bg-black/40" data-state="open" onClick={() => setOpen(false)} />}
          <div className="animate-slide-right absolute inset-y-0 right-0 shadow-e3" style={{ width: L.mode === "mobile" ? "100vw" : Math.min(L.panel, vw - SIDEBAR_RAIL) }}>
            <AssistantPanel projectId={id} projectName={project.data!.name} />
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle({ labelled }: { labelled: boolean }) {
  const [theme, setTheme] = React.useState<"light" | "dark" | null>(null);
  React.useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem("normie-theme") as "light" | "dark" | null;
      } catch {
        return null;
      }
    })();
    const t = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from localStorage / media query after SSR
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);
  const toggle = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("normie-theme", t);
    } catch {}
  };
  return (
    <button
      onClick={toggle}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-lg text-[13px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text",
        labelled ? "px-2.5" : "justify-center",
      )}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {labelled && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
