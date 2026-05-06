"use client";

import { useEffect, useRef, useState } from "react";

import ChatUI from "@/components/chat/ChatUI";

const CHAT_AUTO_OPEN_KEY = "vanturo-chat-auto-opened";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showToggleNudge, setShowToggleNudge] = useState(false);
  const dragStartYRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const hasShownNudgeRef = useRef(false);

  function isMobileViewport() {
    return typeof window !== "undefined" && window.innerWidth < 768;
  }

  function resetDragState() {
    dragStartYRef.current = null;
    dragOffsetRef.current = 0;
    setDragOffset(0);
    setIsDragging(false);
  }

  function closeSheet() {
    resetDragState();
    setOpen(false);
  }

  function handleDragStart(event: React.PointerEvent<HTMLDivElement>) {
    if (!open || !isMobileViewport()) {
      return;
    }

    dragStartYRef.current = event.clientY;
    dragOffsetRef.current = 0;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDragMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging || dragStartYRef.current === null || !isMobileViewport()) {
      return;
    }

    const nextOffset = Math.max(0, event.clientY - dragStartYRef.current);
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }

  function handleDragEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!isDragging) {
      return;
    }

    if (dragOffsetRef.current > 120) {
      closeSheet();
      return;
    }

    resetDragState();
  }

  useEffect(() => {
    if (!open) {
      document.body.style.removeProperty("overflow");
      resetDragState();
      return undefined;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.removeProperty("overflow");
    };
  }, [open]);

  useEffect(() => {
    function handleOpenEvent() {
      setOpen(true);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("open-chat", handleOpenEvent);
    document.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("open-chat", handleOpenEvent);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (isMobileViewport()) {
      return undefined;
    }

    if (window.localStorage.getItem(CHAT_AUTO_OPEN_KEY) === "true") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setOpen(true);
      window.localStorage.setItem(CHAT_AUTO_OPEN_KEY, "true");
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (open || typeof window === "undefined" || hasShownNudgeRef.current) {
      setShowToggleNudge(false);
      return undefined;
    }

    let clearTimer: number | undefined;

    const timer = window.setTimeout(() => {
      hasShownNudgeRef.current = true;
      setShowToggleNudge(true);
      clearTimer = window.setTimeout(() => {
        setShowToggleNudge(false);
      }, 900);
    }, 8000);

    return () => {
      window.clearTimeout(timer);
      if (clearTimer !== undefined) {
        window.clearTimeout(clearTimer);
      }
    };
  }, [open]);

  useEffect(() => {
    const footer = document.getElementById("site-footer");

    if (!footer) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setFooterVisible(entry.isIntersecting);
      },
      {
        threshold: 0.15,
      }
    );

    observer.observe(footer);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className={[
        "fixed inset-x-4 z-50 flex flex-col items-end gap-3 transition-all duration-200 md:left-auto md:right-6",
        footerVisible && !open ? "bottom-32 md:bottom-24" : "bottom-6",
      ].join(" ")}
    >
      {open ? (
        <button
          type="button"
          aria-label="Close chat overlay"
          onClick={closeSheet}
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] md:hidden"
          style={{ opacity: isMobileViewport() ? Math.max(0, 1 - dragOffset / 220) : 1 }}
        />
      ) : null}

      <div
        role="dialog"
        aria-label="Moving assistant chat"
        aria-hidden={!open}
        className={[
          "z-50 w-full overflow-hidden bg-white shadow-2xl ring-1 ring-black/[0.06]",
          "rounded-[28px] origin-bottom-right md:w-[calc(100vw-3rem)] md:max-w-[380px] md:rounded-2xl",
          "md:bg-white",
          "max-h-[100dvh] md:max-h-none",
          open
            ? "animate-slide-up"
            : "hidden",
          "md:relative",
          open
            ? "fixed inset-0 mx-0 rounded-none md:inset-auto md:mx-0 md:rounded-2xl"
            : "",
        ].join(" ")}
        style={{
          transform:
            open && isMobileViewport() && dragOffset > 0
              ? `translateY(${dragOffset}px)`
              : undefined,
          transition: isDragging ? "none" : undefined,
        }}
      >
        <div
          className="bg-[#1E3A8A] px-4 pb-3 pt-2 md:px-4 md:pt-3"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          style={{ touchAction: "none" }}
        >
          <div className="mb-2 flex justify-center md:hidden">
            <span
              className="h-1.5 w-12 rounded-full bg-white/45"
              aria-hidden="true"
            />
          </div>

          <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5 text-white"
                aria-hidden="true"
              >
                <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25zM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875H3a3 3 0 106 0h3.75a.75.75 0 00.75-.75V15z" />
                <path d="M8.25 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zM15.75 6.75a.75.75 0 00-.75.75v11.25c0 .087.015.17.042.248a3 3 0 015.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 00-3.732-10.104 1.837 1.837 0 00-1.47-.725H15.75z" />
                <path d="M19.5 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
              </svg>
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Vanturo Assistant</p>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5 items-center justify-center" aria-hidden="true">
                  <span className="absolute h-2.5 w-2.5 rounded-full bg-[#22c55e]/35 animate-online-status-pulse" />
                  <span className="relative h-2 w-2 rounded-full bg-[#22c55e]" />
                </span>
                <p className="truncate text-xs text-blue-100">Online · Instant quotes</p>
              </div>
            </div>
          </div>

          <button
            onClick={(event) => {
              event.currentTarget.blur();
              closeSheet();
            }}
            aria-label="Close chat"
            className="rounded-full p-1.5 text-white/70 transition hover:bg-white/20 hover:text-white"
          >
            <svg
              className="h-4 w-4 md:hidden"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
            <svg
              className="hidden h-4 w-4 md:block"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        </div>

        {/* Chat body */}
        <ChatUI
          showHeader={false}
          heightClassName="h-[calc(100dvh-5rem)] md:h-[min(440px,calc(100vh-9rem))]"
        />
      </div>

      {!open ? (
        <div className="relative z-50 flex flex-col items-end gap-2">
          {showToggleNudge ? (
            <div className="animate-slide-up rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-slate-950/25">
              Need a quote?
              <span
                className="absolute bottom-[-6px] right-5 h-3 w-3 rotate-45 bg-slate-950"
                aria-hidden="true"
              />
            </div>
          ) : null}

          <button
            onClick={() => setOpen(true)}
            aria-label="Open moving quote chat"
            aria-expanded={false}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#F97316] text-white shadow-lg shadow-orange-500/40 transition hover:bg-[#EA580C] focus:outline-none focus:ring-2 focus:ring-[#FB923C] focus:ring-offset-2"
          >
            <span
              className={[
                "absolute inset-0 rounded-full",
                showToggleNudge ? "animate-chat-toggle-nudge" : "",
              ].join(" ")}
              aria-hidden="true"
            />
            <span
              className="absolute inset-0 animate-pulse-ring rounded-full bg-[#F97316]"
              aria-hidden="true"
            />

            <span aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223 15.03 15.03 0 003-.17z" clipRule="evenodd" />
              </svg>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

