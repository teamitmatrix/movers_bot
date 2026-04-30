export default function AboutSection() {
  const pillars = [
    {
      title: "Licensed and insured",
      description:
        "We operate with licensed crews, insured moves, and clear handling standards for homes, apartments, and offices.",
    },
    {
      title: "Reliable scheduling",
      description:
        "From weekday moves to weekend availability, we keep customers informed and focused on a smooth move day.",
    },
    {
      title: "Straightforward pricing",
      description:
        "Quotes are built around your route and inventory, with no hidden-fee positioning or vague upsell language.",
    },
  ];

  return (
    <section id="about" className="bg-[#F8FAFC] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-8 sm:gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div>
          <span className="section-label">About us</span>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
            A moving company built for clarity, trust, and execution
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#64748B]">
            Vanturo helps customers plan local and long-distance moves with professional crews,
            transparent pricing, and responsive support. We focus on the basics that matter most:
            accurate quotes, careful handling, and reliable communication.
          </p>
          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1E3A8A]">
              What customers can expect
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-[#475569]">
              <li>Dedicated support from quote through move completion</li>
              <li>Coverage for residential, apartment, storage, and office moves</li>
              <li>Professional handling of furniture, specialty items, and packed boxes</li>
            </ul>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DBEAFE] text-[#1E3A8A]">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                  <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-bold text-[#0F172A]">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-7 text-[#64748B]">{pillar.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}