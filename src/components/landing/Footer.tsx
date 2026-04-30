import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  const companyLinks = [
    { label: "About Us", href: "/#about" },
    { label: "Reviews", href: "/#reviews" },
    { label: "Get a Quote", href: "/#pricing" },
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms of Service", href: "/terms-of-service" },
  ];

  return (
    <footer id="site-footer" className="bg-[#0F172A] px-4 py-14 text-slate-200 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="col-span-1 lg:col-span-2">
            <div className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-6 w-6 text-[#F97316]"
                aria-hidden="true"
              >
                <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25zM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875H3a3 3 0 106 0h3.75a.75.75 0 00.75-.75V15z" />
                <path d="M8.25 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zM15.75 6.75a.75.75 0 00-.75.75v11.25c0 .087.015.17.042.248a3 3 0 015.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 00-3.732-10.104 1.837 1.837 0 00-1.47-.725H15.75z" />
                <path d="M19.5 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
              </svg>
              <span className="text-lg font-bold text-white">
                Van<span className="text-[#F97316]">turo</span>
              </span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">
              America&apos;s trusted moving company. Serving all 50 states since 2009.
              FMCSA licensed &bull; Fully insured &bull; No hidden fees.
              USDOT licensed &bull; vanturo.com
            </p>
            <p className="mt-4 flex flex-col gap-1 text-sm text-slate-300 sm:block">
              <a href="tel:+18001234567" className="hover:text-white">
                1-800-123-4567
              </a>
              <span className="hidden sm:inline"> {"·"} </span>
              <a href="mailto:support@vanturo.com" className="hover:text-white break-all">
                support@vanturo.com
              </a>
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Services</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
              {[
                "Local Moves",
                "Long-Distance Moving",
                "Furniture Moving",
                "Packing Services",
                "Storage Solutions",
                "Commercial Moving",
              ].map((item) => (
                <li key={item}>
                  <a href="#services" className="hover:text-white">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white">Company</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-slate-400">
          &copy; {year} Vanturo LLC. All rights reserved. USDOT #1234567
        </div>
      </div>
    </footer>
  );
}
