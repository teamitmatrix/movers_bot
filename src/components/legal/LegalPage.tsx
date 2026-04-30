import Link from "next/link";

type LegalSection = {
  heading: string;
  body: string[];
};

type LegalPageProps = {
  title: string;
  summary: string;
  sections: LegalSection[];
};

export default function LegalPage({ title, summary, sections }: LegalPageProps) {
  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:rounded-[32px] sm:p-10">
        <Link href="/" className="text-sm font-medium text-[#1E3A8A] hover:text-[#0F172A]">
          Back to home
        </Link>

        <div className="mt-6 border-b border-slate-200 pb-8">
          <span className="section-label">Legal</span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#64748B]">{summary}</p>
        </div>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-bold text-[#0F172A]">{section.heading}</h2>
              <div className="mt-3 space-y-4 text-sm leading-7 text-[#475569] sm:text-base">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}