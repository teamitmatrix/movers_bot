"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminSignOutButton from "@/components/dashboard/AdminSignOutButton";

function RouteIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path fillRule="evenodd" d="M6 6.75A2.25 2.25 0 108.25 9 2.25 2.25 0 006 6.75zm12 8.25a2.25 2.25 0 10-2.25 2.25A2.25 2.25 0 0018 15zm-11.47-5.72a.75.75 0 01.94-.5c2.467.822 4.51 2.41 5.927 4.47l.503.733V12a.75.75 0 011.5 0v3.75a.75.75 0 01-.75.75H11.25a.75.75 0 010-1.5h1.856l-.944-1.376c-1.237-1.8-3.025-3.195-5.132-3.898a.75.75 0 01-.5-.946z" clipRule="evenodd" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5a18.683 18.683 0 01-7.812-1.7.75.75 0 01-.437-.695z" clipRule="evenodd" />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M12.378 1.602a.75.75 0 00-.756 0l-8.25 4.762A.75.75 0 003 7.014v9.472a.75.75 0 00.372.65l8.25 4.762a.75.75 0 00.756 0l8.25-4.762a.75.75 0 00.372-.65V7.014a.75.75 0 00-.372-.65l-8.25-4.762z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path fillRule="evenodd" d="M2.25 13.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v6a.75.75 0 01-.75.75H3a.75.75 0 01-.75-.75v-6zm7.5-9a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v15a.75.75 0 01-.75.75h-3a.75.75 0 01-.75-.75v-15zm7.5 4.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75h-3a.75.75 0 01-.75-.75V9z" clipRule="evenodd" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3a.75.75 0 011.5 0v1.5h.75A2.25 2.25 0 0121 6.75v11.25A2.25 2.25 0 0118.75 20.25H5.25A2.25 2.25 0 013 18V6.75A2.25 2.25 0 015.25 4.5H6V3a.75.75 0 01.75-.75zM4.5 9.75v8.25c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75V9.75H4.5z" clipRule="evenodd" />
    </svg>
  );
}

type OrderStatus = "pending" | "confirmed" | "completed";

type OrderResponse = {
  order: {
    id: string;
    displayId?: string | null;
    pickup: {
      address?: string;
      city?: string;
      state?: string;
      zip: string;
    };
    dropoff: {
      address?: string;
      city?: string;
      state?: string;
      zip: string;
    };
    items: Array<{
      type: string;
      quantity: number;
    }>;
    price: number;
    customer: {
      name: string;
      phone: string;
      email?: string;
    };
    status: OrderStatus;
    priceBreakdown: {
      distance: number;
      basePrice: number;
      itemCost: number;
      totalPrice: number;
      breakdown: {
        pricingTier: string;
        pickupZip: string;
        dropoffZip: string;
        items: Array<{
          type: string;
          quantity: number;
          unitPrice: number;
          total: number;
        }>;
      };
    } | null;
    createdAt: string;
  };
};

function formatLocation(location: OrderResponse["order"]["pickup"]) {
  const details = [location.address, location.city, location.state].filter(Boolean);

  return details.length > 0 ? `${details.join(", ")} (${location.zip})` : location.zip;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

const statusStyles: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  completed: "bg-sky-50 text-sky-700 ring-sky-200",
};

const timelineSteps: Array<{ key: OrderStatus; label: string; description: string }> = [
  {
    key: "pending",
    label: "Pending intake",
    description: "Order captured and waiting for operations review.",
  },
  {
    key: "confirmed",
    label: "Confirmed for dispatch",
    description: "Crew assignment and move coordination are active.",
  },
  {
    key: "completed",
    label: "Completed delivery",
    description: "Move has been finalized and recorded successfully.",
  },
];

