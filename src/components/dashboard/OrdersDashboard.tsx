"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSignOutButton from "@/components/dashboard/AdminSignOutButton";

function ClipboardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path fillRule="evenodd" d="M7.5 3A1.5 1.5 0 006 4.5v.379a3 3 0 00-2.625 2.996v10.5A2.625 2.625 0 006 21h12a2.625 2.625 0 002.625-2.625v-10.5A3 3 0 0018 4.879V4.5A1.5 1.5 0 0016.5 3h-9zm1.5 1.5h6v1.125a.375.375 0 01-.375.375h-5.25A.375.375 0 019 5.625V4.5zm-3 4.125a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 8.625zm0 3.75a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zm.75 3a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-6z" clipRule="evenodd" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path fillRule="evenodd" d="M12 2.25A9.75 9.75 0 1021.75 12 9.75 9.75 0 0012 2.25zm.75 5.25a.75.75 0 00-1.5 0V12c0 .199.079.39.22.53l3 3a.75.75 0 101.06-1.06l-2.78-2.78V7.5z" clipRule="evenodd" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.28-2.03a.75.75 0 10-1.06-1.06l-4.22 4.22-1.72-1.72a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.75-4.75z" clipRule="evenodd" />
    </svg>
  );
}

function BanknotesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M4.5 6A2.25 2.25 0 006.75 8.25h10.5A2.25 2.25 0 0019.5 6V4.875A1.875 1.875 0 0017.625 3H6.375A1.875 1.875 0 004.5 4.875V6z" />
      <path fillRule="evenodd" d="M3 9.75A1.875 1.875 0 014.875 7.875h14.25A1.875 1.875 0 0121 9.75v9.375A1.875 1.875 0 0119.125 21H4.875A1.875 1.875 0 013 19.125V9.75zM12 11.25a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" clipRule="evenodd" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M12.97 4.97a.75.75 0 011.06 0l6 6a.75.75 0 010 1.06l-6 6a.75.75 0 11-1.06-1.06l4.72-4.72H4.5a.75.75 0 010-1.5h13.19l-4.72-4.72a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M11.54 22.351a.75.75 0 00.92 0c3.25-2.607 6.79-6.899 6.79-11.101a7.25 7.25 0 10-14.5 0c0 4.202 3.54 8.494 6.79 11.101zM12 9.75a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" />
    </svg>
  );
}

type DashboardOrder = {
  id: string;
  displayId?: string | null;
  pickup: {
    city?: string;
    state?: string;
    zip: string;
  };
  dropoff: {
    city?: string;
    state?: string;
    zip: string;
  };
  price: number;
  status: "pending" | "confirmed" | "completed";
  customer: {
    name: string;
  };
  createdAt: string;
};

type SortDirection = "newest" | "oldest";

const statusStyles: Record<DashboardOrder["status"], string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  completed: "bg-sky-50 text-sky-700 ring-sky-200",
};

const orderCardThemes: Record<DashboardOrder["status"], { shell: string; panel: string; accent: string; button: string }> = {
  pending: {
    shell: "border-amber-200/80 bg-[linear-gradient(145deg,rgba(255,247,237,1)_0%,rgba(255,255,255,1)_45%,rgba(254,243,199,0.92)_100%)]",
    panel: "bg-white/75 ring-1 ring-amber-100/80",
    accent: "from-amber-500 via-orange-500 to-yellow-400",
    button: "bg-amber-900 text-white",
  },
  confirmed: {
    shell: "border-emerald-200/80 bg-[linear-gradient(145deg,rgba(236,253,245,1)_0%,rgba(255,255,255,1)_45%,rgba(204,251,241,0.92)_100%)]",
    panel: "bg-white/75 ring-1 ring-emerald-100/80",
    accent: "from-emerald-500 via-teal-500 to-cyan-400",
    button: "bg-emerald-900 text-white",
  },
  completed: {
    shell: "border-sky-200/80 bg-[linear-gradient(145deg,rgba(239,246,255,1)_0%,rgba(255,255,255,1)_45%,rgba(224,242,254,0.96)_100%)]",
    panel: "bg-white/78 ring-1 ring-sky-100/80",
    accent: "from-sky-500 via-blue-500 to-indigo-400",
    button: "bg-slate-900 text-white",
  },
};

