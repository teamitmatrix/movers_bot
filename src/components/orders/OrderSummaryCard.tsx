type OrderStatus = "pending" | "confirmed" | "completed";

type LocationDetails = {
  address?: string;
  city?: string;
  state?: string;
  zip: string;
};

type OrderItem = {
  type: string;
  quantity: number;
};

export type OrderSummaryCardProps = {
  pickup: LocationDetails;
  dropoff: LocationDetails;
  items: OrderItem[];
  distance: number;
  totalPrice: number;
  status: OrderStatus;
  className?: string;
};

const statusStyles: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  completed: "bg-slate-100 text-slate-700 ring-slate-200",
};

function formatLocation(location: LocationDetails) {
  const parts = [location.address, location.city, location.state].filter(Boolean);

  return parts.length > 0 ? `${parts.join(", ")} (${location.zip})` : location.zip;
}

function formatItemLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatStatus(status: OrderStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function OrderSummaryCard({
  pickup,
  dropoff,
  items,
  distance,
  totalPrice,
  status,
  className,
}: OrderSummaryCardProps) {
  return (
    <section
      className={[
        "w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1E3A8A]">
            Order Summary
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0F172A]">
            Your move is booked
          </h2>
          <p className="mt-1 text-sm text-[#64748B]">
            Review your trip details, inventory, and booking status below.
          </p>
        </div>

        <span
          className={[
            "inline-flex w-fit rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset",
            statusStyles[status],
          ].join(" ")}
        >
          {formatStatus(status)}
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-[#F8FAFC] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A8A]">
            Pickup
          </p>
          <p className="mt-2 text-sm leading-6 text-[#0F172A]">{formatLocation(pickup)}</p>
        </div>

        <div className="rounded-2xl bg-[#F8FAFC] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A8A]">
            Dropoff
          </p>
          <p className="mt-2 text-sm leading-6 text-[#0F172A]">{formatLocation(dropoff)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-[#F8FAFC] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A8A]">
            Items
          </p>
          <p className="text-xs text-[#64748B]">{items.length} line items</p>
        </div>

        <ul className="mt-3 space-y-3">
          {items.map((item, index) => (
            <li
              key={`${item.type}-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <span className="font-medium text-[#0F172A]">{formatItemLabel(item.type)}</span>
              <span className="text-[#64748B]">x{item.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">
            Distance
          </p>
          <p className="mt-2 text-xl font-bold text-[#0F172A]">{distance} miles</p>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">
            Total Price
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-2xl font-bold text-[#0F172A]">{formatCurrency(totalPrice)}</p>
            <p className="text-sm text-[#64748B]">Final booked total</p>
          </div>
        </div>
      </div>
    </section>
  );
}