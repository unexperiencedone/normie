"use client";

import { Dialog as D, Tabs as T, Tooltip as TT, Switch as S } from "radix-ui";
import { Loader2, X } from "lucide-react";
import * as React from "react";
import type { Risk } from "@/lib/api";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ Button
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type BtnSize = "sm" | "md" | "icon";

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean }
>(function Button({ className, variant = "secondary", size = "md", loading, children, disabled, ...p }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap select-none",
        "pressable disabled:pointer-events-none disabled:opacity-50",
        size === "sm" && "h-7 px-2.5 text-xs",
        size === "md" && "h-8 px-3 text-[13px]",
        size === "icon" && "h-7 w-7 text-xs",
        variant === "primary" &&
          "bg-accent text-accent-fg shadow-glow hover:-translate-y-px hover:bg-accent-hover hover:shadow-glow-hover active:bg-accent-press",
        variant === "secondary" && "border border-border bg-surface text-text shadow-card hover:border-border-strong hover:bg-surface-2",
        variant === "outline" && "border border-border text-text hover:border-accent-ring hover:bg-surface-2",
        variant === "ghost" && "text-text-2 hover:bg-surface-3 hover:text-text",
        variant === "danger" && "bg-danger text-white hover:-translate-y-px hover:opacity-90",
        className,
      )}
      {...p}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ Inputs
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...p }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-8 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text placeholder:text-muted",
          "transition-[border-color,box-shadow] duration-200 hover:border-border-strong focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-[3px] focus:ring-accent/20",
          className,
        )}
        {...p}
      />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...p }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-text placeholder:text-muted",
          "transition-[border-color,box-shadow] duration-200 hover:border-border-strong focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-[3px] focus:ring-accent/20 resize-none",
          className,
        )}
        {...p}
      />
    );
  },
);

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <span className="text-xs font-medium text-text-2">{children}</span>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ Badges
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info" | "accent" | "brand";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-none whitespace-nowrap",
        tone === "neutral" && "bg-surface-3 text-text-2",
        tone === "ok" && "bg-ok-soft text-ok",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "info" && "bg-info-soft text-info",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "brand" && "bg-brand-soft text-brand-text",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: Risk }) {
  const tone = risk === "low" ? "ok" : risk === "medium" ? "warn" : "danger";
  return (
    <Badge tone={tone}>
      <span className="size-1.5 rounded-full bg-current" />
      {risk} risk
    </Badge>
  );
}

// ------------------------------------------------------------------ Layout bits
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...p} />;
}

/** Placeholder block that shimmers while data loads; keeps layout stable (no spinner jump). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-muted", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="px-fluid animate-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border py-4">
      <div className="min-w-0 max-w-[68ch] flex-[1_1_22rem]">
        <h1 className="text-title font-display font-semibold tracking-[-0.025em]">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-text-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-rise flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-xl border border-border bg-surface p-2.5 text-accent shadow-card">{icon}</div>}
      <h3 className="text-sm font-medium">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-[13px] text-text-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const e = error as { message?: string; detail?: string; hint?: string };
  return (
    <div className={cn("animate-pop rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger", className)}>
      <div className="font-medium">{e.message ?? String(error)}</div>
      {e.detail && <div className="mt-0.5 opacity-90">{e.detail}</div>}
      {e.hint && <div className="mt-0.5 opacity-90">Hint: {e.hint}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Dialog
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="overlay-anim fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px]" />
        <D.Content
          className={cn(
            // mobile: bottom sheet; >=640px: centred card. Width = min(viewport - 2rem, cap)
            "dialog-anim fixed z-50 flex max-h-[calc(100dvh-2rem)] flex-col border border-border bg-surface shadow-e3",
            "inset-x-0 bottom-0 rounded-t-2xl sm:inset-x-0 sm:bottom-auto sm:mx-auto sm:top-[10vh] sm:rounded-2xl",
            wide ? "sm:w-[min(100vw-2rem,48rem)]" : "sm:w-[min(100vw-2rem,28rem)]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-3.5">
            <div>
              <D.Title className="font-display text-[15px] font-semibold tracking-[-0.02em]">{title}</D.Title>
              {description && <D.Description className="mt-0.5 text-[13px] text-text-2">{description}</D.Description>}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ------------------------------------------------------------------ Tabs
export const Tabs = T.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("flex items-center gap-1 border-b border-border px-3", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "relative -mb-px flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[13px] text-text-2 transition-[color,border-color] duration-200",
        "hover:text-text data-[state=active]:border-accent data-[state=active]:font-medium data-[state=active]:text-text",
        className,
      )}
      {...p}
    />
  );
}
export function TabsContent({ className, ...p }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn("tab-panel-anim", className)} {...p} />;
}

// ------------------------------------------------------------------ Tooltip
export function Tip({ label, children, side = "right" }: { label: string; children: React.ReactNode; side?: "right" | "top" | "bottom" | "left" }) {
  return (
    <TT.Root delayDuration={250}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          side={side}
          sideOffset={6}
          className="tip-anim z-50 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text shadow-e2"
        >
          {label}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}
export const TooltipProvider = TT.Provider;

// ------------------------------------------------------------------ Switch
export function Switch({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <S.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative h-5 w-9 shrink-0 rounded-full border border-border-strong bg-surface-3 transition-colors duration-200 data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-50"
    >
      <S.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-spring data-[state=checked]:translate-x-[17px]" />
    </S.Root>
  );
}

// ------------------------------------------------------------------ Code block
export function CodeBlock({ code, className, maxH = "max-h-72" }: { code: string; className?: string; maxH?: string }) {
  return (
    <pre
      className={cn(
        "overflow-auto rounded-lg border border-border bg-code px-3 py-2 font-mono text-[12px] leading-relaxed text-text",
        maxH,
        className,
      )}
    >
      {code}
    </pre>
  );
}