function formatLocation(location: DashboardOrder["pickup"]) {
  const parts = [location.city, location.state].filter(Boolean);
  return parts.length > 0 ? `${parts.join(", ")} (${location.zip})` : location.zip;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function OrdersDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | DashboardOrder["status"]>("all");
  const [sortDirection, setSortDirection] = useState<SortDirection>("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadOrders() {
      try {
        const response = await fetch("/api/orders", { cache: "no-store" });
        const data = (await response.json()) as { orders?: DashboardOrder[]; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load orders.");
        }

        if (active) {
          setOrders(data.orders ?? []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load orders.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadOrders();

    return () => {
      active = false;
    };
  }, []);

  const visibleOrders = useMemo(() => {
    const filteredOrders =
      statusFilter === "all"
        ? orders
        : orders.filter((order) => order.status === statusFilter);

    return [...filteredOrders].sort((firstOrder, secondOrder) => {
      const firstTime = new Date(firstOrder.createdAt).getTime();
      const secondTime = new Date(secondOrder.createdAt).getTime();

      return sortDirection === "newest" ? secondTime - firstTime : firstTime - secondTime;
    });
  }, [orders, sortDirection, statusFilter]);

  const metrics = useMemo(() => {
    const pendingCount = orders.filter((order) => order.status === "pending").length;
    const confirmedCount = orders.filter((order) => order.status === "confirmed").length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.price, 0);

    return [
      {
        label: "Active orders",
        value: String(orders.length),
        tone: "from-[#DBEAFE] to-white text-[#1D4ED8]",
        icon: <ClipboardIcon />,
      },
      {
        label: "Pending dispatch",
        value: String(pendingCount),
        tone: "from-[#FFEDD5] to-white text-[#C2410C]",
        icon: <ClockIcon />,
      },
      {
        label: "Confirmed moves",
        value: String(confirmedCount),
        tone: "from-[#DCFCE7] to-white text-[#15803D]",
        icon: <CheckCircleIcon />,
      },
      {
        label: "Booked revenue",
        value: formatCurrency(totalRevenue),
        tone: "from-[#E0F2FE] to-white text-[#0369A1]",
        icon: <BanknotesIcon />,
      },
    ];
  }, [orders]);

  return (
    <div className="w-full rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.45)] sm:p-8">
      <div className="overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_62%,#2563eb_100%)] px-5 py-6 text-white sm:px-7 sm:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-blue-100/90">
              Dashboard
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Orders overview
            </h1>
            <p className="mt-3 text-sm leading-6 text-blue-100/85 sm:text-base">
              Track active bookings, review routes, and manage dispatch status from a single operations board.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 xl:w-[420px]">
            <div className="flex justify-start sm:justify-end">
              <AdminSignOutButton className="border border-white/20 bg-white/10 text-white hover:bg-white/15" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className={`rounded-2xl bg-gradient-to-br ${metric.tone} p-4 ring-1 ring-white/15`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 text-current shadow-sm">
                    {metric.icon}
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-current/70">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-current">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-slate-50/70 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Filter orders
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Narrow the queue by status or switch sorting to focus on what needs attention next.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
          <label className="flex flex-col gap-2 text-sm text-slate-600">
            Status
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | DashboardOrder["status"])
              }
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-500"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-slate-600">
            Sort by date
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as SortDirection)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-500"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-sm text-slate-500">Loading orders...</p>
      ) : null}
      {error ? <p className="py-8 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <>
          <div className="mt-6 grid gap-4 md:hidden">
            {visibleOrders.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                No orders found.
              </div>
            ) : null}

            {visibleOrders.map((order) => (
              (() => {
                const cardTheme = orderCardThemes[order.status];

                return (
              <button
                key={order.id}
                type="button"
                onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                className={[
                  "group relative overflow-hidden rounded-[28px] border p-5 text-left shadow-[0_24px_50px_-36px_rgba(15,23,42,0.45)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_30px_60px_-32px_rgba(15,23,42,0.38)]",
                  cardTheme.shell,
                ].join(" ")}
              >
                <div className={[
                  "absolute inset-x-5 top-0 h-1 rounded-b-full bg-gradient-to-r",
                  cardTheme.accent,
                ].join(" ")} />
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/55 blur-3xl" aria-hidden="true" />

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">{order.displayId ?? order.id.slice(-8).toUpperCase()}</p>
                    <p className="text-lg font-semibold text-slate-900">{order.customer.name}</p>
                    <p className="mt-1 text-sm text-slate-600">Booked {formatDate(order.createdAt)}</p>
                  </div>

                  <span
                    className={[
                      "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset",
                      statusStyles[order.status],
                    ].join(" ")}
                  >
                    {order.status}
                  </span>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className={[
                    "rounded-2xl p-4 backdrop-blur-sm",
                    cardTheme.panel,
                  ].join(" ")}>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <MapPinIcon />
                      <p>Route</p>
                    </div>
                    <p className="mt-3 text-base leading-7 text-slate-800">
                      {formatLocation(order.pickup)}
                      <span className="mx-2 text-slate-300">→</span>
                      {formatLocation(order.dropoff)}
                    </p>
                  </div>

                  <div className={[
                    "rounded-2xl p-4 backdrop-blur-sm",
                    cardTheme.panel,
                  ].join(" ")}>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <BanknotesIcon />
                      <p>Booked price</p>
                    </div>
                    <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
                      {formatCurrency(order.price)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">Tap to inspect route, items, and status controls.</p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">Open order details</span>
                  <span className={[
                    "inline-flex h-10 w-10 items-center justify-center rounded-full shadow-sm transition-transform duration-200 group-hover:translate-x-0.5",
                    cardTheme.button,
                  ].join(" ")}>
                    <ArrowRightIcon />
                  </span>
                </div>
              </button>
                );
              })()
            ))}
          </div>

          <div className="mt-6 hidden overflow-x-auto rounded-[28px] border border-slate-200 md:block">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-4 font-semibold">Order ID</th>
                  <th className="px-5 py-4 font-semibold">Customer</th>
                  <th className="px-5 py-4 font-semibold">Route</th>
                  <th className="px-5 py-4 font-semibold">Price</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                {visibleOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                      No orders found.
                    </td>
                  </tr>
                ) : null}

                {visibleOrders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                    className="cursor-pointer transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-5 font-mono text-sm font-semibold text-slate-700">{order.displayId ?? order.id.slice(-8).toUpperCase()}</td>
                    <td className="px-5 py-5 font-medium text-slate-900">{order.customer.name}</td>
                    <td className="px-5 py-5">
                      {formatLocation(order.pickup)} {"->"} {formatLocation(order.dropoff)}
                    </td>
                    <td className="px-5 py-5 font-semibold text-slate-900">
                      {formatCurrency(order.price)}
                    </td>
                    <td className="px-5 py-5">
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset",
                          statusStyles[order.status],
                        ].join(" ")}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-5">{formatDate(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}