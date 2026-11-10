"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Logo, Wordmark } from "@/components/logo";
import { Button, ErrorBox, Input, Label } from "@/components/ui";
import { api } from "@/lib/api";
import { Bot, ShieldCheck, Undo2 } from "lucide-react";

export default function Page() {
  return (
    <React.Suspense>
      <LoginPage />
    </React.Suspense>
  );
}

function LoginPage() {
  const router = useRouter();
  // "/login?mode=register" (from the landing page's "Sign up" buttons) opens on account creation.
  const initialMode = useSearchParams().get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = React.useState<"login" | "register">(initialMode);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<unknown>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/auth/${mode}`, { email, password });
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/projects");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-8 py-8 sm:px-14">
        <Link href="/" aria-label="Normie home" className="self-start">
          <Wordmark height={26} />
        </Link>
        <div className="animate-rise mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.04em]">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-[13px] text-text-2">
            {mode === "login" ? "Sign in to your databases." : "Every project gets its own isolated PostgreSQL database."}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <Label>Email</Label>
              <Input className="h-10" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label hint={mode === "register" ? "8+ characters" : undefined}>Password</Label>
              <Input
                className="h-10"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <ErrorBox error={error} />
            <Button type="submit" variant="primary" className="h-10 w-full text-sm" loading={busy}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-[13px] text-text-2">
            {mode === "login" ? "New to Normie? " : "Already have an account? "}
            <button className="font-medium text-accent hover:underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border bg-surface-3 lg:block">
        <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 700 900" preserveAspectRatio="none" fill="none" stroke="var(--surface)" strokeWidth="2">
          <path d="M-10 220C160 140 260 320 420 260S640 120 720 180" />
          <path d="M120 920C160 700 320 640 360 460S520 120 580 -10" />
          <path d="M460 920c40-140 170-200 240-320" />
        </svg>
        <div className="relative flex h-full flex-col justify-center px-14">
          <Logo size={60} className="animate-pop mb-7 rounded-2xl shadow-e3" />
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-text">Agentic database platform</p>
          <h2 className="mt-3 max-w-md font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.04em]">
            Your data, but make it{" "}
            <span className="bg-[linear-gradient(transparent_58%,var(--brand)_58%,var(--brand)_92%,transparent_92%)]">normal.</span>
          </h2>
          <ul className="stagger mt-10 max-w-md space-y-5 text-[13.5px] text-text-2">
            <Feature icon={<Bot className="size-4" />} title="Chat with your database">
              The copilot designs schemas, writes SQL and explains plans, using real tools against your live database.
            </Feature>
            <Feature icon={<ShieldCheck className="size-4" />} title="Nothing risky runs without you">
              Every change is dry-run for real, risk-scored, and waits for your approval. PostgreSQL roles enforce it.
            </Feature>
            <Feature icon={<Undo2 className="size-4" />} title="Undo, audit and restore">
              Before-images for writes, an append-only audit log, and one-click backups.
            </Feature>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-accent shadow-card">
        {icon}
      </span>
      <span>
        <span className="block font-medium text-text">{title}</span>
        {children}
      </span>
    </li>
  );
}
