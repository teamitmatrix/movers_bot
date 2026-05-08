import OpenAI from "openai";
import { NextResponse } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/apiError";
import {
  buildQuoteAdjustmentSummary,
  isServiceAddOnId,
  SERVICE_ADDONS,
  type QuoteAdjustmentSummary,
  type ServiceAddOnId,
} from "@/lib/bookingPricing";
import { makeLogger } from "@/lib/logger";
import { connectToDatabase } from "@/lib/mongodb";
import {
  calculateMovePrice,
  type PricingItem,
  type PricingResult,
} from "@/lib/pricing";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import type { PartialBookingData } from "@/models/Conversation";
import Order, { assignOrderNumber, formatOrderId } from "@/models/Order";
import Conversation from "@/models/Conversation";

type IncomingMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type BookingDetails = {
  pickupZip?: string;
  dropoffZip?: string;
  items: PricingItem[];
  selectedAddOns?: ServiceAddOnId[];
  upsellReviewed?: boolean;
  discountApplied?: boolean;
  reminderCall?: boolean;
  afterHoursSession?: boolean;
  moveDate?: string;
  inventorySize?: string;
  leadCaptured?: boolean;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
};

type StructuredResponse = {
  details: BookingDetails | null;
  priceQuote: PricingResult | null;
  pricingSummary?: QuoteAdjustmentSummary | null;
  prompt?:
    | { type: "discount-offer"; discountedTotal: number }
    | { type: "lead-capture" }
    | { type: "quick-replies"; options: string[] }
    | null;
  order: {
    recordId?: string;
    id: string;
    status: string;
    totalPrice: number;
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

const PRIMARY_MODEL = process.env.OPENAI_MODEL_PRIMARY ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const FALLBACK_MODEL = process.env.OPENAI_MODEL_FALLBACK ?? "gpt-4o-nano";
const MODEL_CANDIDATES = [PRIMARY_MODEL, FALLBACK_MODEL].filter(
  (model, index, models): model is string => Boolean(model) && models.indexOf(model) === index
);
const MAX_ASSISTANT_TOKENS = 220;
const DEMO_SESSION_MAX_USER_MESSAGES = 10;

const US_ZIP_RE = /^\d{5}$/;
const US_PHONE_RE = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_ITEM_QUANTITY = 50;
const CHAT_RATE_MAX = 10;
const CHAT_RATE_WINDOW_MS = 60_000;

const ROUTE = "POST /api/chat";
const logger = makeLogger(ROUTE);

// ─── System Prompts ───────────────────────────────────────────────────────────

function buildSystemPrompt(quoteAlreadyGiven: boolean): string {
  return `
You are Maya, a friendly and intelligent booking assistant for Vanturo Moving.
You behave exactly like a warm, professional human agent on a live chat — natural, helpful, and conversational.

COMPANY INFO:
- Name: Vanturo Moving | Phone: (555) 100-2000 | Email: hello@vanturo.com
- Licensed: FMCSA, USDOT #2089147 | Every move insured up to $50,000
- Services: Local moves, long-distance, packing, storage, furniture moving, commercial moves
- Hours: Mon–Sat 8am–8pm | AI chat available 24/7
- Cancellation: Free up to 48 hours before move date
- Payment: Credit card, cash, or Zelle — due on move day

PRICING REFERENCE (never calculate yourself — always use calculate_price tool):
- Local move (same state): from $299 | Long-distance: from $899
- Add-ons: Packing $150, Storage $99/mo, Disassembly $75, Specialty items from $100

CONVERSATION RULES — follow these exactly:
1. Respond to EVERY message naturally. Greetings get warm greetings back. Thanks get "You're welcome!" Never ignore what the user said.
2. Keep replies SHORT — 1 to 3 sentences max unless the user asks for detail.
3. Never sound like a bot or a form. Never say "As an AI" or "I am a chatbot".
4. If someone asks something unrelated to moving (e.g. weather, coding, general knowledge), politely say you can only help with moving-related questions.
5. Always end your message with a clear, natural next step or soft question — keep the conversation flowing.
6. Never repeat information you already gave unless explicitly asked.
7. Never ask for name, phone, or email — the booking form handles that.

${quoteAlreadyGiven ? `
CURRENT STATE: Quote already given.
- Do NOT call calculate_price again
- Do NOT re-show the full quote unless explicitly asked
- The booking form is visible — only mention it if the user asks how to confirm
- If user pushes back on price: offer 10% off "if they book today". If they still resist: go to 15% max. Never go higher.
- If user says "let me think" or similar: say you can save their details and follow up — offer lead capture naturally
` : `
CURRENT STATE: No quote yet.
- Your goal: collect pickup ZIP, then dropoff ZIP, one at a time naturally
- Once you have BOTH ZIPs AND the user has listed items → call calculate_price immediately
- The UI handles home size, move date, and add-on selection — do NOT ask for those
- Do NOT ask for name/phone/email — the form handles that
- If user provides both ZIPs and items in one message → call calculate_price right away, don't ask follow-up questions first
`}

NEGOTIATION:
- Only offer discounts when the user explicitly says the price is too high
- Start with 10% off, go to 15% max only if they keep pushing
- Highlight value: fully insured, licensed crew, no hidden fees

TOOL USAGE:
- calculate_price: call this as soon as you have pickup ZIP, dropoff ZIP, and items
- create_order: only call this when the user has explicitly confirmed they want to book AND all required fields are present

Remember: you are Maya — a real person who genuinely cares about helping customers move smoothly. Be warm, be human, be helpful.
`.trim();
}

function buildSupportSystemPrompt(partial: PartialBookingData, orderId: string): string {
  const itemSummary = partial.items?.map((i) => `${i.quantity}x ${i.type}`).join(", ") ?? "not specified";
  const addOnSummary =
    partial.selectedAddOns
      ?.map((id) => SERVICE_ADDONS.find((a) => a.id === id)?.shortLabel ?? id)
      .join(", ") || "none";

  return `
You are Maya, a friendly support agent for Vanturo Moving.
The customer has already placed an order. Help them naturally and conversationally.

ORDER ON FILE:
- Order ID: ${orderId}
- Route: ${partial.pickupZip ?? "?"} → ${partial.dropoffZip ?? "?"}
- Move date: ${partial.moveDate ?? "not set"}
- Home size: ${partial.inventorySize ?? "not specified"}
- Add-ons: ${addOnSummary}
- Items: ${itemSummary}

YOUR ROLE:
- Answer questions about this order naturally — like a human support agent, not a database
- If asked for order ID: give it clearly and warmly
- If asked for a summary: give a brief, friendly overview — not a data dump
- If asked to reschedule or cancel: reassure them a coordinator will confirm shortly
- Respond to "thanks", "ok", casual chat naturally — never push them back to the booking flow
- Keep replies to 1–3 sentences unless they need more detail
- Do NOT call any tools, create orders, or calculate prices
- Do NOT repeat all order details unprompted — only share what's relevant to their question
- Do NOT sound like you're reading from a spreadsheet
`.trim();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function isValidUsZip(zip: string): boolean {
  return US_ZIP_RE.test(zip.trim());
}

function isValidUsPhone(phone: string): boolean {
  return US_PHONE_RE.test(phone.replace(/\s/g, ""));
}

function getLastUserMessage(messages: IncomingMessage[]) {
  return [...messages].reverse().find((m) => m.role === "user") ?? null;
}

function getMissingQuoteFields(details: BookingDetails) {
  const missing: string[] = [];
  if (!details.pickupZip) missing.push("pickup_zip");
  if (!details.dropoffZip) missing.push("dropoff_zip");
  if (details.items.length === 0) missing.push("items");
  return missing;
}

function getMissingOrderFields(details: BookingDetails) {
  const missing = getMissingQuoteFields(details);
  if (!details.customerName) missing.push("customer_name");
  if (!details.moveDate) missing.push("move_date");
  if (!details.inventorySize) missing.push("inventory_size");
  if (!details.customerPhone) missing.push("customer_phone");
  return missing;
}

function getPricingSummary(priceQuote: PricingResult | null, details: BookingDetails | null) {
  if (!priceQuote) return null;
  return buildQuoteAdjustmentSummary(
    priceQuote,
    details?.selectedAddOns ?? [],
    details?.discountApplied ?? false
  );
}

function normalizeBookingDetails(args: Record<string, unknown>): BookingDetails {
  return {
    pickupZip: typeof args.pickup_zip === "string" ? args.pickup_zip : undefined,
    dropoffZip: typeof args.dropoff_zip === "string" ? args.dropoff_zip : undefined,
    items: Array.isArray(args.items)
      ? args.items
          .filter(
            (item): item is PricingItem =>
              Boolean(item) &&
              typeof item === "object" &&
              "type" in item &&
              "quantity" in item &&
              typeof item.type === "string" &&
              typeof item.quantity === "number"
          )
          .map((item) => ({ type: item.type as PricingItem["type"], quantity: item.quantity }))
      : [],
    selectedAddOns: Array.isArray(args.selected_add_ons)
      ? args.selected_add_ons.filter(isServiceAddOnId)
      : Array.isArray(args.selectedAddOns)
        ? args.selectedAddOns.filter(isServiceAddOnId)
        : [],
    upsellReviewed: typeof args.upsell_reviewed === "boolean" ? args.upsell_reviewed : undefined,
    discountApplied: typeof args.discount_applied === "boolean" ? args.discount_applied : undefined,
    reminderCall: typeof args.reminder_call === "boolean" ? args.reminder_call : undefined,
    afterHoursSession: typeof args.after_hours_session === "boolean" ? args.after_hours_session : undefined,
    customerName: typeof args.customer_name === "string" ? args.customer_name : undefined,
    customerPhone: typeof args.customer_phone === "string" ? args.customer_phone : undefined,
    customerEmail: typeof args.customer_email === "string" ? args.customer_email : undefined,
    moveDate: typeof args.move_date === "string" ? args.move_date : undefined,
    inventorySize: typeof args.inventory_size === "string" ? args.inventory_size : undefined,
    leadCaptured: typeof args.lead_captured === "boolean" ? args.lead_captured : undefined,
  };
}

function mergeBookingDetails(primary: BookingDetails | null, secondary: BookingDetails): BookingDetails {
  return {
    pickupZip: primary?.pickupZip ?? secondary.pickupZip,
    dropoffZip: primary?.dropoffZip ?? secondary.dropoffZip,
    items: primary && primary.items.length > 0 ? primary.items : secondary.items,
    selectedAddOns:
      primary?.selectedAddOns && primary.selectedAddOns.length > 0
        ? primary.selectedAddOns
        : secondary.selectedAddOns,
    upsellReviewed: primary?.upsellReviewed ?? secondary.upsellReviewed,
    discountApplied: primary?.discountApplied ?? secondary.discountApplied,
    reminderCall: primary?.reminderCall ?? secondary.reminderCall,
    afterHoursSession: primary?.afterHoursSession ?? secondary.afterHoursSession,
    moveDate: primary?.moveDate ?? secondary.moveDate,
    inventorySize: primary?.inventorySize ?? secondary.inventorySize,
    leadCaptured: primary?.leadCaptured ?? secondary.leadCaptured,
    customerName: primary?.customerName ?? secondary.customerName,
    customerPhone: primary?.customerPhone ?? secondary.customerPhone,
    customerEmail: primary?.customerEmail ?? secondary.customerEmail,
  };
}

function inferBookingDetailsFromMessages(messages: IncomingMessage[]): BookingDetails {
  const userMessages = messages.filter((m) => m.role === "user");
  if (!userMessages.length) return { items: [] };
  const fullHistory = userMessages.map((m) => m.content).join("\n");
  const zipMatches = fullHistory.match(/\b\d{5}\b/g) ?? [];
  const itemMatches = Array.from(
    fullHistory.matchAll(/\b(\d+)\s*(bed|sofa|wardrobe|appliance|boxes|piano)s?\b/gi)
  );
  return {
    pickupZip: zipMatches[0],
    dropoffZip: zipMatches[1],
    items: itemMatches.map((match) => ({
      type: match[2].toLowerCase() as PricingItem["type"],
      quantity: Number.parseInt(match[1], 10),
    })),
  };
}

function cloneStoredBookingDetails(details: PartialBookingData | null | undefined): BookingDetails | null {
  if (!details) return null;
  return {
    pickupZip: details.pickupZip,
    dropoffZip: details.dropoffZip,
    items: Array.isArray(details.items) ? [...details.items] : [],
    selectedAddOns: details.selectedAddOns ? [...details.selectedAddOns] : [],
    upsellReviewed: details.upsellReviewed,
    discountApplied: details.discountApplied,
    reminderCall: details.reminderCall,
    afterHoursSession: details.afterHoursSession,
    moveDate: details.moveDate,
    inventorySize: details.inventorySize,
    leadCaptured: details.leadCaptured,
    customerName: details.customerName,
    customerPhone: details.customerPhone,
    customerEmail: details.customerEmail,
  };
}

function parseToolArguments(input: string): Record<string, unknown> {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    throw new Error("Tool arguments must be valid JSON.");
  }
}

function isFunctionToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall
): toolCall is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall {
  return toolCall.type === "function";
}

function sessionExpiry() {
  const date = new Date();
  date.setHours(date.getHours() + 24);
  return date;
}

// ─── Detect prompt type from AI response ──────────────────────────────────────

function detectPromptFromResponse(
  text: string,
  details: BookingDetails | null
): StructuredResponse["prompt"] {
  const lower = text.toLowerCase();

  // Discount offer detection
  if (
    (lower.includes("10%") || lower.includes("15%")) &&
    (lower.includes("discount") || lower.includes("off")) &&
    details?.selectedAddOns !== undefined
  ) {
    return null; // Let the UI handle via pricingSummary
  }

  // Lead capture detection
  if (
    (lower.includes("name and number") || lower.includes("follow up") || lower.includes("follow-up")) &&
    lower.includes("no obligation")
  ) {
    return { type: "lead-capture" };
  }

  // Order action quick replies
  if (lower.includes("reschedule") || lower.includes("cancel") || lower.includes("check status")) {
    return {
      type: "quick-replies",
      options: ["Reschedule", "Cancel Booking", "Check Status"],
    };
  }

  // New booking quick replies
  if (lower.includes("book a new move") || lower.includes("check existing")) {
    return {
      type: "quick-replies",
      options: ["Book a new move", "Check existing booking"],
    };
  }

  return null;
}

// ─── OpenAI client ────────────────────────────────────────────────────────────

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY environment variable.");
  return new OpenAI({ apiKey });
}

