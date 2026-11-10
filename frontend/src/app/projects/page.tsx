"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Database, LogOut, Plus, Sparkles, Table2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Logo, Wordmark } from "@/components/logo";
import { Badge, Button, Card, Dialog, EmptyState, ErrorBox, Input, Label, Skeleton, Textarea } from "@/components/ui";
import { api, type Project } from "@/lib/api";
import { formatBytes, timeAgo } from "@/lib/utils";

const STARTERS = [
  "A clinic: patients, doctors, appointments and prescriptions. Receptionists must not see diagnoses.",
  "An online store with customers, products, orders and order items, plus inventory per warehouse.",
  "A university: students, courses, instructors, enrollments with grades, and prerequisites.",
  "A library with members, books, authors (many-to-many) and loans with due dates.",
];

export default function Page() {
  return (
    <React.Suspense>
      <ProjectsPage />
    </React.Suspense>
  );
}

const slug = (s: string) =>
  s.split(":")[0].replace(/^(A|An) /, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

function ProjectsPage() {
  // "/projects?describe=..." comes from the landing page prompt boxes: open the dialog prefilled.
  const describe = useSearchParams().get("describe") ?? "";
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<{ email: string }>("/auth/me") });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api.get<Project[]>("/projects"), enabled: me.isSuccess });
  const [open, setOpen] = React.useState(!!describe);
  const router = useRouter();

  async function logout() {
    await api.post("/auth/logout");
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[90rem] items-center justify-between px-[clamp(1rem,4vw,2.5rem)]">
          <Link href="/" aria-label="Normie home">
            <Wordmark height={24} />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-text-2 sm:inline">{me.data?.email}</span>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="size-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[90rem] px-[clamp(1rem,4vw,2.5rem)] py-[clamp(1.5rem,4vw,3rem)]">
        <div className="animate-rise flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[clamp(22px,1rem+1vw,32px)] font-semibold tracking-[-0.035em]">Projects</h1>
            <p className="mt-1 text-[13px] text-text-2">Each project is an isolated PostgreSQL database with its own credentials.</p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New project
          </Button>
        </div>

        <div className="mt-8">
          {projects.isLoading || me.isLoading ? (
            <div className="grid-auto-md gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : projects.error ? (
            <ErrorBox error={projects.error} />
          ) : projects.data?.length === 0 ? (
            <Card className="border-dashed">
              <EmptyState
                icon={<Logo size={36} className="rounded-[10px]" />}
                title="No projects yet"
                action={
                  <Button variant="primary" onClick={() => setOpen(true)}>
                    <Sparkles className="size-4" /> Create your first database
                  </Button>
                }
              >
                Describe what you want to store in plain English, and the copilot designs the schema for you.
              </EmptyState>
            </Card>
          ) : (
            <div className="grid-auto-md stagger gap-4">
              {projects.data?.map((p) => (
                <Link key={p.project_id} href={`/p/${p.project_id}`} className="group rounded-xl">
                  <Card className="lift h-full p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text transition-transform duration-300 ease-spring group-hover:scale-105 group-hover:-rotate-3">
                          <Database className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium">{p.name}</div>
                          <div className="text-xs text-muted">created {timeAgo(p.created_at)}</div>
                        </div>
                      </div>
                      {!!p.pending && <Badge tone="warn">{p.pending} pending</Badge>}
                    </div>
                    {p.description && <p className="mt-3 line-clamp-2 text-[13px] text-text-2">{p.description}</p>}
                    <div className="mt-4 flex items-center gap-4 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Table2 className="size-3.5" /> {p.tables ?? "—"} tables
                      </span>
                      <span>{formatBytes(p.size_bytes)}</span>
                      <span>schema v{p.schema_version}</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <NewProjectDialog open={open} onOpenChange={setOpen} initialPrompt={describe} />
    </div>
  );
}

function NewProjectDialog({ open, onOpenChange, initialPrompt }: { open: boolean; onOpenChange: (o: boolean) => void; initialPrompt: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(() => (initialPrompt ? slug(initialPrompt) : ""));
  const [prompt, setPrompt] = React.useState(initialPrompt);
  const create = useMutation({
    mutationFn: () => api.post<{ project_id: string }>("/projects", { name, description: prompt }),
    onSuccess: (r) => {
      const q = prompt.trim() ? `?ask=${encodeURIComponent(`Design and create this database: ${prompt.trim()}`)}` : "";
      router.push(`/p/${r.project_id}${q}`);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New project"
      description="Provisions a dedicated PostgreSQL database with owner, read-write and read-only roles."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            {prompt.trim() ? (
              <>
                <Sparkles className="size-3.5" /> Create & design with AI
              </>
            ) : (
              "Create empty database"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Project name</Label>
          <Input autoFocus placeholder="clinic-db" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div>
          <Label hint="optional">What should this database store?</Label>
          <Textarea rows={4} placeholder="Describe your domain in plain English…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setPrompt(s);
                  if (!name) setName(slug(s));
                }}
                className="pressable rounded-full border border-border bg-surface px-2.5 py-1 text-[11.5px] text-text-2 hover:-translate-y-px hover:border-accent hover:text-accent"
              >
                {s.split(":")[0].split(" with")[0]}
              </button>
            ))}
          </div>
        </div>
        <ErrorBox error={create.error} />
      </div>
    </Dialog>
  );
}
