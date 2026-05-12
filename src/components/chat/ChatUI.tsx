"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import {
  buildQuoteAdjustmentSummary,
  getUpsellAddOns,
  SERVICE_ADDONS,
  type ServiceAddOnId,
} from "@/lib/bookingPricing";
import { calculateMovePrice, type PricingItem, type PricingResult } from "@/lib/pricing";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  quickReplies?: string[];
  contactSnapshot?: ContactFormData;
  leadSnapshot?: LeadFormData;
  bookingSummary?: {
    orderRecordId?: string;
    orderId: string;
    totalPrice?: number;
    pickupZip: string;
    dropoffZip: string;
    moveDate: string;
    inventorySize: string;
    itemSummary?: string;
    customerName: string;
    reminderCall?: boolean;
    selectedAddOns?: ServiceAddOnId[];
    discountApplied?: boolean;
    discountAmount?: number;
  };
};

type ContactFormData = {
  name: string;
  phone: string;
  email: string;
};

type LeadFormData = {
  name: string;
  phone: string;
};

type BookingStep = "idle" | "prequote-inventory" | "item-entry" | "upsell" | "move-date" | "inventory" | "contact" | "lead-contact" | "reminder";

type SessionPartialData = {
  pickupZip?: string;
  dropoffZip?: string;
  items?: PricingItem[];
  selectedAddOns?: ServiceAddOnId[];
  upsellReviewed?: boolean;
  discountApplied?: boolean;
  reminderCall?: boolean;
  afterHoursSession?: boolean;
  moveDate?: string;
  inventorySize?: string;
  customerName?: string;
  leadCaptured?: boolean;
};

type ChatStructuredData = {
  details?: SessionPartialData | null;
  priceQuote?: PricingResult | null;
  prompt?:
    | {
        type: "discount-offer";
        discountedTotal: number;
      }
    | {
        type: "lead-capture";
      }
    | {
        type: "quick-replies";
        options: string[];
      }
    | null;
  order?: {
    recordId?: string | null;
    id?: string | null;
    totalPrice?: number;
    selectedAddOns?: ServiceAddOnId[];
    discountApplied?: boolean;
    discountAmount?: number;
    reminderCall?: boolean;
    afterHours?: boolean;
    pickupZip?: string;
    dropoffZip?: string;
    items?: PricingItem[];
    moveDate?: string;
    inventorySize?: string;
    customerName?: string;
  } | null;
};

const MOVE_DATE_OPTIONS = ["This week", "Next week", "This month", "I'm flexible"] as const;
const INVENTORY_OPTIONS = [
  "Studio / 1 bed",
  "2-3 bedroom home",
  "4+ bedroom home",
  "Office / Commercial",
  "Just a few items",
] as const;

const UPSELL_PROMPT = "Would you like to add any of these services?";
const MOVE_DATE_PROMPT = "Great! When are you planning to move?";
const INVENTORY_PROMPT = "What are you moving? This helps us send the right crew.";
const ITEM_DETAILS_PROMPT = "Please list the main items for this move (example: 1 sofa, 2 beds, 10 boxes).";
const CONTACT_PROMPT = "Perfect. Please fill in your contact details below so we can lock this in.";
const LEAD_PROMPT = "Share your name and best phone number below and we’ll follow up when you’re ready.";
const REMINDER_PROMPT = "One last thing — would you like a reminder call the evening before your move?";
const REMINDER_OPTIONS = ["Yes please", "No thanks"] as const;

const SESSION_KEY = "movers_session_id";
const GLOBAL_FAQ_RE = /\b(same[ -]?day|today|piano|pianos|antique|antiques|specialty items?|fragile items?|payment methods?|credit cards?|cash|zelle|storage|climate[- ]controlled|reschedule|cancel(?:lation)?|cancellations?|OID-\d+)\b/i;
const FAQ_CONTINUE_LABEL = "Continue Booking";
const FAQ_ASK_LABEL = "Ask Something Else";

function isAfterHoursNow() {
  const hour = new Date().getHours();
  return hour >= 20 || hour < 8;
}

function buildWelcomeMessage(afterHours: boolean): Message {
  return {
    id: "welcome",
    role: "assistant",
    content: afterHours
      ? "Hi! Welcome to Vanturo Moving. I can get you a full quote and reserve your move right now, and a coordinator will confirm your crew by 9am tomorrow. Want to book a new move or check an existing booking?"
      : "Hi! I'm Maya from Vanturo Moving. Let's get you a quote in under 60 seconds — what's your pickup ZIP code?",
  };
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getTypingDelay() {
  return 1200 + Math.floor(Math.random() * 601);
}

function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isGlobalFaqInput(value: string) {
  return GLOBAL_FAQ_RE.test(value.trim());
}

function isConversationalInterrupt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  return /\?|^(hi|hello|hey|good\s+(morning|afternoon|evening)|what|who|where|when|why|how|can|could|do|does|did|is|are|will|would|should)\b/i.test(trimmed);
}

function formatItemSummary(items: PricingItem[] | undefined) {
  if (!items || items.length === 0) {
    return "";
  }

  return items
    .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0)
    .map((item) => {
      const noun = item.quantity === 1 ? item.type : `${item.type}s`;
      return `${item.quantity} ${noun}`;
    })
    .join(", ");
}

async function getOrCreateSessionId(): Promise<string> {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const response = await fetch("/api/sessions", { method: "POST" });
  if (!response.ok) {
    let errorMessage = `Could not start a session (${response.status}).`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) {
        errorMessage = data.error;
      }
    } catch {
      // Ignore JSON parsing errors and keep the status-based fallback message.
    }
    throw new Error(errorMessage);
  }
  const data = (await response.json()) as { sessionId: string };
  localStorage.setItem(SESSION_KEY, data.sessionId);
  return data.sessionId;
}

function ContactInlineForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: ContactFormData) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    onSubmit({ name: name.trim(), phone: phone.trim(), email: email.trim() });
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 disabled:opacity-50";

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm"
    >
      <p className="mb-3 font-semibold text-slate-800">Complete your booking:</p>
      <div className="space-y-2">
        <input
          required
          type="text"
          placeholder="Full name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <input
          required
          type="tel"
          placeholder="Phone number *"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <input
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={isLoading || !name.trim() || !phone.trim()}
          className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {isLoading ? "Confirming…" : "Confirm Booking"}
        </button>
      </div>
    </form>
  );
}

function LeadInlineForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: LeadFormData) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    onSubmit({ name: name.trim(), phone: phone.trim() });
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 disabled:opacity-50";

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm"
    >
      <p className="mb-3 font-semibold text-slate-800">Stay in touch:</p>
      <div className="space-y-2">
        <input
          required
          type="text"
          placeholder="Full name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <input
          required
          type="tel"
          placeholder="Phone number *"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={isLoading || !name.trim() || !phone.trim()}
          className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
        >
          {isLoading ? "Saving…" : "Save for follow-up"}
        </button>
      </div>
    </form>
  );
}

function BookingQuickReplies({
  options,
  onSelect,
  disabled,
}: {
  options: readonly string[];
  onSelect: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(option)}
          className="min-h-11 max-w-full rounded-full border border-blue-200 bg-blue-50 px-4 py-2.5 text-left text-sm font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10 sm:px-3 sm:py-2"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function MoveDatePicker({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (value: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState("");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Or pick a date
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="date"
          value={selectedDate}
          min={new Date().toISOString().split("T")[0]}
          onChange={(event) => setSelectedDate(event.target.value)}
          disabled={disabled}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || !selectedDate}
          onClick={() => onSubmit(formatCalendarDate(selectedDate))}
          className="inline-flex justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use date
        </button>
      </div>
    </div>
  );
}

function UpsellSelector({
  selectedAddOns,
  skipped,
  disabled,
  onToggle,
  onSkip,
  onContinue,
}: {
  selectedAddOns: ServiceAddOnId[];
  skipped: boolean;
  disabled: boolean;
  onToggle: (value: ServiceAddOnId) => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const upsellAddOns = getUpsellAddOns();

  return (
    <div className="space-y-3 rounded-3xl border border-orange-100 bg-[linear-gradient(145deg,#fff7ed_0%,#ffffff_45%,#ffedd5_100%)] p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {upsellAddOns.map((addOn) => {
          const isSelected = selectedAddOns.includes(addOn.id);

          return (
            <button
              key={addOn.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(addOn.id)}
              className={[
                "rounded-2xl border px-4 py-3 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                isSelected
                  ? "border-orange-500 bg-orange-500 text-white shadow-sm"
                  : "border-orange-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50",
              ].join(" ")}
            >
              {addOn.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={onSkip}
          className={[
            "rounded-2xl border px-4 py-3 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
            skipped
              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
          ].join(" ")}
        >
          No thanks, just the move
        </button>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onContinue}
        className="inline-flex rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  );
}

function BookingSummaryCard({
  summary,
}: {
  summary: NonNullable<Message["bookingSummary"]>;
}) {
  const addOnNames = SERVICE_ADDONS.filter((addOn) => summary.selectedAddOns?.includes(addOn.id)).map(
    (addOn) => addOn.shortLabel
  );
  const hasAdjustments = addOnNames.length > 0 || summary.discountApplied;

  return (
    <div className="w-full max-w-[88%] rounded-3xl border border-emerald-200 bg-[linear-gradient(145deg,#ecfdf5_0%,#ffffff_48%,#d1fae5_100%)] p-4 shadow-sm sm:max-w-[80%]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.28-2.03a.75.75 0 10-1.06-1.06l-4.22 4.22-1.72-1.72a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.75-4.75z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-700">Booking Confirmed!</p>
          <div className="mt-3 rounded-2xl bg-white/80 p-4 text-sm leading-6 text-slate-700 ring-1 ring-emerald-100">
            <p><span className="font-semibold text-slate-900">Order ID:</span> {summary.orderId}</p>
            {typeof summary.totalPrice === "number" ? (
              <p>
                <span className="font-semibold text-slate-900">Cost:</span>{" "}
                {summary.totalPrice.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </p>
            ) : null}
            <p><span className="font-semibold text-slate-900">From:</span> {summary.pickupZip} → <span className="font-semibold text-slate-900">To:</span> {summary.dropoffZip}</p>
            <p><span className="font-semibold text-slate-900">Date:</span> {summary.moveDate}</p>
            {summary.inventorySize.trim().toLowerCase() === "just a few items" && summary.itemSummary ? (
              <p><span className="font-semibold text-slate-900">Items:</span> {summary.itemSummary}</p>
            ) : (
              <p><span className="font-semibold text-slate-900">Home size:</span> {summary.inventorySize}</p>
            )}
            <p><span className="font-semibold text-slate-900">Name:</span> {summary.customerName}</p>
            <p>
              <span className="font-semibold text-slate-900">Reminder call:</span>{" "}
              {summary.reminderCall ? "Yes" : "No"}
            </p>
            {hasAdjustments ? (
              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-800">
                <p>
                  <span className="font-semibold">Extras:</span>{" "}
                  {addOnNames.length > 0 ? addOnNames.join(", ") : "No add-ons"}
                </p>
                <p>
                  <span className="font-semibold">Discount:</span>{" "}
                  {summary.discountApplied
                    ? `${(summary.discountAmount ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" })} applied`
                    : "Not applied"}
                </p>
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-emerald-700">We&apos;ll call you within 2 hours to confirm your crew.</p>
        </div>
      </div>
    </div>
  );
}

export default function ChatUI({
  showHeader = true,
  heightClassName,
}: {
  showHeader?: boolean;
  heightClassName?: string;
}) {
  const [isAfterHoursSession] = useState(() => isAfterHoursNow());
  const welcomeMessageRef = useRef<Message>(buildWelcomeMessage(isAfterHoursSession));
  const [messages, setMessages] = useState<Message[]>([welcomeMessageRef.current]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showDiscountChoices, setShowDiscountChoices] = useState(false);
  const [, setFaqQuickReplies] = useState<string[]>([]);
  const [bookingStep, setBookingStep] = useState<BookingStep>("idle");
  const [pendingBookingSummary, setPendingBookingSummary] = useState<NonNullable<Message["bookingSummary"]> | null>(null);
  const [priceQuote, setPriceQuote] = useState<PricingResult | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<ServiceAddOnId[]>([]);
  const [upsellSkipped, setUpsellSkipped] = useState(false);
  const [discountApplied, setDiscountApplied] = useState(false);
  const [, setMoveDate] = useState<string | null>(null);
  const [inventorySize, setInventorySize] = useState<string | null>(null);
  const latestSelectedAddOnsRef = useRef<ServiceAddOnId[]>([]);
  const latestUpsellSkippedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionLoadVersionRef = useRef(0);
  const pricingSummary = priceQuote
    ? buildQuoteAdjustmentSummary(priceQuote, selectedAddOns, discountApplied)
    : null;

  function appendAssistantMessage(content: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
      },
    ]);
  }

  function appendAssistantQuickReplyMessage(content: string, quickReplies: readonly string[]) {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        quickReplies: [...quickReplies],
      },
    ]);
  }

  function syncQuoteState(partialData?: SessionPartialData | null, quote?: PricingResult | null) {
    const nextSelectedAddOns = partialData?.selectedAddOns ?? [];
    const nextUpsellSkipped = Boolean(partialData?.upsellReviewed && nextSelectedAddOns.length === 0);
    latestSelectedAddOnsRef.current = nextSelectedAddOns;
    latestUpsellSkippedRef.current = nextUpsellSkipped;
    setSelectedAddOns(nextSelectedAddOns);
    setUpsellSkipped(nextUpsellSkipped);
    setDiscountApplied(Boolean(partialData?.discountApplied));

    if (partialData?.moveDate) {
      setMoveDate(partialData.moveDate);
    }

    if (partialData?.inventorySize) {
      setInventorySize(partialData.inventorySize);
    }

    if (quote) {
      setPriceQuote(quote);
      return;
    }

    if (partialData?.pickupZip && partialData?.dropoffZip && partialData.items?.length) {
      try {
        setPriceQuote(
          calculateMovePrice({
            pickup_zip: partialData.pickupZip,
            dropoff_zip: partialData.dropoffZip,
            items: partialData.items,
          })
        );
      } catch {
        setPriceQuote(null);
      }
      return;
    }

    setPriceQuote(null);
  }

  async function persistSessionFlags(progress: { afterHoursSession?: boolean; reminderCall?: boolean }) {
    const sessionId = sessionIdRef.current ?? await getOrCreateSessionId();
    sessionIdRef.current = sessionId;

    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, bookingProgress: progress }),
    }).catch(() => undefined);
  }

  // On mount: load or create session, then restore history
  useEffect(() => {
    let cancelled = false;
    const loadVersion = sessionLoadVersionRef.current;

    async function init() {
      try {
        const sessionId = await getOrCreateSessionId();
        if (cancelled || loadVersion !== sessionLoadVersionRef.current) return;
        sessionIdRef.current = sessionId;
        await persistSessionFlags({ afterHoursSession: isAfterHoursSession });

        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
          // Session expired — clear and start fresh
          localStorage.removeItem(SESSION_KEY);
          const newSessionId = await getOrCreateSessionId();
          if (cancelled || loadVersion !== sessionLoadVersionRef.current) return;
          sessionIdRef.current = newSessionId;
          await persistSessionFlags({ afterHoursSession: isAfterHoursSession });
          return;
        }

        const data = (await response.json()) as {
          messages: { role: "user" | "assistant"; content: string }[];
          partialData?: SessionPartialData;
          status?: string;
          orderId?: string | null;
        };

        const restoredBaseMessages =
          data.status === "booked"
            ? data.messages.filter(
                (m) => !(m.role === "assistant" && /^Booking confirmed!\s+OID-\d+/i.test(m.content))
              )
            : data.messages;

        const restoredMessages = restoredBaseMessages.map((m) => ({
          id: crypto.randomUUID(),
          role: m.role,
          content: m.content,
        }));

        if (data.messages.length > 0) {
          if (!cancelled && loadVersion === sessionLoadVersionRef.current) {
            setMessages([welcomeMessageRef.current, ...restoredMessages]);
          }
        }

        syncQuoteState(data.partialData);
          setFaqQuickReplies([]);

        const hasRouteContext = Boolean(
          data.partialData?.pickupZip &&
          data.partialData?.dropoffZip
        );

        const hasQuoteContext = Boolean(
          data.partialData?.pickupZip &&
          data.partialData?.dropoffZip &&
          data.partialData?.items?.length
        );

        const bookedSummary =
          data.status === "booked" &&
          data.orderId &&
          data.partialData?.pickupZip &&
          data.partialData?.dropoffZip &&
          data.partialData?.moveDate &&
          data.partialData?.inventorySize &&
          data.partialData?.customerName
            ? {
                orderId: data.orderId,
                pickupZip: data.partialData.pickupZip,
                dropoffZip: data.partialData.dropoffZip,
                moveDate: data.partialData.moveDate,
                inventorySize: data.partialData.inventorySize,
                itemSummary: formatItemSummary(data.partialData.items),
                customerName: data.partialData.customerName,
                reminderCall: data.partialData.reminderCall,
                selectedAddOns: data.partialData.selectedAddOns,
                discountApplied: data.partialData.discountApplied,
                discountAmount: undefined,
              }
            : null;

        if (
          bookedSummary &&
          data.orderId &&
          !cancelled &&
          loadVersion === sessionLoadVersionRef.current
        ) {
          setMessages((prev) => [
            ...prev,
            {
              id: `booking-summary-${data.orderId}`,
              role: "assistant",
              content: "Booking confirmed!",
              bookingSummary: bookedSummary,
            },
          ]);
        }

        if (
          data.status !== "booked" &&
          hasRouteContext &&
          !data.partialData?.items?.length &&
          !cancelled &&
          loadVersion === sessionLoadVersionRef.current
        ) {
          const lastContent = restoredMessages.at(-1)?.content;

          if (!data.partialData?.inventorySize) {
            setBookingStep("prequote-inventory");
            if (lastContent !== INVENTORY_PROMPT) {
              appendAssistantQuickReplyMessage(INVENTORY_PROMPT, INVENTORY_OPTIONS);
            }
          } else {
            setBookingStep("item-entry");
            if (lastContent !== ITEM_DETAILS_PROMPT) {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: ITEM_DETAILS_PROMPT,
                },
              ]);
            }
          }

          return;
        }

        // Restore contact form if quote was given but session is not yet booked
        if (
          data.status !== "booked" &&
          hasQuoteContext &&
          !data.partialData?.leadCaptured &&
          !cancelled &&
          loadVersion === sessionLoadVersionRef.current
        ) {
          const lastContent = restoredMessages.at(-1)?.content;

          if (!data.partialData?.upsellReviewed) {
            setBookingStep("upsell");
            if (lastContent !== UPSELL_PROMPT) {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: UPSELL_PROMPT,
                },
              ]);
            }
          } else if (!data.partialData?.moveDate) {
            setBookingStep("move-date");
            if (lastContent !== MOVE_DATE_PROMPT) {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: MOVE_DATE_PROMPT,
                },
              ]);
            }
          } else if (!data.partialData?.inventorySize) {
            setBookingStep("inventory");
            if (lastContent !== INVENTORY_PROMPT) {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: INVENTORY_PROMPT,
                },
              ]);
            }
          } else {
            setBookingStep("contact");
            setShowContactForm(true);
            if (lastContent !== CONTACT_PROMPT) {
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: CONTACT_PROMPT,
                },
              ]);
            }
          }
        }
      } catch {
        // Non-critical: fall back to a fresh in-memory session
      }
    }

    void init();
    return () => { cancelled = true; };
  }, [isAfterHoursSession]);

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isBotTyping, messages]);

  async function waitForTypingBeat(startedAt: number, minimumDelay: number) {
    const remaining = minimumDelay - (Date.now() - startedAt);
    if (remaining > 0) {
      await delay(remaining);
    }
  }

  async function showAssistantReply(content: string, startedAt: number, minimumDelay: number) {
    await waitForTypingBeat(startedAt, minimumDelay);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
      },
    ]);
  }

  async function showAssistantQuickReplyMessage(
    content: string,
    quickReplies: readonly string[],
    startedAt: number,
    minimumDelay: number
  ) {
    await waitForTypingBeat(startedAt, minimumDelay);
    appendAssistantQuickReplyMessage(content, quickReplies);
  }

  async function showAssistantSummary(
    summary: NonNullable<Message["bookingSummary"]>,
    startedAt: number,
    minimumDelay: number
  ) {
    await waitForTypingBeat(startedAt, minimumDelay);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Booking confirmed!",
        bookingSummary: summary,
      },
    ]);
  }

  async function persistBookingProgress(progress: {
    moveDate?: string;
    inventorySize?: string;
    selectedAddOns?: ServiceAddOnId[];
    upsellReviewed?: boolean;
    discountApplied?: boolean;
    reminderCall?: boolean;
    afterHoursSession?: boolean;
  }) {
    const sessionId = sessionIdRef.current ?? await getOrCreateSessionId();
    sessionIdRef.current = sessionId;

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, bookingProgress: progress }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not save your booking progress.");
    }

    const data = (await response.json()) as { sessionId?: string | null };
    if (data.sessionId) {
      sessionIdRef.current = data.sessionId;
      localStorage.setItem(SESSION_KEY, data.sessionId);
    }
  }

  async function handleUpsellContinue() {
    if (isLoading) return;

    const effectiveSelectedAddOns = latestSelectedAddOnsRef.current;
    const effectiveUpsellSkipped = latestUpsellSkippedRef.current;

    const selectedLabels = SERVICE_ADDONS.filter((addOn) => effectiveSelectedAddOns.includes(addOn.id)).map(
      (addOn) => addOn.shortLabel
    );
    const userSelection = effectiveUpsellSkipped || selectedLabels.length === 0
      ? "No thanks, just the move"
      : selectedLabels.join(", ");

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: userSelection };
    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setIsLoading(true);
    setIsBotTyping(true);

    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    if (!priceQuote) {
      // PRE-QUOTE PATH: persist add-ons then call API to calculate price
      try {
        await persistBookingProgress({ selectedAddOns: effectiveSelectedAddOns, upsellReviewed: true });

        const sessionId = sessionIdRef.current ?? await getOrCreateSessionId();
        sessionIdRef.current = sessionId;

        const chatHistory = allMessages
          .filter((m) => m.id !== "welcome")
          .map(({ role, content }) => ({ role, content }));

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: chatHistory, sessionId }),
        });

        if (!response.ok) throw new Error("The assistant is unavailable right now.");

        const data = (await response.json()) as {
          assistantMessage: string;
          sessionId?: string | null;
          structuredData?: ChatStructuredData;
        };

        if (data.sessionId) {
          sessionIdRef.current = data.sessionId;
          localStorage.setItem(SESSION_KEY, data.sessionId);
        }

        syncQuoteState(data.structuredData?.details, data.structuredData?.priceQuote);
        setShowContactForm(false);
        setShowLeadForm(false);
        setShowDiscountChoices(false);

        await showAssistantReply(data.assistantMessage, typingStartedAt, minimumTypingDelay);

        if (data.structuredData?.priceQuote) {
          setBookingStep("move-date");
          appendAssistantQuickReplyMessage(MOVE_DATE_PROMPT, MOVE_DATE_OPTIONS);
        }
      } catch (error) {
        await showAssistantReply(
          error instanceof Error ? error.message : "Something went wrong. Please try again.",
          typingStartedAt,
          minimumTypingDelay
        );
        setBookingStep("upsell");
      } finally {
        setIsBotTyping(false);
        setIsLoading(false);
      }
      return;
    }

    // POST-QUOTE PATH: add-ons selected after quote was already shown
    setBookingStep("move-date");
    try {
      await persistBookingProgress({
        selectedAddOns: effectiveSelectedAddOns,
        upsellReviewed: true,
      });

      const nextSummary = buildQuoteAdjustmentSummary(priceQuote, effectiveSelectedAddOns, discountApplied);
      const responseText = effectiveUpsellSkipped || selectedLabels.length === 0
        ? `No problem — keeping the move at ${nextSummary.finalTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}.\n\n${MOVE_DATE_PROMPT}`
        : `Added ${selectedLabels.join(", ")}. Your updated total is ${nextSummary.finalTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}.\n\n${MOVE_DATE_PROMPT}`;

      await showAssistantReply(responseText, typingStartedAt, minimumTypingDelay);
    } catch (error) {
      await showAssistantReply(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
      setBookingStep("upsell");
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  async function handleDiscountDecision(applyDiscount: boolean) {
    if (isLoading || !priceQuote) return;

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: applyDiscount ? "Yes, apply discount" : "No thanks",
      },
    ]);
    setDiscountApplied(applyDiscount);
    setShowDiscountChoices(false);
    setIsLoading(true);
    setIsBotTyping(true);

    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    try {
      await persistBookingProgress({ discountApplied: applyDiscount });
      const nextSummary = buildQuoteAdjustmentSummary(priceQuote, selectedAddOns, applyDiscount);
      const nextPrompt = bookingStep === "idle" ? UPSELL_PROMPT : null;

      await showAssistantReply(
        applyDiscount
          ? `Discount applied. Your updated total is ${nextSummary.finalTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`
          : `No problem — your standard quote stays at ${nextSummary.finalTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
        typingStartedAt,
        minimumTypingDelay
      );

      if (bookingStep === "idle") {
        setBookingStep("upsell");
      }

      if (nextPrompt) {
        appendAssistantMessage(nextPrompt);
      }
    } catch (error) {
      setDiscountApplied(!applyDiscount ? discountApplied : false);
      await showAssistantReply(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
      setShowDiscountChoices(true);
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  async function handleMoveDateSelection(value: string) {
    if (isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: value,
    };

    setMessages((prev) => [...prev, userMessage]);
    setMoveDate(value);
    // Skip inventory step if we already know home size (pre-quote path picked it)
    const nextStep = inventorySize ? "contact" : "inventory";
    setBookingStep(nextStep);
    setIsLoading(true);
    setIsBotTyping(true);

    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    try {
      await persistBookingProgress({ moveDate: value });
      if (inventorySize) {
        setShowContactForm(true);
        await showAssistantReply(CONTACT_PROMPT, typingStartedAt, minimumTypingDelay);
      } else {
        await showAssistantReply(INVENTORY_PROMPT, typingStartedAt, minimumTypingDelay);
      }
    } catch (error) {
      await showAssistantReply(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
      setBookingStep("move-date");
      setMoveDate(null);
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  async function handleInventorySelection(value: string) {
    if (isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: value,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInventorySize(value);
    setBookingStep("contact");
    setIsLoading(true);
    setIsBotTyping(true);

    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    try {
      await persistBookingProgress({ inventorySize: value });
      setShowContactForm(true);
      await showAssistantReply(CONTACT_PROMPT, typingStartedAt, minimumTypingDelay);
    } catch (error) {
      await showAssistantReply(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
      setBookingStep("inventory");
      setInventorySize(null);
      setShowContactForm(false);
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  async function handlePreQuoteInventorySelection(value: string) {
    if (isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: value,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInventorySize(value);
    setBookingStep("item-entry");
    setIsLoading(true);
    setIsBotTyping(true);

    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    try {
      await persistBookingProgress({ inventorySize: value });
      await showAssistantReply(ITEM_DETAILS_PROMPT, typingStartedAt, minimumTypingDelay);
    } catch (error) {
      await showAssistantReply(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
      setBookingStep("prequote-inventory");
      setInventorySize(null);
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  async function handleItemEntrySubmit(value: string) {
    if (isLoading) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: value },
    ]);
    setBookingStep("upsell");
    setIsLoading(true);
    setIsBotTyping(true);

    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    try {
      await showAssistantReply(UPSELL_PROMPT, typingStartedAt, minimumTypingDelay);
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  async function handleLeadSubmit(formData: LeadFormData) {
    if (isLoading) return;
    setIsLoading(true);
    setIsBotTyping(true);
    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    try {
      const sessionId = sessionIdRef.current ?? (await getOrCreateSessionId());
      sessionIdRef.current = sessionId;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadForm: formData, sessionId }),
      });

      const responseData = (await response.json()) as {
        assistantMessage?: string;
        error?: string;
        sessionId?: string | null;
        structuredData?: ChatStructuredData;
      };

      if (!response.ok) {
        throw new Error(responseData.error ?? "Could not save your follow-up details.");
      }

      if (responseData.sessionId) {
        sessionIdRef.current = responseData.sessionId;
        localStorage.setItem(SESSION_KEY, responseData.sessionId);
      }

      syncQuoteState(responseData.structuredData?.details, responseData.structuredData?.priceQuote);
      setShowLeadForm(false);
      setBookingStep("idle");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Submitted follow-up details",
          leadSnapshot: formData,
        },
      ]);

      await showAssistantReply(
        responseData.assistantMessage ?? "We saved your details for follow-up.",
        typingStartedAt,
        minimumTypingDelay
      );
    } catch (error) {
      await showAssistantReply(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  async function handleReset() {
    if (isLoading || isResetting) {
      return;
    }

    setIsResetting(true);
    sessionLoadVersionRef.current += 1;
    sessionIdRef.current = null;
    localStorage.removeItem(SESSION_KEY);
    setMessages([welcomeMessageRef.current]);
    setInput("");
    setShowContactForm(false);
    setShowLeadForm(false);
    setShowDiscountChoices(false);
    setFaqQuickReplies([]);
    setPendingBookingSummary(null);
    setBookingStep("idle");
    setPriceQuote(null);
    latestSelectedAddOnsRef.current = [];
    latestUpsellSkippedRef.current = false;
    setSelectedAddOns([]);
    setUpsellSkipped(false);
    setDiscountApplied(false);
    setMoveDate(null);
    setInventorySize(null);

    try {
      const sessionId = await getOrCreateSessionId();
      sessionIdRef.current = sessionId;
      await persistSessionFlags({ afterHoursSession: isAfterHoursSession });
    } catch {
      // Leave the UI reset even if the new session cannot be created immediately.
    } finally {
      setIsResetting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const isFaqInput = isGlobalFaqInput(trimmedInput);
    const shouldInterruptFlow = isFaqInput || isConversationalInterrupt(trimmedInput);

    if (bookingStep === "move-date" && !shouldInterruptFlow) {
      setInput("");
      await handleMoveDateSelection(trimmedInput);
      return;
    }

    if (bookingStep === "inventory" && !shouldInterruptFlow) {
      setInput("");
      await handleInventorySelection(trimmedInput);
      return;
    }

    if (bookingStep === "prequote-inventory" && !shouldInterruptFlow) {
      setInput("");
      await handlePreQuoteInventorySelection(trimmedInput);
      return;
    }

    if (bookingStep === "item-entry" && !shouldInterruptFlow) {
      setInput("");
      await handleItemEntrySubmit(trimmedInput);
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput,
    };

    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);
    setIsBotTyping(true);
    setFaqQuickReplies([]);

    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    try {
      const sessionId = sessionIdRef.current ?? await getOrCreateSessionId();
      sessionIdRef.current = sessionId;
      const hadQuote = Boolean(priceQuote);

      const chatHistory = allMessages
        .filter((m) => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("The assistant is unavailable right now.");
      }

      const data = (await response.json()) as {
        assistantMessage: string;
        sessionId?: string | null;
        structuredData?: ChatStructuredData;
      };

      if (data.sessionId) {
        sessionIdRef.current = data.sessionId;
        localStorage.setItem(SESSION_KEY, data.sessionId);
      }

      syncQuoteState(data.structuredData?.details, data.structuredData?.priceQuote);

      if (data.structuredData?.prompt?.type === "lead-capture") {
        setShowContactForm(false);
        setShowLeadForm(true);
        setShowDiscountChoices(false);
        setBookingStep("lead-contact");
        await showAssistantReply(`${data.assistantMessage}\n\n${LEAD_PROMPT}`, typingStartedAt, minimumTypingDelay);
        return;
      }

      if (data.structuredData?.prompt?.type === "discount-offer") {
        setShowDiscountChoices(true);
        setShowLeadForm(false);
        setShowContactForm(false);
        setFaqQuickReplies([]);
        await showAssistantReply(data.assistantMessage, typingStartedAt, minimumTypingDelay);
        return;
      }

      if (data.structuredData?.prompt?.type === "quick-replies") {
        await showAssistantQuickReplyMessage(
          data.assistantMessage,
          data.structuredData.prompt.options,
          typingStartedAt,
          minimumTypingDelay
        );
        return;
      }

      if (
        !hadQuote &&
        !data.structuredData?.priceQuote &&
        data.structuredData?.details?.pickupZip &&
        data.structuredData?.details?.dropoffZip &&
        !data.structuredData?.details?.items?.length
      ) {
        setShowContactForm(false);
        setShowLeadForm(false);
        setShowDiscountChoices(false);
        setFaqQuickReplies([]);

        if (data.structuredData.details.inventorySize) {
          setBookingStep("item-entry");
          await showAssistantReply(ITEM_DETAILS_PROMPT, typingStartedAt, minimumTypingDelay);
        } else {
          setBookingStep("prequote-inventory");
          await showAssistantQuickReplyMessage(
            INVENTORY_PROMPT,
            INVENTORY_OPTIONS,
            typingStartedAt,
            minimumTypingDelay
          );
        }

        return;
      }

      // Ask add-ons first, then reveal the adjusted quote and continue booking flow
      if (!hadQuote && data.structuredData?.priceQuote && !data.structuredData?.order) {
        setShowContactForm(false);
        setShowLeadForm(false);
        setShowDiscountChoices(false);

        if (!data.structuredData.details?.upsellReviewed) {
          setBookingStep("upsell");
          await showAssistantReply(
            "Got your move details. Before I finalize your quote, would you like to add any extra services?",
            typingStartedAt,
            minimumTypingDelay
          );
          appendAssistantMessage(UPSELL_PROMPT);
        } else if (data.structuredData.details?.moveDate) {
          await showAssistantReply(data.assistantMessage, typingStartedAt, minimumTypingDelay);
          if (data.structuredData.details.inventorySize) {
            setBookingStep("contact");
            setShowContactForm(true);
            appendAssistantMessage(CONTACT_PROMPT);
          } else {
            setBookingStep("inventory");
            appendAssistantQuickReplyMessage(INVENTORY_PROMPT, INVENTORY_OPTIONS);
          }
        } else {
          await showAssistantReply(data.assistantMessage, typingStartedAt, minimumTypingDelay);
          setBookingStep("move-date");
          appendAssistantQuickReplyMessage(MOVE_DATE_PROMPT, MOVE_DATE_OPTIONS);
        }

        return;
      }

      await showAssistantReply(data.assistantMessage, typingStartedAt, minimumTypingDelay);
    } catch (error) {
      await showAssistantReply(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  const defaultHeightClassName = showHeader
    ? "h-[min(480px,calc(100vh-8rem))]"
    : "h-[min(440px,calc(100vh-9rem))] sm:h-[min(440px,calc(100vh-9rem))]";

  async function handleContactSubmit(formData: ContactFormData) {
    if (isLoading) return;
    setIsLoading(true);
    setIsBotTyping(true);
    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();
    try {
      const sessionId = sessionIdRef.current ?? (await getOrCreateSessionId());
      sessionIdRef.current = sessionId;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactForm: formData, sessionId }),
      });

      const responseData = (await response.json()) as {
        assistantMessage?: string;
        error?: string;
        sessionId?: string | null;
        structuredData?: ChatStructuredData;
      };

      if (!response.ok) {
        throw new Error(responseData.error ?? "Could not complete the booking.");
      }

      if (responseData.sessionId) {
        sessionIdRef.current = responseData.sessionId;
        localStorage.setItem(SESSION_KEY, responseData.sessionId);
      }

      syncQuoteState(responseData.structuredData?.order ? {
        pickupZip: responseData.structuredData.order.pickupZip,
        dropoffZip: responseData.structuredData.order.dropoffZip,
        moveDate: responseData.structuredData.order.moveDate,
        inventorySize: responseData.structuredData.order.inventorySize,
        customerName: responseData.structuredData.order.customerName,
        selectedAddOns,
        discountApplied,
      } : undefined, priceQuote);

      setShowContactForm(false);
      setShowLeadForm(false);
      setShowDiscountChoices(false);
      setFaqQuickReplies([]);
      if (
        responseData.structuredData?.order?.id &&
        responseData.structuredData.order.recordId &&
        responseData.structuredData.order.pickupZip &&
        responseData.structuredData.order.dropoffZip &&
        responseData.structuredData.order.moveDate &&
        responseData.structuredData.order.inventorySize &&
        responseData.structuredData.order.customerName
      ) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "user",
            content: "Submitted booking details",
            contactSnapshot: formData,
          },
        ]);
        setPendingBookingSummary({
          orderRecordId: responseData.structuredData.order.recordId,
          orderId: responseData.structuredData.order.id,
          totalPrice: responseData.structuredData.order.totalPrice,
          pickupZip: responseData.structuredData.order.pickupZip,
          dropoffZip: responseData.structuredData.order.dropoffZip,
          moveDate: responseData.structuredData.order.moveDate,
          inventorySize: responseData.structuredData.order.inventorySize,
          itemSummary: formatItemSummary(responseData.structuredData.order.items),
          customerName: responseData.structuredData.order.customerName,
          selectedAddOns: responseData.structuredData.order.selectedAddOns,
          discountApplied: responseData.structuredData.order.discountApplied,
          discountAmount: responseData.structuredData.order.discountAmount,
          reminderCall: responseData.structuredData.order.reminderCall,
        });
        setBookingStep("reminder");
        await showAssistantQuickReplyMessage(
          REMINDER_PROMPT,
          REMINDER_OPTIONS,
          typingStartedAt,
          minimumTypingDelay
        );
      } else {
        setBookingStep("idle");
        await showAssistantReply(
          responseData.assistantMessage ?? "Booking confirmed!",
          typingStartedAt,
          minimumTypingDelay
        );
      }
    } catch (error) {
      await showAssistantReply(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  async function handleFaqQuickReply(option: string) {
    if (isLoading) {
      return;
    }

    if (option === FAQ_CONTINUE_LABEL || option === FAQ_ASK_LABEL) {
      setFaqQuickReplies([]);
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: option,
    };

    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setFaqQuickReplies([]);
    setIsLoading(true);
    setIsBotTyping(true);

    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    try {
      const sessionId = sessionIdRef.current ?? await getOrCreateSessionId();
      sessionIdRef.current = sessionId;

      const chatHistory = allMessages
        .filter((message) => message.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatHistory,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error("The assistant is unavailable right now.");
      }

      const data = (await response.json()) as {
        assistantMessage: string;
        sessionId?: string | null;
        structuredData?: ChatStructuredData;
      };

      if (data.sessionId) {
        sessionIdRef.current = data.sessionId;
        localStorage.setItem(SESSION_KEY, data.sessionId);
      }

      syncQuoteState(data.structuredData?.details, data.structuredData?.priceQuote);

      if (data.structuredData?.prompt?.type === "quick-replies") {
        await showAssistantQuickReplyMessage(
          data.assistantMessage,
          data.structuredData.prompt.options,
          typingStartedAt,
          minimumTypingDelay
        );
        return;
      }

      await showAssistantReply(data.assistantMessage, typingStartedAt, minimumTypingDelay);
    } catch (error) {
      await showAssistantReply(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  async function handleReminderDecision(option: (typeof REMINDER_OPTIONS)[number]) {
    if (isLoading || !pendingBookingSummary) {
      return;
    }

    const wantsReminder = option === "Yes please";

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: option,
      },
    ]);

    setIsLoading(true);
    setIsBotTyping(true);

    const typingStartedAt = Date.now();
    const minimumTypingDelay = getTypingDelay();

    try {
      const recordId = pendingBookingSummary.orderRecordId;
      if (recordId) {
        const response = await fetch(`/api/orders/${recordId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reminderCall: wantsReminder }),
        });

        if (!response.ok) {
          throw new Error("Could not save reminder preference.");
        }
      }

      await persistBookingProgress({ reminderCall: wantsReminder });

      const summaryWithReminder = {
        ...pendingBookingSummary,
        reminderCall: wantsReminder,
      };

      setPendingBookingSummary(null);
      setBookingStep("idle");
      await showAssistantSummary(summaryWithReminder, typingStartedAt, minimumTypingDelay);
    } catch (error) {
      await showAssistantReply(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
        typingStartedAt,
        minimumTypingDelay
      );
    } finally {
      setIsBotTyping(false);
      setIsLoading(false);
    }
  }

  function handleInlineQuickReplySelect(value: string) {
    if ((MOVE_DATE_OPTIONS as readonly string[]).includes(value)) {
      if (bookingStep === "move-date") {
        void handleMoveDateSelection(value);
      }
      return;
    }

    if ((INVENTORY_OPTIONS as readonly string[]).includes(value)) {
      if (bookingStep === "prequote-inventory") {
        void handlePreQuoteInventorySelection(value);
      } else if (bookingStep === "inventory") {
        void handleInventorySelection(value);
      }
      return;
    }

    if ((REMINDER_OPTIONS as readonly string[]).includes(value)) {
      if (bookingStep === "reminder") {
        void handleReminderDecision(value as (typeof REMINDER_OPTIONS)[number]);
      }
      return;
    }

    void handleFaqQuickReply(value);
  }

  return (
    <div className={showHeader ? "rounded-3xl border border-slate-200 bg-white shadow-sm" : ""}>
      {showHeader && (
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Chat</h2>
              <p className="mt-1 text-sm text-slate-500">
                Get an instant moving quote and book your move.
              </p>
            </div>

            <button
              type="button"
              onClick={handleReset}
              disabled={isLoading || isResetting}
              className="inline-flex shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isResetting ? "Resetting" : "Start over"}
            </button>
          </div>
        </div>
      )}

      <div className={`flex flex-col ${heightClassName ?? defaultHeightClassName}`}>
        {!showHeader ? (
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading || isResetting}
                className="inline-flex rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isResetting ? "Resetting" : "Start over"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.map((message) => {
            const isUser = message.role === "user";

            if (message.bookingSummary) {
              return (
                <div key={message.id} className="flex justify-start">
                  <BookingSummaryCard summary={message.bookingSummary} />
                </div>
              );
            }

            if (message.contactSnapshot) {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="w-full max-w-[88%] rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700 shadow-sm sm:max-w-[80%]">
                    <p className="font-semibold text-slate-900">Booking details submitted</p>
                    <p className="mt-2"><span className="font-semibold text-slate-900">Name:</span> {message.contactSnapshot.name}</p>
                    <p><span className="font-semibold text-slate-900">Phone:</span> {message.contactSnapshot.phone}</p>
                    {message.contactSnapshot.email ? (
                      <p><span className="font-semibold text-slate-900">Email:</span> {message.contactSnapshot.email}</p>
                    ) : null}
                  </div>
                </div>
              );
            }

            if (message.leadSnapshot) {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="w-full max-w-[88%] rounded-2xl border border-slate-300 bg-white p-4 text-sm text-slate-700 shadow-sm sm:max-w-[80%]">
                    <p className="font-semibold text-slate-900">Follow-up details submitted</p>
                    <p className="mt-2"><span className="font-semibold text-slate-900">Name:</span> {message.leadSnapshot.name}</p>
                    <p><span className="font-semibold text-slate-900">Phone:</span> {message.leadSnapshot.phone}</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[88%] sm:max-w-[80%]">
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                      isUser
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {message.content.split("\n").map((line, i, arr) => (
                      <span key={i}>
                        {line}
                        {i < arr.length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                  {!isUser && message.quickReplies?.length ? (
                    <div className="mt-2">
                      <BookingQuickReplies
                        options={message.quickReplies}
                        onSelect={handleInlineQuickReplySelect}
                        disabled={isLoading}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {isBotTyping && (
            <div className="flex justify-start">
              <div className="flex max-w-[88%] items-end gap-3 sm:max-w-[80%]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[#1E3A8A]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25z" />
                    <path d="M13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875H3a3 3 0 106 0h3.75a.75.75 0 00.75-.75V15z" />
                    <path d="M8.25 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zM15.75 6.75a.75.75 0 00-.75.75v11.25c0 .087.015.17.042.248a3 3 0 015.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 00-3.732-10.104 1.837 1.837 0 00-1.47-.725H15.75z" />
                    <path d="M19.5 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                  </svg>
                </div>
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-slate-500">
                  <div className="flex items-center gap-1.5" aria-label="Assistant is typing">
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-chat-typing-dot" />
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-chat-typing-dot [animation-delay:0.18s]" />
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-chat-typing-dot [animation-delay:0.36s]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {showContactForm && (
            <div className="flex justify-start">
              <div className="w-full max-w-[88%] sm:max-w-[80%]">
                <ContactInlineForm onSubmit={handleContactSubmit} isLoading={isLoading} />
              </div>
            </div>
          )}

          {showLeadForm && (
            <div className="flex justify-start">
              <div className="w-full max-w-[88%] sm:max-w-[80%]">
                <LeadInlineForm onSubmit={handleLeadSubmit} isLoading={isLoading} />
              </div>
            </div>
          )}

          {showDiscountChoices && pricingSummary ? (
            <div className="flex justify-start">
              <div className="w-full max-w-[88%] space-y-3 rounded-3xl border border-emerald-200 bg-[linear-gradient(145deg,#ecfdf5_0%,#ffffff_45%,#d1fae5_100%)] p-4 shadow-sm sm:max-w-[80%]">
                <p className="text-sm text-slate-700">
                  Updated quote: <span className="font-semibold text-slate-900">{pricingSummary.finalTotal.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => void handleDiscountDecision(true)}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Yes, apply discount
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => void handleDiscountDecision(false)}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
                  >
                    No thanks
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {bookingStep === "upsell" && !showContactForm && !showLeadForm ? (
            <div className="flex justify-start">
              <div className="w-full max-w-[88%] sm:max-w-[80%]">
                <UpsellSelector
                  selectedAddOns={selectedAddOns}
                  skipped={upsellSkipped}
                  disabled={isLoading}
                  onToggle={(value) => {
                    latestUpsellSkippedRef.current = false;
                    setUpsellSkipped(false);
                    setSelectedAddOns((prev) => {
                      const next = prev.includes(value)
                        ? prev.filter((item) => item !== value)
                        : [...prev, value];
                      latestSelectedAddOnsRef.current = next;
                      return next;
                    });
                  }}
                  onSkip={() => {
                    latestSelectedAddOnsRef.current = [];
                    latestUpsellSkippedRef.current = true;
                    setSelectedAddOns([]);
                    setUpsellSkipped(true);
                  }}
                  onContinue={() => void handleUpsellContinue()}
                />
              </div>
            </div>
          ) : null}

          {bookingStep === "move-date" && !showContactForm ? (
            <div className="flex justify-start">
              <div className="w-full max-w-[88%] space-y-3 sm:max-w-[80%]">
                <MoveDatePicker disabled={isLoading} onSubmit={handleMoveDateSelection} />
              </div>
            </div>
          ) : null}

          {bookingStep === "inventory" && !showContactForm && !showLeadForm ? (
            <div className="flex justify-start">
              <div className="w-full max-w-[88%] sm:max-w-[80%]">
                <BookingQuickReplies
                  options={INVENTORY_OPTIONS}
                  onSelect={handleInventorySelection}
                  disabled={isLoading}
                />
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4 transition-opacity">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!isLoading && input.trim()) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }
              }}
              placeholder={showContactForm ? "Ask a question or fill the booking form above…" : showLeadForm ? "Ask a question or fill the follow-up form above…" : bookingStep === "upsell" ? "Choose any add-on services above or ask a question…" : bookingStep === "move-date" ? "Choose a quick reply, type a date, or ask a question…" : bookingStep === "inventory" || bookingStep === "prequote-inventory" ? "Choose a quick reply, describe the move size, or ask a question…" : bookingStep === "item-entry" ? "List your items, e.g. 1 sofa, 2 beds, 10 boxes…" : bookingStep === "reminder" ? "Choose a reminder option above or ask a question…" : "Type a message…"}
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 disabled:opacity-50 [field-sizing:content] max-h-36 overflow-y-auto"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 sm:min-w-[112px]"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}