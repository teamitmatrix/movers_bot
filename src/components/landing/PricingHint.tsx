export default function PricingHint({ onQuoteClick }: { onQuoteClick: () => void }) {
  return (
    <section id="pricing" className="bg-[#F8FAFC] px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-5xl rounded-[28px] bg-[#1E3A8A] px-5 py-10 text-center text-white shadow-[0_30px_60px_-35px_rgba(30,58,138,0.65)] sm:rounded-[32px] sm:px-12 sm:py-12">
        <span className="inline-block rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
          Transparent pricing
        </span>

        <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-4xl">
          Get Your Instant Quote in 60 Seconds
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-blue-100">
          Enter your pickup ZIP, destination ZIP, and what you need moved. Our assistant gives you a fast, structured estimate so you can plan with confidence.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm text-blue-100">
          {[
            "✓ No commitment required",
            "✓ Instant pricing guidance",
            "✓ Book in 2 minutes",
          ].map((item) => (
            <span key={item} className="rounded-full border border-white/15 px-3 py-1.5">
              {item}
            </span>
          ))}
        </div>

        <button
          onClick={onQuoteClick}
          className="btn-primary mt-10 w-full px-8 py-4 text-base font-bold sm:w-auto"
        >
          Get Instant Quote
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <p className="mt-5 text-xs text-blue-100/80">
          Average quote time: 45 seconds &bull; No credit card required
        </p>
      </div>
    </section>
  );
}
