import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-6 w-6 shrink-0 text-[#1E3A8A] sm:h-7 sm:w-7"
            aria-hidden="true"
          >
            <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25zM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875H3a3 3 0 106 0h3.75a.75.75 0 00.75-.75V15z" />
            <path d="M8.25 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zM15.75 6.75a.75.75 0 00-.75.75v11.25c0 .087.015.17.042.248a3 3 0 015.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 00-3.732-10.104 1.837 1.837 0 00-1.47-.725H15.75z" />
            <path d="M19.5 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
          </svg>
          <span className="truncate text-lg font-bold tracking-tight text-[#0F172A] sm:text-xl">
            Van<span className="text-[#1E3A8A]">turo</span>
          </span>
        </div>

        <nav className="hidden items-center gap-8 text-sm font-medium text-[#64748B] md:flex">
          <a href="#services" className="transition hover:text-[#1E3A8A]">
            Services
          </a>
          <a href="#reviews" className="transition hover:text-[#1E3A8A]">
            Reviews
          </a>
          <a href="#pricing" className="transition hover:text-[#1E3A8A]">
            Pricing
          </a>
        </nav>

        <Link href="#pricing" className="btn-primary shrink-0 px-4 py-2.5 text-sm sm:px-5">
          <span className="sm:hidden">Get Quote</span>
          <span className="hidden sm:inline">Get Instant Quote</span>
        </Link>
      </div>
    </header>
  );
}
