"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Brain, ChevronDown, History, MessageSquarePlus, Square, Trash2, X } from "lucide-react";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useInvalidateProject } from "@/components/approval-card";
import { ToolCard } from "@/components/assistant/tool-card";
import { Logo } from "@/components/logo";
import { Button, Kbd, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import { applyEvent, streamChat, type ChatPart, type ChatTurn } from "@/lib/chat";
import { cn, timeAgo } from "@/lib/utils";

// ------------------------------------------------------------------ context: lets any page "ask the copilot"
type Ctx = { open: boolean; setOpen: (o: boolean) => void; ask: (text: string) => void };
const AssistantCtx = React.createContext<Ctx | null>(null);
export function useAssistant() {
  const c = React.useContext(AssistantCtx);
  if (!c) throw new Error("useAssistant outside provider");
  return c;
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  const [queued, setQueued] = React.useState<string | null>(null);
  const ask = React.useCallback((text: string) => {
    setOpen(true);
    setQueued(text);
  }, []);
  return (
    <AssistantCtx.Provider value={{ open, setOpen, ask }}>
      <QueuedCtx.Provider value={{ queued, clear: () => setQueued(null) }}>{children}</QueuedCtx.Provider>
    </AssistantCtx.Provider>
  );
}
const QueuedCtx = React.createContext<{ queued: string | null; clear: () => void }>({ queued: null, clear: () => {} });

// ------------------------------------------------------------------ panel
interface ConvSummary {
  conversation_id: string;
  title: string;
  updated_at: string;
}

export function AssistantPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { open, setOpen } = useAssistant();
  const { queued, clear } = React.useContext(QueuedCtx);
  const qc = useQueryClient();
  const invalidate = useInvalidateProject(projectId);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [turns, setTurns] = React.useState<ChatTurn[]>([]);
  const [live, setLive] = React.useState<ChatPart[] | null>(null);
  const [input, setInput] = React.useState("");
  const [showHistory, setShowHistory] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const sendingRef = React.useRef(false); // synchronous in-flight guard (state updates are async)
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stick = React.useRef(true);

  const convs = useQuery({
    queryKey: ["conversations", projectId],
    queryFn: () => api.get<ConvSummary[]>(`/projects/${projectId}/conversations`),
  });

  const busy = live !== null;

  const send = React.useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sendingRef.current) return;
      sendingRef.current = true;
      setInput("");
      setTurns((t) => [...t, { role: "user", text: message }]);
      let parts: ChatPart[] = [];
      setLive(parts);
      stick.current = true;
      const ac = new AbortController();
      abortRef.current = ac;
      let convId = conversationId;
      let gotDone = false;
      let aborted = false;
      let recovered: ChatTurn[] | null = null;
      try {
        try {
          await streamChat(
            projectId,
            { message, conversation_id: convId },
            (e) => {
              if (e.type === "conversation") {
                convId = e.id;
                setConversationId(e.id);
                return;
              }
              if (e.type === "tool_result" && (e.ui?.kind === "executed" || e.ui?.kind === "approval")) invalidate();
              if (e.type === "done") {
                gotDone = true;
                return;
              }
              parts = applyEvent(parts, e);
              setLive(parts);
            },
            ac.signal,
          );
        } catch (err) {
          aborted = (err as Error).name === "AbortError";
          if (!aborted) parts = [...parts, { type: "error", text: (err as Error).message }];
        }
        // The stream dropped (network blip, proxy, laptop sleep) but the run continues on the
        // server and is persisted when it ends: poll the saved conversation and adopt it.
        if (!gotDone && !aborted && convId) {
          setLive([...parts, { type: "thinking", text: "Connection lost; the copilot keeps working on the server. Reconnecting…" }]);
          const deadline = Date.now() + 15 * 60_000;
          while (Date.now() < deadline && !ac.signal.aborted) {
            await new Promise((r) => setTimeout(r, 4000));
            try {
              const c = await api.get<{ transcript: ChatTurn[] }>(`/projects/${projectId}/conversations/${convId}`);
              const t = c.transcript;
              const prev = t[t.length - 2];
              if (t.length >= 2 && prev.role === "user" && prev.text === message && t[t.length - 1].role === "assistant") {
                recovered = t;
                invalidate();
                break;
              }
            } catch {}
          }
        }
        if (aborted) parts = [...parts, { type: "error", text: "Stopped." }];
      } finally {
        if (recovered) setTurns(recovered);
        else setTurns((t) => [...t, { role: "assistant", parts }]);
        setLive(null);
        abortRef.current = null;
        sendingRef.current = false;
        qc.invalidateQueries({ queryKey: ["conversations", projectId] });
      }
    },
    [conversationId, projectId, invalidate, qc],
  );

  // auto-send prompts coming from elsewhere (new-project dialog, "Ask AI" buttons)
  React.useEffect(() => {
    if (queued && !busy) {
      clear();
      send(queued);
    }
  }, [queued, busy, clear, send]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns, live]);

  async function openConversation(id: string) {
    setShowHistory(false);
    const c = await api.get<{ transcript: ChatTurn[] }>(`/projects/${projectId}/conversations/${id}`);
    setConversationId(id);
    setTurns(c.transcript);
  }

  function newChat() {
    abortRef.current?.abort();
    setConversationId(null);
    setTurns([]);
    setShowHistory(false);
  }

  if (!open) return null;

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-surface">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <Logo size={20} />
        <span className="font-display text-[13px] font-semibold tracking-[-0.02em]">Copilot</span>
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-text-2 transition-colors hover:bg-surface-2"
        >
          <span className="truncate">{conversationId ? convs.data?.find((c) => c.conversation_id === conversationId)?.title ?? "Chat" : "New chat"}</span>
          <ChevronDown className="size-3 shrink-0" />
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <Tip label="New chat" side="bottom">
            <Button variant="ghost" size="icon" onClick={newChat} aria-label="New chat">
              <MessageSquarePlus className="size-4" />
            </Button>
          </Tip>
          <Tip label="Close (⌘J)" side="bottom">
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close copilot">
              <X className="size-4" />
            </Button>
          </Tip>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {showHistory && (
          <div className="animate-pop absolute inset-x-2 top-2 z-10 max-h-80 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-e3">
            {convs.data?.length ? (
              convs.data.map((c) => (
                <div key={c.conversation_id} className="group flex items-center rounded-lg transition-colors hover:bg-surface-2">
                  <button onClick={() => openConversation(c.conversation_id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
                    <History className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate text-[13px]">{c.title}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(c.updated_at)}</span>
                  </button>
                  <button
                    aria-label="Delete conversation"
                    className="mr-1 hidden rounded p-1 text-muted hover:text-danger group-hover:block"
                    onClick={async () => {
                      await api.del(`/projects/${projectId}/conversations/${c.conversation_id}`);
                      if (c.conversation_id === conversationId) newChat();
                      qc.invalidateQueries({ queryKey: ["conversations", projectId] });
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            ) : (
              <div className="px-2 py-3 text-center text-xs text-muted">No previous chats</div>
            )}
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="h-full space-y-5 overflow-y-auto px-3 py-4"
        >
          {turns.length === 0 && !live && <Welcome projectName={projectName} onPick={send} />}
          {turns.map((t, i) =>
            t.role === "user" ? <UserBubble key={i} text={t.text} /> : <AssistantTurn key={i} parts={t.parts} projectId={projectId} />,
          )}
          {live && <AssistantTurn parts={live} projectId={projectId} streaming />}
        </div>
      </div>

      <div className="shrink-0 border-t border-border p-2.5">
        <div className="rounded-xl border border-border bg-surface shadow-card transition-[border-color,box-shadow] duration-200 focus-within:border-accent focus-within:shadow-e2 focus-within:ring-[3px] focus-within:ring-accent/15">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={Math.min(8, Math.max(2, input.split("\n").length))}
            placeholder="Ask anything about your database…"
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] placeholder:text-muted focus:outline-none focus-visible:outline-none"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] text-muted">
              <Kbd>↵</Kbd> send · <Kbd>⇧↵</Kbd> newline
            </span>
            {busy ? (
              <Button size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop">
                <Square className="size-3" />
              </Button>
            ) : (
              <Button size="icon" variant="primary" disabled={!input.trim()} onClick={() => send(input)} aria-label="Send">
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function Welcome({ projectName, onPick }: { projectName: string; onPick: (s: string) => void }) {
  const ideas = [
    "What tables do I have and how are they related?",
    "Design a schema for this project from scratch",
    "Add realistic sample data to every table",
    "Find slow queries and suggest indexes",
    "Create a read-only role for analysts",
  ];
  return (
    <div className="animate-rise px-1 pt-6">
      <Logo size={44} className="mb-4 rounded-xl shadow-e2" />
      <div className="font-display text-[16px] font-semibold tracking-[-0.025em]">How can I help with {projectName}?</div>
      <p className="mt-1 text-[13px] text-text-2">
        I work on your real database. I read freely, but every change is dry-run first and waits for your approval when it’s risky.
      </p>
      <div className="stagger mt-5 space-y-1.5">
        {ideas.map((i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            className="lift block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-[13px] text-text-2 shadow-card hover:text-text"
          >
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="animate-rise flex justify-end">
      <div className="max-w-[88%] rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 text-[13.5px] whitespace-pre-wrap text-text">{text}</div>
    </div>
  );
}

function AssistantTurn({ parts, projectId, streaming }: { parts: ChatPart[]; projectId: string; streaming?: boolean }) {
  const lastIsText = parts.length && parts[parts.length - 1].type === "text";
  return (
    <div className="animate-rise space-y-2">
      {parts.map((p, i) => {
        if (p.type === "text")
          return (
            <div key={i} className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
            </div>
          );
        if (p.type === "thinking") return <Thinking key={i} text={p.text} active={!!streaming && i === parts.length - 1} />;
        if (p.type === "error")
          return (
            <div key={i} className="animate-pop rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
              {p.text}
            </div>
          );
        return <ToolCard key={p.id} part={p} projectId={projectId} />;
      })}
      {streaming && !lastIsText && (
        <div className="flex gap-1 px-1 py-1">
          <span className="typing-dot size-1.5 rounded-full bg-muted" />
          <span className="typing-dot size-1.5 rounded-full bg-muted" />
          <span className="typing-dot size-1.5 rounded-full bg-muted" />
        </div>
      )}
    </div>
  );
}

function Thinking({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="text-xs text-muted">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 hover:text-text-2">
        <Brain className={cn("size-3.5", active && "animate-pulse text-accent")} />
        {active ? "Thinking…" : "Reasoning"}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="animate-rise mt-1.5 border-l-2 border-accent-ring pl-2.5 whitespace-pre-wrap">{text}</div>}
    </div>
  );
}
