const REVIEWS = [
  {
    name: "Sarah M.",
    location: "Austin, TX → Denver, CO",
    rating: 5,
    text: "The crew was on time, professional, and took great care of all my furniture. Long-distance move and not a single item was damaged. Highly recommend!",
    avatar: "SM",
  },
  {
    name: "James R.",
    location: "Chicago, IL → New York, NY",
    rating: 5,
    text: "Used the chatbot to get a quote in under a minute. Booking was easy and the team delivered exactly on the day they promised. Fair price too.",
    avatar: "JR",
  },
  {
    name: "Lisa T.",
    location: "Miami, FL → Atlanta, GA",
    rating: 5,
    text: "Second time using Vanturo. They handled our piano and antique wardrobe with extra care. Won't use anyone else!",
    avatar: "LT",
  },
];

const TRUST_BADGES = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
        <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
      </svg>
    ),
    title: "Fully Insured",
    description: "Every move is covered up to $50,000. Your belongings are protected.",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
        <path fillRule="evenodd" d="M15 3.75a.75.75 0 00-.75-.75h-4.5a.75.75 0 00-.75.75v1.5H5.625A1.875 1.875 0 003.75 7.125v.965c0 2.273 1.616 4.239 3.842 4.681A5.252 5.252 0 0011.25 15.75h1.5a5.252 5.252 0 003.658-2.979c2.226-.442 3.842-2.408 3.842-4.681v-.965a1.875 1.875 0 00-1.875-1.875H15v-1.5zM5.25 8.09v-.965a.375.375 0 01.375-.375h2.662a5.268 5.268 0 00-.046.694v3.536A3.753 3.753 0 015.25 8.09zm10.463 2.89V7.444c0-.236-.016-.468-.046-.694h2.708a.375.375 0 01.375.375v.965a3.753 3.753 0 01-3.037 3.89zM9 19.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 019 19.5z" clipRule="evenodd" />
      </svg>
    ),
    title: "15 Years Experience",
    description: "Over a decade serving families and businesses across all 50 states.",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
        <path fillRule="evenodd" d="M11.54 22.351a.75.75 0 00.92 0c4.28-3.45 7.04-7.767 7.04-11.601 0-4.35-3.358-7.875-7.5-7.875s-7.5 3.525-7.5 7.875c0 3.834 2.76 8.151 7.04 11.601zM12 13.5a2.625 2.625 0 100-5.25 2.625 2.625 0 000 5.25z" clipRule="evenodd" />
      </svg>
    ),
    title: "FMCSA Licensed",
    description: "Registered and compliant with the Federal Motor Carrier Safety Administration.",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
        <path fillRule="evenodd" d="M12 1.5a4.5 4.5 0 00-4.5 4.5V9H6a2.25 2.25 0 00-2.25 2.25v8.25A2.25 2.25 0 006 21.75h12a2.25 2.25 0 002.25-2.25v-8.25A2.25 2.25 0 0018 9h-1.5V6A4.5 4.5 0 0012 1.5zm3 7.5V6A3 3 0 009 6V9h6z" clipRule="evenodd" />
      </svg>
    ),
    title: "No Hidden Fees",
    description: "The price you see in your quote is the price you pay. Always.",
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg
          key={i}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 text-amber-400"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
            clipRule="evenodd"
          />
        </svg>
      ))}
    </div>
  );
}

export default function TrustSection() {
  return (
    <>
      <section className="bg-[#F8FAFC] px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="section-label">
              Why us
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
              Moving You Can Trust
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#64748B]">
              Built for reliability, communication, and on-time delivery, with the licensing and customer support you expect from a real national mover.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_BADGES.map((badge) => (
              <div
                key={badge.title}
                className="rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm sm:p-6"
              >
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#DBEAFE] text-[#1E3A8A]" aria-hidden="true">
                  {badge.icon}
                </span>
                <h3 className="mt-4 text-base font-bold text-[#0F172A]">{badge.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#64748B]">{badge.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="reviews" className="bg-white px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="section-label">
              Customer reviews
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
              Real People, Real Moves
            </h2>
            <p className="mt-3 text-[#64748B]">
              Rated <strong>4.9 / 5</strong> from over 2,400 verified customers
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {REVIEWS.map((review) => (
              <figure
                key={review.name}
                className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-[#F8FAFC] p-5 shadow-sm sm:p-7"
              >
                <blockquote>
                  <StarRating count={review.rating} />
                  <p className="mt-4 text-sm leading-7 text-[#475569]">&ldquo;{review.text}&rdquo;</p>
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E3A8A] text-xs font-bold text-white">
                    {review.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0F172A]">{review.name}</p>
                    <p className="text-xs text-[#64748B]">{review.location}</p>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