export default function OrderDetailsView({ id }: { id: string }) {
  const [order, setOrder] = useState<OrderResponse["order"] | null>(null);
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadOrder() {
      try {
        const response = await fetch(`/api/orders/${id}`, { cache: "no-store" });
        const data = (await response.json()) as OrderResponse & { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load order.");
        }

        if (active) {
          setOrder(data.order);
          setStatus(data.order.status);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load order.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadOrder();

    return () => {
      active = false;
    };
  }, [id]);

  async function handleStatusChange(nextStatus: OrderStatus) {
    setStatus(nextStatus);
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = (await response.json()) as OrderResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to update order.");
      }

      setOrder(data.order);
      setStatus(data.order.status);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update order.");
      setStatus(order?.status ?? "pending");
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) {
    return <p className="py-8 text-sm text-slate-500">Loading order...</p>;
  }

  if (error && !order) {
    return <p className="py-8 text-sm text-red-600">{error}</p>;
  }

  if (!order) {
    return <p className="py-8 text-sm text-slate-500">Order not found.</p>;
  }

  const currentStatusIndex = timelineSteps.findIndex((step) => step.key === status);

  return (
    <div className="w-full rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.45)] sm:p-8">
      <div className="overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_60%,#2563eb_100%)] px-5 py-6 text-white sm:px-7 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-blue-100/90">
              Order Details
            </p>
            <p className="mt-1 text-base font-mono font-semibold tracking-widest text-blue-300">
              {order.displayId ?? order.id}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {order.customer.name}
            </h1>
            <p className="mt-3 text-sm leading-6 text-blue-100/85 sm:text-base">
              Review route details, customer contact info, booked inventory, and pricing performance for this move.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
            <span
              className={[
                "inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] ring-1 ring-inset",
                statusStyles[status],
              ].join(" ")}
            >
              {status}
            </span>
            <AdminSignOutButton className="border border-white/20 bg-white/10 text-white hover:bg-white/15" />
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white/90">
              <ChartIcon />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/80">Booked price</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{formatCurrency(order.price)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white/90">
              <RouteIcon />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/80">Route</p>
            <p className="mt-2 text-sm leading-6 text-white/90">
              {order.pickup.zip} → {order.dropoff.zip}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white/90">
              <CubeIcon />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/80">Inventory lines</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{order.items.length}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white/90">
              <CalendarIcon />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/80">Created</p>
            <p className="mt-2 text-sm leading-6 text-white/90">{formatDate(order.createdAt)}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5 sm:p-6 xl:sticky xl:top-6 xl:self-start">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DBEAFE] text-[#1D4ED8]">
              <ChartIcon />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Status timeline
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Follow the move from intake to completed delivery.
              </p>
            </div>
          </div>

          <ol className="mt-6 space-y-5">
            {timelineSteps.map((step, index) => {
              const isComplete = index <= currentStatusIndex;
              const isCurrent = index === currentStatusIndex;

              return (
                <li key={step.key} className="relative flex gap-4">
                  <div className="relative flex w-8 shrink-0 justify-center">
                    {index < timelineSteps.length - 1 ? (
                      <span
                        className={[
                          "absolute top-8 h-[calc(100%+1rem)] w-px",
                          isComplete ? "bg-emerald-300" : "bg-slate-200",
                        ].join(" ")}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className={[
                        "mt-1 flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold",
                        isCurrent
                          ? "border-emerald-400 bg-emerald-500 text-white"
                          : isComplete
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-400",
                      ].join(" ")}
                    >
                      {index + 1}
                    </span>
                  </div>

                  <div className="pb-2">
                    <p className={[
                      "text-sm font-semibold",
                      isCurrent || isComplete ? "text-slate-900" : "text-slate-500",
                    ].join(" ")}>
                      {step.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="grid gap-4">
        <section className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DBEAFE] text-[#1D4ED8]">
              <RouteIcon />
            </div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Move summary
            </h2>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pickup</p>
              <p className="mt-2 text-base leading-7 text-slate-800">{formatLocation(order.pickup)}</p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Dropoff</p>
              <p className="mt-2 text-base leading-7 text-slate-800">{formatLocation(order.dropoff)}</p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                <UserIcon />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer</p>
              <div className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
                <p>Name: {order.customer.name}</p>
                <p>Phone: {order.customer.phone}</p>
                <p>Email: {order.customer.email ?? "Not provided"}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status control</p>
              <div className="mt-3 space-y-3">
                <select
                  value={status}
                  onChange={(event) => handleStatusChange(event.target.value as OrderStatus)}
                  disabled={isSaving}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                </select>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E0F2FE] text-[#0369A1]">
                <CubeIcon />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Item list
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
              {order.items.length} lines
            </span>
          </div>

          <ul className="mt-5 space-y-3">
            {order.items.map((item, index) => (
              <li
                key={`${item.type}-${index}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              >
                <span className="font-medium capitalize text-slate-900">{item.type}</span>
                <span className="text-slate-500">x {item.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      </div>

      <section className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DBEAFE] text-[#1D4ED8]">
            <ChartIcon />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Price breakdown
          </h2>
        </div>

        {order.priceBreakdown ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Distance</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {order.priceBreakdown.distance}
                </p>
                <p className="mt-1 text-sm text-slate-500">miles</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pricing tier</p>
                <p className="mt-2 text-lg font-bold tracking-tight text-slate-900">
                  {order.priceBreakdown.breakdown.pricingTier}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Calculated total</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {formatCurrency(order.priceBreakdown.totalPrice)}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Saved price</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                  {formatCurrency(order.price)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 sm:p-5">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-900">Itemized costs</p>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1">Base {formatCurrency(order.priceBreakdown.basePrice)}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">Items {formatCurrency(order.priceBreakdown.itemCost)}</span>
                </div>
              </div>

              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {order.priceBreakdown.breakdown.items.map((item, index) => (
                  <li
                    key={`${item.type}-${index}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium capitalize text-slate-900">{item.type}</p>
                      <p className="text-xs text-slate-500">{item.quantity} × {formatCurrency(item.unitPrice)}</p>
                    </div>
                    <p className="font-semibold text-slate-900">{formatCurrency(item.total)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Price breakdown is not available for this order.</p>
        )}
      </section>
    </div>
  );
}