"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const DEMO_BAR_STORAGE_KEY = "vanturo-demo-bar-dismissed";

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
      <rect x="13.5" y="11" width="7" height="9.5" rx="1.5" />
      <rect x="3.5" y="13" width="7" height="7.5" rx="1.5" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.75 10.5 12 4.5l8.25 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.75 9.75v9.75h10.5V9.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.125 19.5v-5.25h3.75v5.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-6 w-6 shrink-0 text-[#1E3A8A] sm:h-7 sm:w-7"
      aria-hidden="true"
    >
      <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25z" />
      <path d="M13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875H3a3 3 0 106 0h3.75a.75.75 0 00.75-.75V15z" />
      <path d="M8.25 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zM15.75 6.75a.75.75 0 00-.75.75v11.25c0 .087.015.17.042.248a3 3 0 015.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 00-3.732-10.104 1.837 1.837 0 00-1.47-.725H15.75z" />
      <path d="M19.5 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
    </svg>
  );
}

function DemoAwarenessBar() {
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(DEMO_BAR_STORAGE_KEY);
    setDismissed(storedValue === "true");
    setReady(true);
  }, []);

  if (!ready || dismissed) {
    return null;
  }

  return (
    <div className="border-b border-white/10 bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <p className="line-clamp-2 pr-2 text-[10px] font-medium leading-4 tracking-[0.01em] text-slate-100 sm:line-clamp-none sm:text-xs sm:leading-5">
          {"🚀 Live Demo — Chat to book a move, then switch to Operator View to see it update in real time"}
        </p>
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(DEMO_BAR_STORAGE_KEY, "true");
            setDismissed(true);
          }}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Dismiss demo awareness banner"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function OperatorToggle({ isOperatorView }: { isOperatorView: boolean }) {
  const href = isOperatorView ? "/" : "/dashboard";
  const label = isOperatorView ? "Switch to Customer View" : "Switch to Operator View";
  const Icon = isOperatorView ? HomeIcon : DashboardIcon;

  return (
    <Link
      href={href}
      className="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-slate-300 px-0 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 md:h-11 md:w-auto md:px-4"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isOperatorView = pathname.startsWith("/dashboard");

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
      <DemoAwarenessBar />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <TruckIcon />
          <span className="truncate text-lg font-bold tracking-tight text-[#0F172A] sm:text-xl">
            Van<span className="text-[#1E3A8A]">turo</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-[#64748B] md:flex">
          {isHome ? (
            <>
              <a href="#services" className="transition hover:text-[#1E3A8A]">
                Services
              </a>
              <a href="#reviews" className="transition hover:text-[#1E3A8A]">
                Reviews
              </a>
              <a href="#pricing" className="transition hover:text-[#1E3A8A]">
                Pricing
              </a>
            </>
          ) : (
            <>
              <Link href="/" className="transition hover:text-[#1E3A8A]">
                Home
              </Link>
              <Link href="/#services" className="transition hover:text-[#1E3A8A]">
                Services
              </Link>
              <Link href="/#pricing" className="transition hover:text-[#1E3A8A]">
                Pricing
              </Link>
            </>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <OperatorToggle isOperatorView={isOperatorView} />
          <Link href="/#pricing" className="btn-primary shrink-0 px-4 py-2.5 text-sm sm:px-5">
            <span className="sm:hidden">Get Quote</span>
            <span className="hidden sm:inline">Get Instant Quote</span>
          </Link>
        </div>
      </div>
    </header>
  );
}