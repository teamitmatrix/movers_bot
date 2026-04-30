"use client";

import { useEffect, useRef, useState } from "react";

import ChatUI from "@/components/chat/ChatUI";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);

  function isMobileViewport() {
    return typeof window !== "undefined" && window.innerWidth < 640;
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
        "fixed inset-x-4 z-50 flex flex-col items-end gap-3 transition-all duration-200 sm:left-auto sm:right-6",
        footerVisible && !open ? "bottom-32 sm:bottom-24" : "bottom-6",
      ].join(" ")}
    >
      {open ? (
        <button
          type="button"
          aria-label="Close chat overlay"
          onClick={closeSheet}
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] sm:hidden"
          style={{ opacity: isMobileViewport() ? Math.max(0, 1 - dragOffset / 220) : 1 }}
        />
      ) : null}

      <div
        role="dialog"
        aria-label="Moving assistant chat"
        aria-hidden={!open}
        className={[
          "z-50 w-full overflow-hidden bg-white shadow-2xl ring-1 ring-black/[0.06]",
          "rounded-[28px] origin-bottom-right sm:w-[calc(100vw-3rem)] sm:max-w-[380px] sm:rounded-2xl",
          "sm:bg-white",
          "max-h-[calc(100dvh-1rem)] sm:max-h-none",
          open
            ? "animate-slide-up"
            : "hidden",
          "sm:relative",
          open
            ? "fixed inset-x-0 bottom-0 mx-0 rounded-b-none rounded-t-[28px] sm:inset-auto sm:mx-0 sm:rounded-b-2xl"
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
          className="bg-[#1E3A8A] px-4 pb-3 pt-2 sm:px-4 sm:pt-3"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          style={{ touchAction: "none" }}
        >
          <div className="mb-2 flex justify-center sm:hidden">
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
                <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]" aria-hidden="true" />
                <p className="truncate text-xs text-blue-100">Online · Instant quotes</p>
              </div>
            </div>
          </div>

          <button
            onClick={(event) => {
              event.currentTarget.blur();
              closeSheet();
            }}
            aria-label="Minimize chat"
            className="rounded-full p-1.5 text-white/70 transition hover:bg-white/20 hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
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
          heightClassName="h-[min(68dvh,560px)] sm:h-[min(440px,calc(100vh-9rem))]"
        />
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open moving quote chat"
          aria-expanded={false}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#F97316] text-white shadow-lg shadow-orange-500/40 transition hover:bg-[#EA580C] focus:outline-none focus:ring-2 focus:ring-[#FB923C] focus:ring-offset-2"
        >
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
      ) : null}
    </div>
  );
}

