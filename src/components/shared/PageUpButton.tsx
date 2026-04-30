"use client";

type PageUpButtonProps = {
  className?: string;
};

function ChevronUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path fillRule="evenodd" d="M11.47 8.47a.75.75 0 011.06 0l5.25 5.25a.75.75 0 11-1.06 1.06L12 10.06l-4.72 4.72a.75.75 0 11-1.06-1.06l5.25-5.25z" clipRule="evenodd" />
    </svg>
  );
}

export default function PageUpButton({ className = "" }: PageUpButtonProps) {
  function handleClick() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Scroll to top"
      className={[
        "fixed bottom-4 left-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)] transition hover:-translate-y-1 hover:shadow-[0_22px_44px_-18px_rgba(15,23,42,0.38)] sm:bottom-6 sm:left-6",
        className,
      ].join(" ")}
    >
      <ChevronUpIcon />
    </button>
  );
}