async function createChatCompletion(
  client: OpenAI,
  input: Omit<Parameters<typeof client.chat.completions.create>[0], "model">
) {
  let lastError: unknown;
  for (const model of MODEL_CANDIDATES) {
    try {
      const completion = (await client.chat.completions.create({
        ...input,
        model,
        max_completion_tokens: MAX_ASSISTANT_TOKENS,
      })) as OpenAI.Chat.Completions.ChatCompletion;
      return { completion, model };
    } catch (error) {
      lastError = error;
      logger.warn("OpenAI model attempt failed", {
        model,
        error: error instanceof Error ? error.message : "Unknown OpenAI error",
      });
    }
  }
  throw lastError ?? new Error("OpenAI request failed for all configured models.");
}

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "calculate_price",
      description: "Calculate a moving quote using ZIP codes and item types. Call this as soon as you have pickup ZIP, dropoff ZIP, and items.",
      parameters: {
        type: "object",
        properties: {
          pickup_zip: { type: "string", description: "Pickup ZIP code." },
          dropoff_zip: { type: "string", description: "Dropoff ZIP code." },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["bed", "sofa", "wardrobe", "appliance", "boxes", "piano"] },
                quantity: { type: "number" },
              },
              required: ["type", "quantity"],
              additionalProperties: false,
            },
          },
        },
        required: ["pickup_zip", "dropoff_zip", "items"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_order",
      description: "Create a moving order after the user explicitly confirms they want to book.",
      parameters: {
        type: "object",
        properties: {
          pickup_zip: { type: "string" },
          dropoff_zip: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["bed", "sofa", "wardrobe", "appliance", "boxes", "piano"] },
                quantity: { type: "number" },
              },
              required: ["type", "quantity"],
              additionalProperties: false,
            },
          },
          customer_name: { type: "string" },
          customer_phone: { type: "string" },
          customer_email: { type: "string" },
          move_date: { type: "string" },
          inventory_size: { type: "string" },
        },
        required: ["pickup_zip", "dropoff_zip", "items", "move_date", "inventory_size", "customer_name", "customer_phone"],
        additionalProperties: false,
      },
    },
  },
] as const;

