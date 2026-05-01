"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ContactFormData = {
  name: string;
  phone: string;
  email: string;
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

function ContactInlineForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: ContactFormData) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    onSubmit({ name: name.trim(), phone: phone.trim(), email: email.trim() });
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 disabled:opacity-50";

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm"
    >
      <p className="mb-3 font-semibold text-slate-800">Complete your booking:</p>
      <div className="space-y-2">
        <input
          required
          type="text"
          placeholder="Full name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <input
          required
          type="tel"
          placeholder="Phone number *"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={isLoading || !name.trim() || !phone.trim()}
          className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {isLoading ? "Confirming…" : "Confirm Booking"}
        </button>
      </div>
    </form>
  );
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
  const [isResetting, setIsResetting] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionLoadVersionRef = useRef(0);

  // On mount: load or create session, then restore history
  useEffect(() => {
    let cancelled = false;
    const loadVersion = sessionLoadVersionRef.current;

    async function init() {
      try {
        const sessionId = await getOrCreateSessionId();
        if (cancelled || loadVersion !== sessionLoadVersionRef.current) return;
        sessionIdRef.current = sessionId;

        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
          // Session expired — clear and start fresh
          localStorage.removeItem(SESSION_KEY);
          const newSessionId = await getOrCreateSessionId();
          if (cancelled || loadVersion !== sessionLoadVersionRef.current) return;
          sessionIdRef.current = newSessionId;
          return;
        }

        const data = (await response.json()) as {
          messages: { role: "user" | "assistant"; content: string }[];
          partialData?: {
            pickupZip?: string;
            dropoffZip?: string;
            items?: { type: string; quantity: number }[];
          };
          status?: string;
        };

        if (data.messages.length > 0) {
          const restored: Message[] = data.messages.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
          }));
          if (!cancelled && loadVersion === sessionLoadVersionRef.current) {
            setMessages([WELCOME_MESSAGE, ...restored]);
          }
        }

        // Restore contact form if quote was given but session is not yet booked
        if (
          data.status !== "booked" &&
          data.partialData?.pickupZip &&
          data.partialData?.dropoffZip &&
          data.partialData?.items?.length &&
          !cancelled &&
          loadVersion === sessionLoadVersionRef.current
        ) {
          setShowContactForm(true);
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

  async function handleReset() {
    if (isLoading || isResetting) {
      return;
    }

    setIsResetting(true);
    sessionLoadVersionRef.current += 1;
    sessionIdRef.current = null;
    localStorage.removeItem(SESSION_KEY);
    setMessages([WELCOME_MESSAGE]);
    setInput("");
    setShowContactForm(false);

    try {
      const sessionId = await getOrCreateSessionId();
      sessionIdRef.current = sessionId;
    } catch {
      // Leave the UI reset even if the new session cannot be created immediately.
    } finally {
      setIsResetting(false);
    }
  }

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
      const sessionId = sessionIdRef.current ?? await getOrCreateSessionId();
      sessionIdRef.current = sessionId;

      const chatHistory = allMessages
        .filter((m) => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("The assistant is unavailable right now.");
      }

      const data = (await response.json()) as {
        assistantMessage: string;
        sessionId?: string | null;
        structuredData?: {
          priceQuote?: { totalPrice: number } | null;
          order?: { id: string } | null;
        };
      };

      if (data.sessionId) {
        sessionIdRef.current = data.sessionId;
        localStorage.setItem(SESSION_KEY, data.sessionId);
      }

      // Show contact form once a price quote exists and no order yet
      if (data.structuredData?.priceQuote && !data.structuredData?.order) {
        setShowContactForm(true);
      }

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

  async function handleContactSubmit(formData: ContactFormData) {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const sessionId = sessionIdRef.current ?? (await getOrCreateSessionId());
      sessionIdRef.current = sessionId;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactForm: formData, sessionId }),
      });

      const responseData = (await response.json()) as {
        assistantMessage?: string;
        error?: string;
        sessionId?: string | null;
      };

      if (!response.ok) {
        throw new Error(responseData.error ?? "Could not complete the booking.");
      }

      if (responseData.sessionId) {
        sessionIdRef.current = responseData.sessionId;
        localStorage.setItem(SESSION_KEY, responseData.sessionId);
      }

      setShowContactForm(false);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: responseData.assistantMessage ?? "Booking confirmed!",
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={showHeader ? "rounded-3xl border border-slate-200 bg-white shadow-sm" : ""}>
      {showHeader && (
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Chat</h2>
              <p className="mt-1 text-sm text-slate-500">
                Get an instant moving quote and book your move.
              </p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              disabled={isLoading || isResetting}
              className="inline-flex shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isResetting ? "Resetting" : "Start over"}
            </button>
          </div>
        </div>
      )}

      <div className={`flex flex-col ${heightClassName ?? defaultHeightClassName}`}>
        {!showHeader ? (
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading || isResetting}
                className="inline-flex rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isResetting ? "Resetting" : "Start over"}
              </button>
            </div>
          </div>
        ) : null}

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
                  {message.content.split("\n").map((line, i, arr) => (
                    <span key={i}>
                      {line}
                      {i < arr.length - 1 && <br />}
                    </span>
                  ))}
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

          {showContactForm && (
            <div className="flex justify-start">
              <div className="w-full max-w-[88%] sm:max-w-[80%]">
                <ContactInlineForm onSubmit={handleContactSubmit} isLoading={isLoading} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className={`border-t border-slate-200 p-4 transition-opacity ${showContactForm ? "pointer-events-none opacity-30" : ""}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!isLoading && !showContactForm && input.trim()) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }
              }}
              placeholder={showContactForm ? "Fill the form above to continue…" : "Type a message…"}
              disabled={isLoading || showContactForm}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 disabled:opacity-50 [field-sizing:content] max-h-36 overflow-y-auto"
            />
            <button
              type="submit"
              disabled={isLoading || showContactForm}
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