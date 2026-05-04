export default function HeroSection({ onQuoteClick }: { onQuoteClick: () => void }) {
  const highlights = [
    "FMCSA licensed and fully insured crews",
    "Transparent quotes with no hidden fees",
    "Local and long-distance moves across the US",
  ];

  const stats = [
    { value: "10,000+", label: "Moves completed" },
    { value: "4.9/5", label: "Verified customer rating" },
    { value: "15 Years", label: "Serving homes and businesses" },
  ];

  return (
    <section className="bg-[#F8FAFC] px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 sm:gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <span className="inline-flex max-w-full rounded-full border border-[#DBEAFE] bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1E3A8A] shadow-sm sm:px-4 sm:text-xs sm:tracking-[0.2em]">
            Trusted nationwide moving partner
          </span>

          <h1 className="mt-5 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-[#0F172A] sm:mt-6 sm:text-5xl lg:text-6xl">
            Professional, reliable <span className="text-[#1E3A8A]">Moving Services</span> for homes and businesses across the US
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-[#64748B] sm:mt-6 sm:text-lg sm:leading-8">
            Vanturo handles local relocations, long-distance moves, packing, and specialty items with licensed crews, clear pricing, and real customer support from quote to delivery.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-[#334155] sm:text-base">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[#1E3A8A]">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.415 0l-3-3a1 1 0 011.415-1.414l2.293 2.293 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:gap-4">
            <button onClick={onQuoteClick} className="btn-primary w-full px-6 py-4 text-base sm:w-auto sm:px-8">
              Get Instant Quote
            </button>
            <span className="btn-secondary w-full px-6 py-4 text-base sm:w-auto sm:px-8 cursor-default">
              Call Us
            </span>
          </div>

          <p className="mt-4 text-sm text-[#64748B]">
            Average quote time: under 60 seconds. No obligation.
          </p>
        </div>

        <div className="relative">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_25px_60px_-35px_rgba(15,23,42,0.25)] sm:p-8">
            <div className="flex flex-col gap-4 rounded-2xl bg-[#1E3A8A] px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">Move planning</p>
                <p className="mt-1 text-lg font-bold sm:text-xl">Simple process. Clear pricing.</p>
              </div>
              <div className="self-start rounded-2xl bg-white/10 px-3 py-2 text-left sm:self-auto sm:text-right">
                <p className="text-xs text-blue-100">Support line</p>
                <p className="text-sm font-semibold">(555) 100-2000</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#F8FAFC] p-4 sm:p-5">
                <p className="text-sm font-semibold text-[#1E3A8A]">Included in every move</p>
                <p className="mt-2 text-sm leading-6 text-[#64748B]">
                  Loading, unloading, furniture protection, and dedicated move coordination from start to finish.
                </p>
              </div>
              <div className="rounded-2xl bg-[#FFF7ED] p-4 sm:p-5">
                <p className="text-sm font-semibold text-[#C2410C]">Instant quote access</p>
                <p className="mt-2 text-sm leading-6 text-[#9A3412]">
                  Use the chat assistant anytime to estimate pricing and book your move without waiting for callbacks.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200">
              {stats.map((stat, index) => (
                <div
                  key={stat.label}
                  className={`flex items-center justify-between gap-4 px-4 py-4 sm:px-5 ${index !== stats.length - 1 ? "border-b border-slate-200" : ""}`}
                >
                  <p className="text-sm font-medium text-[#475569]">{stat.label}</p>
                  <p className="shrink-0 text-lg font-bold text-[#0F172A]">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="absolute -bottom-6 -left-4 hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A8A]">Next availability</p>
            <p className="mt-1 text-sm font-semibold text-[#0F172A]">Weekend and after-hours moves available</p>
          </div>
        </div>
      </div>
    </section>
  );
}