// ─── Order creation ───────────────────────────────────────────────────────────

async function createOrder(
  details: BookingDetails,
  status: "confirmed" | "lead-follow-up" = "confirmed"
) {
  const priceQuote = calculateMovePrice({
    pickup_zip: details.pickupZip ?? "",
    dropoff_zip: details.dropoffZip ?? "",
    items: details.items,
  });
  const pricingSummary = buildQuoteAdjustmentSummary(
    priceQuote,
    details.selectedAddOns ?? [],
    details.discountApplied ?? false
  );

  await connectToDatabase();

  const doc = new Order({
    pickup: { zip: details.pickupZip },
    dropoff: { zip: details.dropoffZip },
    items: details.items,
    customer: {
      name: details.customerName,
      phone: details.customerPhone,
      email: details.customerEmail,
    },
    selectedAddOns: details.selectedAddOns,
    originalPrice: pricingSummary.subtotal,
    discountApplied: pricingSummary.discountApplied,
    discountAmount: pricingSummary.discountAmount,
    reminderCall: details.reminderCall,
    afterHours: details.afterHoursSession ?? false,
    moveDate: details.moveDate,
    inventorySize: details.inventorySize,
    price: pricingSummary.finalTotal,
    status,
  });

  await assignOrderNumber(doc);
  await doc.save();

  return {
    order: {
      recordId: doc._id.toString(),
      id: formatOrderId(doc.orderNumber),
      status: doc.status,
      totalPrice: pricingSummary.finalTotal,
      selectedAddOns: details.selectedAddOns,
      discountApplied: pricingSummary.discountApplied,
      discountAmount: pricingSummary.discountAmount,
      reminderCall: details.reminderCall,
      afterHours: details.afterHoursSession ?? false,
      pickupZip: details.pickupZip,
      dropoffZip: details.dropoffZip,
      items: details.items,
      moveDate: details.moveDate,
      inventorySize: details.inventorySize,
      customerName: details.customerName,
    },
    priceQuote,
    pricingSummary,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

function sanitizeMessages(messages: unknown): IncomingMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ApiError(400, "Request body must include a non-empty messages array.");
  }
  if (messages.length > MAX_MESSAGES) {
    throw new ApiError(400, `Too many messages. Maximum is ${MAX_MESSAGES}.`);
  }
  return messages.map((message) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("role" in message) ||
      !("content" in message) ||
      typeof message.role !== "string" ||
      typeof message.content !== "string"
    ) {
      throw new ApiError(400, "Each message must include string role and content fields.");
    }
    if (message.role !== "user" && message.role !== "assistant" && message.role !== "system") {
      throw new ApiError(400, "Unsupported message role.");
    }
    if (message.content.length > MAX_MESSAGE_LENGTH) {
      throw new ApiError(400, `Message content must not exceed ${MAX_MESSAGE_LENGTH} characters.`);
    }
    const sanitized = (message.content as string).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    return { role: message.role as IncomingMessage["role"], content: sanitized };
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = getClientIp(request);

  if (!checkRateLimit(`chat:${ip}`, CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS)) {
    logger.warn("Rate limit exceeded", { ip });
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment before trying again." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const body = await request.json().catch(() => {
      throw new ApiError(400, "Request body must be valid JSON.");
    });

    const rawSessionId = body.sessionId;
    if (rawSessionId !== undefined && (typeof rawSessionId !== "string" || !UUID_RE.test(rawSessionId))) {
      throw new ApiError(400, "sessionId must be a valid UUID.");
    }
    const sessionId: string | undefined = typeof rawSessionId === "string" ? rawSessionId : undefined;

    // ── Booking progress update ──────────────────────────────────────────────
    const rawBookingProgress = body.bookingProgress as Record<string, unknown> | null | undefined;
    if (rawBookingProgress && typeof rawBookingProgress === "object") {
      if (!sessionId) throw new ApiError(400, "sessionId is required for booking progress updates.");

      const moveDate = typeof rawBookingProgress.moveDate === "string" && rawBookingProgress.moveDate.trim()
        ? rawBookingProgress.moveDate.trim() : undefined;
      const inventorySize = typeof rawBookingProgress.inventorySize === "string" && rawBookingProgress.inventorySize.trim()
        ? rawBookingProgress.inventorySize.trim() : undefined;
      const selectedAddOns = Array.isArray(rawBookingProgress.selectedAddOns)
        ? rawBookingProgress.selectedAddOns.filter(isServiceAddOnId) : undefined;
      const upsellReviewed = typeof rawBookingProgress.upsellReviewed === "boolean"
        ? rawBookingProgress.upsellReviewed : undefined;
      const discountApplied = typeof rawBookingProgress.discountApplied === "boolean"
        ? rawBookingProgress.discountApplied : undefined;
      const reminderCall = typeof rawBookingProgress.reminderCall === "boolean"
        ? rawBookingProgress.reminderCall : undefined;
      const afterHoursSession = typeof rawBookingProgress.afterHoursSession === "boolean"
        ? rawBookingProgress.afterHoursSession : undefined;

      if (!moveDate && !inventorySize && selectedAddOns === undefined && upsellReviewed === undefined &&
          discountApplied === undefined && reminderCall === undefined && afterHoursSession === undefined) {
        throw new ApiError(400, "No booking progress details were provided.");
      }

      await connectToDatabase();
      const progressSession = await Conversation.findOne({ sessionId });
      if (!progressSession) throw new ApiError(400, "Session not found. Please start a new chat.");

      progressSession.partialData = {
        ...(progressSession.partialData ?? {}),
        ...(selectedAddOns !== undefined ? { selectedAddOns } : {}),
        ...(upsellReviewed !== undefined ? { upsellReviewed } : {}),
        ...(discountApplied !== undefined ? { discountApplied } : {}),
        ...(reminderCall !== undefined ? { reminderCall } : {}),
        ...(afterHoursSession !== undefined ? { afterHoursSession } : {}),
        ...(moveDate ? { moveDate } : {}),
        ...(inventorySize ? { inventorySize } : {}),
      };
      progressSession.expiresAt = sessionExpiry();
      await progressSession.save();

      return NextResponse.json({ sessionId: progressSession.sessionId, partialData: progressSession.partialData });
    }

    // ── Lead form submission ─────────────────────────────────────────────────
    const rawLeadForm = body.leadForm as Record<string, unknown> | null | undefined;
    if (rawLeadForm && typeof rawLeadForm === "object") {
      const name = typeof rawLeadForm.name === "string" ? rawLeadForm.name.trim() : "";
      const phone = typeof rawLeadForm.phone === "string" ? rawLeadForm.phone.trim() : "";

      if (!name || name.length < 2) throw new ApiError(400, "Please provide a valid full name.");
      if (!phone) throw new ApiError(400, "Please provide a phone number.");
      if (!sessionId) throw new ApiError(400, "sessionId is required for lead follow-up submission.");

      await connectToDatabase();
      const leadSession = await Conversation.findOne({ sessionId });
      if (!leadSession) throw new ApiError(400, "Session not found. Please start a new chat.");

      const partial = leadSession.partialData;
      if (!partial?.pickupZip || !partial?.dropoffZip || !partial?.items?.length) {
        throw new ApiError(400, "Move details not found. Please tell us your pickup ZIP, dropoff ZIP, and items first.");
      }

      const created = await createOrder(
        {
          pickupZip: partial.pickupZip,
          dropoffZip: partial.dropoffZip,
          items: partial.items,
          selectedAddOns: partial.selectedAddOns,
          upsellReviewed: partial.upsellReviewed,
          discountApplied: partial.discountApplied,
          reminderCall: partial.reminderCall,
          afterHoursSession: partial.afterHoursSession,
          moveDate: partial.moveDate,
          inventorySize: partial.inventorySize,
          customerName: name,
          customerPhone: phone,
          leadCaptured: true,
        },
        "lead-follow-up"
      );

      const leadMsg = `Thanks, ${name}! I've saved your quote and one of our coordinators will follow up with you shortly. No pressure at all — we're here whenever you're ready.`;

      leadSession.partialData = { ...(leadSession.partialData ?? {}), customerName: name, customerPhone: phone, leadCaptured: true };
      leadSession.orderId = created.order.id;
      leadSession.messages.push({ role: "assistant", content: leadMsg, timestamp: new Date() });
      leadSession.expiresAt = sessionExpiry();
      await leadSession.save();

      return NextResponse.json({
        assistantMessage: leadMsg,
        structuredData: {
          details: cloneStoredBookingDetails(leadSession.partialData),
          priceQuote: created.priceQuote,
          pricingSummary: created.pricingSummary,
          prompt: null,
          order: created.order,
        },
        sessionId: leadSession.sessionId,
      });
    }

    // ── Contact form submission ──────────────────────────────────────────────
    const rawContactForm = body.contactForm as Record<string, unknown> | null | undefined;
    if (rawContactForm && typeof rawContactForm === "object") {
      const name = typeof rawContactForm.name === "string" ? rawContactForm.name.trim() : "";
      const phone = typeof rawContactForm.phone === "string" ? rawContactForm.phone.trim() : "";
      const email = typeof rawContactForm.email === "string" && rawContactForm.email.trim()
        ? rawContactForm.email.trim() : undefined;

      if (!name || name.length < 2) throw new ApiError(400, "Please provide a valid full name.");
      if (!phone) throw new ApiError(400, "Please provide a phone number.");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Please provide a valid email address.");
      if (!sessionId) throw new ApiError(400, "sessionId is required for contact form submission.");

      await connectToDatabase();
      const formSession = await Conversation.findOne({ sessionId });
      if (!formSession) throw new ApiError(400, "Session not found. Please start a new chat.");
      if (formSession.status === "booked") {
        return NextResponse.json(
          { error: "This conversation is already booked.", orderId: formSession.orderId ?? null },
          { status: 409 }
        );
      }

      const partial = formSession.partialData;
      if (!partial?.pickupZip || !partial?.dropoffZip || !partial?.items?.length) {
        throw new ApiError(400, "Move details not found. Please tell us your pickup ZIP, dropoff ZIP, and items first.");
      }
      if (!partial.moveDate) throw new ApiError(400, "Please choose your move date before confirming the booking.");
      if (!partial.inventorySize) throw new ApiError(400, "Please choose what you're moving before confirming the booking.");

      const bookingDetails: BookingDetails = {
        pickupZip: partial.pickupZip,
        dropoffZip: partial.dropoffZip,
        items: partial.items,
        selectedAddOns: partial.selectedAddOns,
        upsellReviewed: partial.upsellReviewed,
        discountApplied: partial.discountApplied,
        reminderCall: partial.reminderCall,
        afterHoursSession: partial.afterHoursSession,
        moveDate: partial.moveDate,
        inventorySize: partial.inventorySize,
        customerName: name,
        customerPhone: phone,
        customerEmail: email,
      };

      const { order, priceQuote, pricingSummary } = await createOrder(bookingDetails);
      const formattedTotal = formatCurrency(pricingSummary.finalTotal);
      const confirmMsg = `You're all set, ${name}! 🎉 Your booking is confirmed — ${order.id} for ${formattedTotal}. Route: ${partial.pickupZip} → ${partial.dropoffZip} on ${partial.moveDate}. We'll call you within 2 hours to confirm your crew. Anything else I can help with?`;

      formSession.partialData = {
        ...(formSession.partialData ?? {}),
        selectedAddOns: partial.selectedAddOns,
        upsellReviewed: partial.upsellReviewed,
        discountApplied: partial.discountApplied,
        moveDate: partial.moveDate,
        inventorySize: partial.inventorySize,
        customerName: name,
        customerPhone: phone,
        customerEmail: email,
      };
      formSession.status = "booked";
      formSession.orderId = order.id;
      formSession.expiresAt = sessionExpiry();
      await formSession.save();

      logger.info("Order created via contact form", { orderId: order.id, sessionId });

      return NextResponse.json({
        assistantMessage: confirmMsg,
        structuredData: { details: bookingDetails, priceQuote, pricingSummary, prompt: null, order },
        sessionId: formSession.sessionId,
      });
    }

    // ── Main AI chat path ────────────────────────────────────────────────────
    const messages = sanitizeMessages(body.messages);
    const client = getClient();

    await connectToDatabase();
    const dbSession = sessionId ? await Conversation.findOne({ sessionId }) : null;

    const persistedUserMessageCount =
      dbSession?.messages.filter((m) => m.role === "user").length ?? 0;

    if (dbSession && dbSession.status !== "booked" && persistedUserMessageCount >= DEMO_SESSION_MAX_USER_MESSAGES) {
      logger.info("Demo session cap reached", { sessionId, persistedUserMessageCount });
      return NextResponse.json(
        {
          assistantMessage: "Demo limit reached for this session. Start a new chat to continue.",
          structuredData: { details: dbSession.partialData ?? null, priceQuote: null, order: null },
          sessionId: dbSession.sessionId,
        },
        { status: 403 }
      );
    }

    const storedDetails = cloneStoredBookingDetails(dbSession?.partialData ?? null);
    const storedPriceQuote = (() => {
      const pd = dbSession?.partialData;
      if (pd?.pickupZip && pd?.dropoffZip && pd?.items?.length &&
          isValidUsZip(pd.pickupZip) && isValidUsZip(pd.dropoffZip) &&
          !pd.items.some((item) => item.quantity > MAX_ITEM_QUANTITY)) {
        try {
          return calculateMovePrice({ pickup_zip: pd.pickupZip, dropoff_zip: pd.dropoffZip, items: pd.items });
        } catch { return null; }
      }
      return null;
    })();

    const isBooked = dbSession?.status === "booked";
    const quoteAlreadyGiven = !isBooked && Boolean(storedPriceQuote);

    const activeSystemPrompt =
      isBooked && dbSession?.orderId && dbSession?.partialData
        ? buildSupportSystemPrompt(dbSession.partialData, dbSession.orderId)
        : buildSystemPrompt(quoteAlreadyGiven);

    // Inject current booking context into system prompt so AI always knows the state
    const contextInjection = storedDetails
      ? `\n\nCURRENT SESSION CONTEXT (already collected — do NOT ask for these again):\n` +
        (storedDetails.pickupZip ? `- Pickup ZIP: ${storedDetails.pickupZip}\n` : "") +
        (storedDetails.dropoffZip ? `- Dropoff ZIP: ${storedDetails.dropoffZip}\n` : "") +
        (storedDetails.items?.length ? `- Items: ${storedDetails.items.map(i => `${i.quantity}x ${i.type}`).join(", ")}\n` : "") +
        (storedDetails.moveDate ? `- Move date: ${storedDetails.moveDate}\n` : "") +
        (storedDetails.inventorySize ? `- Home size: ${storedDetails.inventorySize}\n` : "") +
        (storedPriceQuote ? `- Quote already given: ${formatCurrency(storedPriceQuote.totalPrice)}\n` : "")
      : "";

    const conversation = [
      { role: "system", content: activeSystemPrompt + contextInjection },
      ...messages,
    ] as Parameters<typeof client.chat.completions.create>[0]["messages"];

    const structuredData: StructuredResponse = {
      details: mergeBookingDetails(storedDetails, inferBookingDetailsFromMessages(messages)),
      priceQuote: storedPriceQuote,
      pricingSummary: getPricingSummary(storedPriceQuote, storedDetails),
      prompt: null,
      order: null,
    };

    logger.info("Chat request → OpenAI", { sessionId, messageCount: messages.length, quoteAlreadyGiven, isBooked });

    // ── AI agentic loop ──────────────────────────────────────────────────────
    for (let step = 0; step < 5; step++) {
      const { completion, model } = await createChatCompletion(client, {
        messages: conversation as Parameters<typeof client.chat.completions.create>[0]["messages"],
        ...(isBooked ? {} : {
          tools: TOOLS as unknown as Parameters<typeof client.chat.completions.create>[0]["tools"],
          tool_choice: "auto" as const,
        }),
      });

      logger.info("OpenAI completion", { model, step: step + 1, sessionId });

      const assistantMessage = completion.choices[0]?.message;
      if (!assistantMessage) throw new Error("OpenAI returned an empty response.");

      // No tool calls — return the AI's natural response directly
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        let assistantText = assistantMessage.content?.trim() ?? "";
        const latestUserText = getLastUserMessage(messages)?.content.trim() ?? "";

        // Minimal fallback only if truly empty
        if (!assistantText) {
          if (isBooked) {
            if (/\b(thanks|thank you|thx|ty)\b/i.test(latestUserText)) {
              assistantText = "You're welcome! If you need anything else with your booking, I'm here.";
            } else {
              assistantText = "Happy to help. Let me know if you need anything else with your booking.";
            }
          } else if (!structuredData.details?.pickupZip) {
            assistantText = "What's your pickup ZIP code?";
          } else if (!structuredData.details?.dropoffZip) {
            assistantText = "And what's the dropoff ZIP?";
          } else {
            assistantText = "Let me pull up your options now.";
          }
        }

        // Detect any structured prompts the AI may have triggered via language
        structuredData.prompt = detectPromptFromResponse(assistantText, structuredData.details);

        // Persist turn
        if (dbSession) {
          const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
          if (lastUserMsg) {
            dbSession.messages.push({ role: "user", content: lastUserMsg.content, timestamp: new Date() });
          }
          dbSession.messages.push({ role: "assistant", content: assistantText, timestamp: new Date() });
          if (structuredData.details) {
            dbSession.partialData = { ...(dbSession.partialData ?? {}), ...structuredData.details };
          }
          dbSession.expiresAt = sessionExpiry();
          await dbSession.save();
        }

        logger.info("Chat response sent", {
          sessionId: dbSession?.sessionId ?? sessionId ?? null,
          responseLength: assistantText.length,
          quoted: Boolean(structuredData.priceQuote),
          booked: Boolean(structuredData.order),
        });

        return NextResponse.json({
          assistantMessage: assistantText,
          structuredData,
          sessionId: dbSession?.sessionId ?? null,
        });
      }

      // Tool calls — execute and loop
      conversation.push({
        role: "assistant",
        content: assistantMessage.content ?? null,
        tool_calls: assistantMessage.tool_calls,
      });

      for (const toolCall of assistantMessage.tool_calls) {
        if (!isFunctionToolCall(toolCall)) {
          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: "Unsupported tool type." }),
          });
          continue;
        }

        const args = parseToolArguments(toolCall.function.arguments);
        const details = normalizeBookingDetails(args);

        // Merge new details into structured data
        structuredData.details = {
          ...structuredData.details,
          ...details,
          items: details.items.length > 0 ? details.items : structuredData.details?.items ?? [],
          selectedAddOns:
            details.selectedAddOns && details.selectedAddOns.length > 0
              ? details.selectedAddOns
              : structuredData.details?.selectedAddOns ?? [],
        };

        let toolResult: unknown;

        if (toolCall.function.name === "calculate_price") {
          const missingFields = getMissingQuoteFields(details);
          if (missingFields.length > 0) {
            toolResult = { error: "Missing fields for price calculation.", missingFields };
          } else if (!isValidUsZip(details.pickupZip ?? "")) {
            toolResult = { error: "pickup_zip must be a valid 5-digit US ZIP code." };
          } else if (!isValidUsZip(details.dropoffZip ?? "")) {
            toolResult = { error: "dropoff_zip must be a valid 5-digit US ZIP code." };
          } else {
            toolResult = calculateMovePrice({
              pickup_zip: details.pickupZip ?? "",
              dropoff_zip: details.dropoffZip ?? "",
              items: details.items,
            });
            structuredData.priceQuote = toolResult as PricingResult;
            structuredData.pricingSummary = getPricingSummary(structuredData.priceQuote, structuredData.details);
          }
        }

        if (toolCall.function.name === "create_order") {
          const missingFields = getMissingOrderFields(details);
          if (missingFields.length > 0) {
            toolResult = { error: "Missing fields for order creation.", missingFields };
          } else if (!isValidUsZip(details.pickupZip ?? "")) {
            toolResult = { error: "pickup_zip must be a valid 5-digit US ZIP code." };
          } else if (!isValidUsZip(details.dropoffZip ?? "")) {
            toolResult = { error: "dropoff_zip must be a valid 5-digit US ZIP code." };
          } else if (!isValidUsPhone(details.customerPhone ?? "")) {
            toolResult = { error: "customer_phone must be a valid US phone number." };
          } else if (details.items.some((item) => item.quantity > MAX_ITEM_QUANTITY)) {
            toolResult = { error: `Item quantity cannot exceed ${MAX_ITEM_QUANTITY} per type.` };
          } else {
            const created = await createOrder(details);
            structuredData.priceQuote = created.priceQuote;
            structuredData.pricingSummary = created.pricingSummary;
            structuredData.order = created.order;
            toolResult = created;
            logger.info("Order created", { orderId: created.order.id });
            if (dbSession) {
              dbSession.status = "booked";
              dbSession.orderId = created.order.id;
              dbSession.partialData = { ...(dbSession.partialData ?? {}), ...details };
            }
          }
        }

        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult ?? { error: "Unsupported tool." }),
        });
      }
    }

    return NextResponse.json({ error: "Unable to complete chat request." }, { status: 500 });

  } catch (error) {
    return toErrorResponse(error, ROUTE);
  }
}