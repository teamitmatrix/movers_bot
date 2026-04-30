"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SESSION_KEY = "movers_session_id";

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! Tell me your pickup ZIP, dropoff ZIP, and what items you need moved — I'll give you an instant quote.",
};

async function getOrCreateSessionId(): Promise<string> {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const response = await fetch("/api/sessions", { method: "POST" });
  if (!response.ok) throw new Error("Could not start a session.");
  const data = (await response.json()) as { sessionId: string };
  localStorage.setItem(SESSION_KEY, data.sessionId);
  return data.sessionId;
}

export default function ChatUI({
  showHeader = true,
  heightClassName,
}: {
  showHeader?: boolean;
  heightClassName?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // On mount: load or create session, then restore history
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const sessionId = await getOrCreateSessionId();
        if (cancelled) return;
        sessionIdRef.current = sessionId;

        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
          // Session expired — clear and start fresh
          localStorage.removeItem(SESSION_KEY);
          const newSessionId = await getOrCreateSessionId();
          if (cancelled) return;
          sessionIdRef.current = newSessionId;
          return;
        }

        const data = (await response.json()) as {
          messages: { role: "user" | "assistant"; content: string }[];
        };

        if (data.messages.length > 0) {
          const restored: Message[] = data.messages.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
          }));
          if (!cancelled) {
            setMessages([WELCOME_MESSAGE, ...restored]);
          }
        }
      } catch {
        // Non-critical: fall back to a fresh in-memory session
      }
    }

    void init();
    return () => { cancelled = true; };
  }, []);

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput,
    };

    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);

    try {
      const chatHistory = allMessages
        .filter((m) => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          sessionId: sessionIdRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error("The assistant is unavailable right now.");
      }

      const data = (await response.json()) as { assistantMessage: string };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.assistantMessage,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }

  const defaultHeightClassName = showHeader
    ? "h-[min(480px,calc(100vh-8rem))]"
    : "h-[min(440px,calc(100vh-9rem))] sm:h-[min(440px,calc(100vh-9rem))]";

  return (
    <div className={showHeader ? "rounded-3xl border border-slate-200 bg-white shadow-sm" : ""}>
      {showHeader && (
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Chat</h2>
          <p className="mt-1 text-sm text-slate-500">
            Get an instant moving quote and book your move.
          </p>
        </div>
      )}

      <div className={`flex flex-col ${heightClassName ?? defaultHeightClassName}`}>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[80%] ${
                    isUser
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-400">
                Thinking…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type a message..."
              disabled={isLoading}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 sm:min-w-[112px]"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}