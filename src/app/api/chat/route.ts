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
  calculateDistanceMiles,
  calculateMovePrice,
  type PricingItem,
  type PricingResult,
  zipToCoordinates,
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
    | {
        type: "discount-offer";
        discountedTotal: number;
      }
    | {
        type: "lead-capture";
      }
    | null;
  order:
    | {
        id: string;
        status: string;
        totalPrice: number;
        selectedAddOns?: ServiceAddOnId[];
        discountApplied?: boolean;
        discountAmount?: number;
        pickupZip?: string;
        dropoffZip?: string;
        moveDate?: string;
        inventorySize?: string;
        customerName?: string;
      }
    | null;
};

const PRIMARY_MODEL = process.env.OPENAI_MODEL_PRIMARY ?? process.env.OPENAI_MODEL ?? "gpt-5-mini";
const FALLBACK_MODEL = process.env.OPENAI_MODEL_FALLBACK ?? "gpt-5-nano";
const MODEL_CANDIDATES = [PRIMARY_MODEL, FALLBACK_MODEL].filter(
  (model, index, models): model is string => Boolean(model) && models.indexOf(model) === index
);
const MAX_ASSISTANT_TOKENS = 220;
const DEMO_SESSION_MAX_USER_MESSAGES = 10;
const LOCAL_MOVE_DISTANCE_THRESHOLD = 120;

const CACHED_ANSWERS = new Map<string, string>([
  ["are you insured", "Yes. Vanturo is fully insured. What are your pickup and dropoff ZIP codes?"],
  ["do you do long distance moves", "Yes. We handle local and long-distance moves across the US. What are your pickup and dropoff ZIP codes?"],
  ["what states do you serve", "We support moves across the US. Share your pickup and dropoff ZIP codes to continue."],
  ["what is your phone number", "You can reach Vanturo at (555) 100-2000."],
  ["how fast can i get a quote", "Usually in under 60 seconds. Please share your pickup ZIP and dropoff ZIP to get started."],
]);

const PRICE_OBJECTION_RE = /\b(too expensive|that's a lot|too much|can you do better|cheaper)\b/i;
const MAYBE_LATER_RE = /\b(let me think|i'?ll get back|not sure|maybe later)\b/i;
const INSURANCE_RE = /\b(do you have insurance|are you insured|licensed)\b/i;
const TIMING_RE = /\b(how long|how many hours|time)\b/i;

function buildSystemPrompt(quoteAlreadyGiven: boolean): string {
  const companyContext = `
You are Maya, a friendly and conversational booking assistant for Vanturo Moving.
You talk like a real human agent — warm, helpful, and natural.

COMPANY INFO:
- Name: Vanturo Moving
- Phone: (555) 100-2000
- Email: hello@vanturo.com
- License: FMCSA licensed, USDOT #2089147
- Insurance: All moves insured up to $50,000
- Services: Local moves, long-distance, packing, storage, furniture moving, commercial
- Hours: Mon–Sat 8am–8pm (AI available 24/7)
- Cancellation: Free up to 48 hours before move date
- Payment: Credit card, cash, or Zelle — due on move day

PRICING:
- Local move (same state): from $299 base
- Long-distance (different state): from $899 base
- Add $50 per bedroom above studio
- Distance surcharge: 500–1000 miles +$150, 1000+ miles +$300
- Add-ons: Packing $150, Storage $99/mo, Disassembly $75, Specialty items from $100

TONE RULES (NEVER break these):
- Always respond to greetings, thanks, and casual messages naturally
  Examples: "thanks" → "You're welcome! Let me know if you need anything else."
            "hey" → "Hey! How can I help you today?"
            "ok" → "Sounds good! Just let me know when you're ready."
- Keep replies concise: 1–3 short sentences max unless explaining something complex
- Never sound robotic or like a form
- Never repeat yourself or re-summarize the quote unprompted
- Never force the booking flow into a casual conversation
`;

  if (quoteAlreadyGiven) {
    return `${companyContext}

CURRENT STATE: Quote already provided.

YOUR ROLE NOW:
- You are a support agent helping the customer after their quote
- The booking form is already visible below the chat — do NOT mention it repeatedly
- Only say "complete the form below" once if they explicitly ask how to book
- Answer questions, handle objections, negotiate if needed, and chat naturally

NEGOTIATION RULES (only if customer pushes back on price):
- First offer: 10% discount "if they book today"
- If they still resist: offer 15% max
- If they want more than 15%: politely decline and highlight value (insured, licensed, no hidden fees)
- Never volunteer a discount — only offer when customer says price is too high

WHAT NOT TO DO:
- Do NOT call calculate_price again
- Do NOT re-show the quote unless explicitly asked
- Do NOT ask for name/phone/email (the form handles that)
- Do NOT say "fill in the form" unless the customer asks how to confirm
`;
  }

  return `${companyContext}

CURRENT STATE: No quote given yet.

YOUR ROLE NOW:
Collect 3 pieces of info to generate a quote. Ask ONE question at a time.

COLLECTION ORDER:
1. Pickup ZIP code
2. Dropoff ZIP code
3. What they're moving (home size or item description)

Once all 3 are collected → call calculate_price immediately.
After the quote is shown → say ONCE: "To confirm your booking, fill in the form below."
Then switch to natural conversation mode — do NOT keep pushing the form.

WHAT NOT TO DO:
- Do NOT ask for name/phone/email (the form handles that)
- Do NOT calculate or guess prices yourself — always use calculate_price tool
- Do NOT ask for ZIP codes if the customer is just chatting casually
- Do NOT ask multiple questions at once
`;
}

function buildSupportSystemPrompt(partial: PartialBookingData, orderId: string): string {
  const itemSummary =
    partial.items?.map((i) => `${i.quantity}x ${i.type}`).join(", ") ?? "not specified";

  const addOnSummary =
    partial.selectedAddOns
      ?.map((id) => SERVICE_ADDONS.find((a) => a.id === id)?.shortLabel ?? id)
      .join(", ") || "none";

  return `
You are Maya, a friendly support agent for Vanturo Moving.
The customer has already placed an order. Help them with it naturally.

ORDER DETAILS:
- Order ID: ${orderId}
- Route: ${partial.pickupZip ?? "?"} → ${partial.dropoffZip ?? "?"}
- Move date: ${partial.moveDate ?? "not set"}
- Home size: ${partial.inventorySize ?? "not specified"}
- Add-ons: ${addOnSummary}
- Items: ${itemSummary}

YOUR ROLE:
- Answer questions about this order clearly and naturally
- Provide status updates based on the details above
- Help with change requests (reassure them a team member will confirm changes)
- Be conversational — this is a chat, not a report

TONE RULES (NEVER break these):
- "thanks" → "You're welcome! Anything else I can help with?"
- "what's my order id?" → give them the Order ID clearly
- "what did I order?" → give a brief friendly summary, not a data dump
- Keep replies to 1–3 sentences unless they ask for full details
- Never list all order details unprompted — only share what's relevant to their question

WHAT NOT TO DO:
- Do NOT call any tools
- Do NOT create new orders or calculate new prices
- Do NOT repeat all order details in every message
- Do NOT sound like you're reading from a database
`;
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatMoveTiming(distance: number) {
  if (distance <= LOCAL_MOVE_DISTANCE_THRESHOLD) {
    return "Most moves your size take 3-5 hours.";
  }

  return "Long distance moves typically take 2-4 days door to door.";
}

function getLastUserMessage(messages: IncomingMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user") ?? null;
}
const TOOLS = [
  {
    type: "function",
    function: {
      name: "calculate_price",
      description: "Calculate a moving quote using ZIP codes and item types.",
      parameters: {
        type: "object",
        properties: {
          pickup_zip: {
            type: "string",
            description: "Pickup ZIP code.",
          },
          dropoff_zip: {
            type: "string",
            description: "Dropoff ZIP code.",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["bed", "sofa", "wardrobe", "appliance", "boxes", "piano"],
                },
                quantity: {
                  type: "number",
                },
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
      description: "Create a moving order after the user confirms the booking.",
      parameters: {
        type: "object",
        properties: {
          pickup_zip: {
            type: "string",
          },
          dropoff_zip: {
            type: "string",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["bed", "sofa", "wardrobe", "appliance", "boxes", "piano"],
                },
                quantity: {
                  type: "number",
                },
              },
              required: ["type", "quantity"],
              additionalProperties: false,
            },
          },
          customer_name: {
            type: "string",
          },
          customer_phone: {
            type: "string",
          },
          customer_email: {
            type: "string",
          },
          move_date: {
            type: "string",
          },
          inventory_size: {
            type: "string",
          },
        },
        required: [
          "pickup_zip",
          "dropoff_zip",
          "items",
          "move_date",
          "inventory_size",
          "customer_name",
          "customer_phone",
        ],
        additionalProperties: false,
      },
    },
  },
] as const;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }

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

function normalizeCacheKey(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getCachedAnswer(messages: IncomingMessage[]): string | null {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!lastUserMessage) {
    return null;
  }

  const normalized = normalizeCacheKey(lastUserMessage.content);
  let cachedAnswer: string | null = null;

  CACHED_ANSWERS.forEach((answer, key) => {
    if (!cachedAnswer && normalized.includes(key)) {
      cachedAnswer = answer;
    }
  });

  return cachedAnswer;
}

function isFunctionToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall
): toolCall is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall {
  return toolCall.type === "function";
}

const ROUTE = "POST /api/chat";
const logger = makeLogger(ROUTE);

// Input limits
const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_ITEM_QUANTITY = 50;

// Rate limit: 10 chat requests per minute per IP
const CHAT_RATE_MAX = 10;
const CHAT_RATE_WINDOW_MS = 60_000;

// Format validators
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const US_ZIP_RE = /^\d{5}$/;
const US_PHONE_RE = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;

function isValidUsZip(zip: string): boolean {
  return US_ZIP_RE.test(zip.trim());
}

function isValidUsPhone(phone: string): boolean {
  return US_PHONE_RE.test(phone.replace(/\s/g, ""));
}

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

    if (
      message.role !== "user" &&
      message.role !== "assistant" &&
      message.role !== "system"
    ) {
      throw new ApiError(400, "Unsupported message role.");
    }

    if (message.content.length > MAX_MESSAGE_LENGTH) {
      throw new ApiError(
        400,
        `Message content must not exceed ${MAX_MESSAGE_LENGTH} characters.`
      );
    }

    // Strip ASCII control characters except tab (0x09), LF (0x0A), and CR (0x0D)
    const sanitized = (message.content as string).replace(
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
      ""
    );

    return {
      role: message.role as IncomingMessage["role"],
      content: sanitized,
    };
  });
}

function parseToolArguments(input: string): Record<string, unknown> {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    throw new Error("Tool arguments must be valid JSON.");
  }
}

function normalizeBookingDetails(args: Record<string, unknown>): BookingDetails {
  return {
    pickupZip:
      typeof args.pickup_zip === "string" ? args.pickup_zip : undefined,
    dropoffZip:
      typeof args.dropoff_zip === "string" ? args.dropoff_zip : undefined,
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
    upsellReviewed:
      typeof args.upsell_reviewed === "boolean"
        ? args.upsell_reviewed
        : typeof args.upsellReviewed === "boolean"
          ? args.upsellReviewed
          : undefined,
    discountApplied:
      typeof args.discount_applied === "boolean"
        ? args.discount_applied
        : typeof args.discountApplied === "boolean"
          ? args.discountApplied
          : undefined,
    customerName:
      typeof args.customer_name === "string"
        ? args.customer_name
        : typeof args.customerName === "string"
          ? args.customerName
          : undefined,
    customerPhone:
      typeof args.customer_phone === "string"
        ? args.customer_phone
        : typeof args.customerPhone === "string"
          ? args.customerPhone
          : undefined,
    customerEmail:
      typeof args.customer_email === "string"
        ? args.customer_email
        : typeof args.customerEmail === "string"
          ? args.customerEmail
          : undefined,
    moveDate:
      typeof args.move_date === "string"
        ? args.move_date
        : typeof args.moveDate === "string"
          ? args.moveDate
          : undefined,
    inventorySize:
      typeof args.inventory_size === "string"
        ? args.inventory_size
        : typeof args.inventorySize === "string"
          ? args.inventorySize
          : undefined,
    leadCaptured:
      typeof args.lead_captured === "boolean"
        ? args.lead_captured
        : typeof args.leadCaptured === "boolean"
          ? args.leadCaptured
          : undefined,
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
    moveDate: primary?.moveDate ?? secondary.moveDate,
    inventorySize: primary?.inventorySize ?? secondary.inventorySize,
    leadCaptured: primary?.leadCaptured ?? secondary.leadCaptured,
    customerName: primary?.customerName ?? secondary.customerName,
    customerPhone: primary?.customerPhone ?? secondary.customerPhone,
    customerEmail: primary?.customerEmail ?? secondary.customerEmail,
  };
}

function inferBookingDetailsFromMessages(messages: IncomingMessage[]): BookingDetails {
  // Scan ALL user messages so data from earlier turns isn't lost
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

function buildFallbackAssistantMessage(details: BookingDetails, structuredData: StructuredResponse, quoteAlreadyGiven = false): string {
  if (structuredData.order) {
    return `Booking confirmed. Order ${structuredData.order.id} — Total: ${structuredData.order.totalPrice.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`;
  }

  if (structuredData.priceQuote) {
    // If quote was already in the session before this turn, just nudge — don't repeat the whole quote
    if (quoteAlreadyGiven) {
      return "Please fill in the contact form above to confirm your booking.";
    }
    const itemSummary = details.items.map((item) => `${item.quantity}x ${item.type}`).join(", ");
    const total = structuredData.priceQuote.totalPrice.toLocaleString("en-US", { style: "currency", currency: "USD" });
    return `Quote ready — ${total}\nPickup: ${details.pickupZip} → Dropoff: ${details.dropoffZip}\nItems: ${itemSummary}\n\nTo confirm your booking, please fill in the form below.`;
  }

  const missingQuoteFields = getMissingQuoteFields(details);

  if (missingQuoteFields.length > 0) {
    if (missingQuoteFields.includes("items")) {
      return "What items are you moving? Example: 1 sofa, 2 beds, 10 boxes.";
    }
    return "Please share your pickup ZIP, dropoff ZIP, and the items you need moved.";
  }

  return "Calculating your quote now\u2026";
}

function getMissingQuoteFields(details: BookingDetails) {
  const missingFields: string[] = [];

  if (!details.pickupZip) {
    missingFields.push("pickup_zip");
  }

  if (!details.dropoffZip) {
    missingFields.push("dropoff_zip");
  }

  if (details.items.length === 0) {
    missingFields.push("items");
  }

  return missingFields;
}

function getMissingOrderFields(details: BookingDetails) {
  const missingFields = getMissingQuoteFields(details);

  if (!details.customerName) {
    missingFields.push("customer_name");
  }

  if (!details.moveDate) {
    missingFields.push("move_date");
  }

  if (!details.inventorySize) {
    missingFields.push("inventory_size");
  }

  if (!details.customerPhone) {
    missingFields.push("customer_phone");
  }

  return missingFields;
}

function getPricingSummary(priceQuote: PricingResult | null, details: BookingDetails | null) {
  if (!priceQuote) {
    return null;
  }

  return buildQuoteAdjustmentSummary(
    priceQuote,
    details?.selectedAddOns ?? [],
    details?.discountApplied ?? false
  );
}

function userConfirmedBooking(messages: IncomingMessage[]) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!lastUserMessage) {
    return false;
  }

  return /\b(confirm|confirmed|book|booking|proceed|go ahead|yes)\b/i.test(
    lastUserMessage.content
  );
}

async function createOrder(details: BookingDetails, status: "confirmed" | "lead-follow-up" = "confirmed") {
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
    moveDate: details.moveDate,
    inventorySize: details.inventorySize,
    price: pricingSummary.finalTotal,
    status,
  });

  await assignOrderNumber(doc);
  await doc.save();

  return {
    order: {
      id: formatOrderId(doc.orderNumber),
      status: doc.status,
      totalPrice: pricingSummary.finalTotal,
      selectedAddOns: details.selectedAddOns,
      discountApplied: pricingSummary.discountApplied,
      discountAmount: pricingSummary.discountAmount,
      pickupZip: details.pickupZip,
      dropoffZip: details.dropoffZip,
      moveDate: details.moveDate,
      inventorySize: details.inventorySize,
      customerName: details.customerName,
    },
    priceQuote,
    pricingSummary,
  };
}

function sessionExpiry() {
  const date = new Date();
  date.setHours(date.getHours() + 24);
  return date;
}

function cloneStoredBookingDetails(details: PartialBookingData | null | undefined): BookingDetails | null {
  if (!details) {
    return null;
  }

  return {
    pickupZip: details.pickupZip,
    dropoffZip: details.dropoffZip,
    items: Array.isArray(details.items) ? [...details.items] : [],
    selectedAddOns: details.selectedAddOns ? [...details.selectedAddOns] : [],
    upsellReviewed: details.upsellReviewed,
    discountApplied: details.discountApplied,
    moveDate: details.moveDate,
    inventorySize: details.inventorySize,
    leadCaptured: details.leadCaptured,
    customerName: details.customerName,
    customerPhone: details.customerPhone,
    customerEmail: details.customerEmail,
  };
}

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
    const sessionId: string | undefined =
      typeof rawSessionId === "string" ? rawSessionId : undefined;

    const rawBookingProgress = body.bookingProgress as Record<string, unknown> | null | undefined;
    if (rawBookingProgress && typeof rawBookingProgress === "object") {
      if (!sessionId) {
        throw new ApiError(400, "sessionId is required for booking progress updates.");
      }

      const moveDate =
        typeof rawBookingProgress.moveDate === "string" && rawBookingProgress.moveDate.trim()
          ? rawBookingProgress.moveDate.trim()
          : undefined;
      const inventorySize =
        typeof rawBookingProgress.inventorySize === "string" && rawBookingProgress.inventorySize.trim()
          ? rawBookingProgress.inventorySize.trim()
          : undefined;
      const selectedAddOns = Array.isArray(rawBookingProgress.selectedAddOns)
        ? rawBookingProgress.selectedAddOns.filter(isServiceAddOnId)
        : undefined;
      const upsellReviewed =
        typeof rawBookingProgress.upsellReviewed === "boolean"
          ? rawBookingProgress.upsellReviewed
          : undefined;
      const discountApplied =
        typeof rawBookingProgress.discountApplied === "boolean"
          ? rawBookingProgress.discountApplied
          : undefined;

      if (
        !moveDate &&
        !inventorySize &&
        selectedAddOns === undefined &&
        upsellReviewed === undefined &&
        discountApplied === undefined
      ) {
        throw new ApiError(400, "No booking progress details were provided.");
      }

      await connectToDatabase();
      const progressSession = await Conversation.findOne({ sessionId });
      if (!progressSession) {
        throw new ApiError(400, "Session not found. Please start a new chat.");
      }

      progressSession.partialData = {
        ...(progressSession.partialData ?? {}),
        ...(selectedAddOns !== undefined ? { selectedAddOns } : {}),
        ...(upsellReviewed !== undefined ? { upsellReviewed } : {}),
        ...(discountApplied !== undefined ? { discountApplied } : {}),
        ...(moveDate ? { moveDate } : {}),
        ...(inventorySize ? { inventorySize } : {}),
      };
      progressSession.expiresAt = sessionExpiry();
      await progressSession.save();

      return NextResponse.json({
        sessionId: progressSession.sessionId,
        partialData: progressSession.partialData,
      });
    }

    const rawLeadForm = body.leadForm as Record<string, unknown> | null | undefined;
    if (rawLeadForm && typeof rawLeadForm === "object") {
      const name = typeof rawLeadForm.name === "string" ? rawLeadForm.name.trim() : "";
      const phone = typeof rawLeadForm.phone === "string" ? rawLeadForm.phone.trim() : "";

      if (!name || name.length < 2) {
        throw new ApiError(400, "Please provide a valid full name.");
      }
      if (!phone) {
        throw new ApiError(400, "Please provide a phone number.");
      }
      if (!sessionId) {
        throw new ApiError(400, "sessionId is required for lead follow-up submission.");
      }

      await connectToDatabase();
      const leadSession = await Conversation.findOne({ sessionId });
      if (!leadSession) {
        throw new ApiError(400, "Session not found. Please start a new chat.");
      }

      const partial = leadSession.partialData;
      if (!partial?.pickupZip || !partial?.dropoffZip || !partial?.items?.length) {
        throw new ApiError(
          400,
          "Move details not found. Please tell us your pickup ZIP, dropoff ZIP, and items first."
        );
      }

      const created = await createOrder(
        {
          pickupZip: partial.pickupZip,
          dropoffZip: partial.dropoffZip,
          items: partial.items,
          selectedAddOns: partial.selectedAddOns,
          upsellReviewed: partial.upsellReviewed,
          discountApplied: partial.discountApplied,
          moveDate: partial.moveDate,
          inventorySize: partial.inventorySize,
          customerName: name,
          customerPhone: phone,
          leadCaptured: true,
        },
        "lead-follow-up"
      );

      const leadMsg = `Thanks, ${name}. We saved your quote and a coordinator will follow up when you're ready.`;

      leadSession.partialData = {
        ...(leadSession.partialData ?? {}),
        customerName: name,
        customerPhone: phone,
        leadCaptured: true,
      };
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

    // ── Contact form submission path (bypasses AI entirely) ──────────────────
    const rawContactForm = body.contactForm as Record<string, unknown> | null | undefined;
    if (rawContactForm && typeof rawContactForm === "object") {
      const name = typeof rawContactForm.name === "string" ? rawContactForm.name.trim() : "";
      const phone = typeof rawContactForm.phone === "string" ? rawContactForm.phone.trim() : "";
      const email = typeof rawContactForm.email === "string" && rawContactForm.email.trim()
        ? rawContactForm.email.trim()
        : undefined;

      if (!name || name.length < 2) {
        throw new ApiError(400, "Please provide a valid full name.");
      }
      if (!phone) {
        throw new ApiError(400, "Please provide a phone number.");
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError(400, "Please provide a valid email address.");
      }
      if (!sessionId) {
        throw new ApiError(400, "sessionId is required for contact form submission.");
      }

      await connectToDatabase();
      const formSession = await Conversation.findOne({ sessionId });
      if (!formSession) {
        throw new ApiError(400, "Session not found. Please start a new chat.");
      }
      if (formSession.status === "booked") {
        return NextResponse.json(
          { error: "This conversation is already booked.", orderId: formSession.orderId ?? null },
          { status: 409 }
        );
      }

      const partial = formSession.partialData;
      if (!partial?.pickupZip || !partial?.dropoffZip || !partial?.items?.length) {
        throw new ApiError(
          400,
          "Move details not found. Please tell us your pickup ZIP, dropoff ZIP, and items first."
        );
      }
      if (!partial.moveDate) {
        throw new ApiError(400, "Please choose your move date before confirming the booking.");
      }
      if (!partial.inventorySize) {
        throw new ApiError(400, "Please choose what you're moving before confirming the booking.");
      }

      const bookingDetails: BookingDetails = {
        pickupZip: partial.pickupZip,
        dropoffZip: partial.dropoffZip,
        items: partial.items,
        selectedAddOns: partial.selectedAddOns,
        upsellReviewed: partial.upsellReviewed,
        discountApplied: partial.discountApplied,
        moveDate: partial.moveDate,
        inventorySize: partial.inventorySize,
        customerName: name,
        customerPhone: phone,
        customerEmail: email,
      };

      const { order, priceQuote, pricingSummary } = await createOrder(bookingDetails);

      const formattedTotal = formatCurrency(pricingSummary.finalTotal);
      const confirmMsg = `Booking confirmed! ${order.id} — ${formattedTotal}\nRoute: ${partial.pickupZip} → ${partial.dropoffZip}\nDate: ${partial.moveDate}\nHome size: ${partial.inventorySize}\nName: ${name}\nWe'll call you within 2 hours to confirm your crew.`;

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
      formSession.messages.push({ role: "assistant", content: confirmMsg, timestamp: new Date() });
      formSession.expiresAt = sessionExpiry();
      await formSession.save();

      logger.info("Order created via contact form", { orderId: order.id, sessionId });

      return NextResponse.json({
        assistantMessage: confirmMsg,
        structuredData: { details: bookingDetails, priceQuote, pricingSummary, prompt: null, order },
        sessionId: formSession.sessionId,
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    const messages = sanitizeMessages(body.messages);
    const client = getClient();

    // Load persisted history for this session (if any)
    await connectToDatabase();
    const dbSession = sessionId
      ? await Conversation.findOne({ sessionId })
      : null;

    const persistedUserMessageCount =
      dbSession?.messages.filter((message) => message.role === "user").length ?? 0;

    // Only enforce the demo cap on pre-booking turns
    if (dbSession && dbSession.status !== "booked" && persistedUserMessageCount >= DEMO_SESSION_MAX_USER_MESSAGES) {
      logger.info("Demo session cap reached", {
        sessionId,
        persistedUserMessageCount,
      });

      return NextResponse.json(
        {
          assistantMessage:
            "Demo limit reached for this session. Start a new chat to continue.",
          structuredData: {
            details: dbSession.partialData ?? null,
            priceQuote: null,
            order: null,
          },
          sessionId: dbSession.sessionId,
        },
        { status: 403 }
      );
    }

    // Reject messages on sessions that have already been booked
    // Allow post-booking support messages — switch to support system prompt below instead.

    logger.info("Chat request", { sessionId, messageCount: messages.length });

    // Pre-populate priceQuote from stored partial data so the UI knows a quote was already given
    const storedDetails = cloneStoredBookingDetails(dbSession?.partialData ?? null);
    const storedPriceQuote = (() => {
      const pd = dbSession?.partialData;
      if (
        pd?.pickupZip &&
        pd?.dropoffZip &&
        pd?.items?.length &&
        isValidUsZip(pd.pickupZip) &&
        isValidUsZip(pd.dropoffZip) &&
        !pd.items.some((item) => item.quantity > MAX_ITEM_QUANTITY)
      ) {
        try {
          return calculateMovePrice({
            pickup_zip: pd.pickupZip,
            dropoff_zip: pd.dropoffZip,
            items: pd.items,
          });
        } catch {
          return null;
        }
      }
      return null;
    })();

    const isBooked = dbSession?.status === "booked";
    const quoteAlreadyGiven = !isBooked && Boolean(storedPriceQuote);
    const activeSystemPrompt =
      isBooked && dbSession?.orderId && dbSession?.partialData
        ? buildSupportSystemPrompt(dbSession.partialData, dbSession.orderId)
        : buildSystemPrompt(quoteAlreadyGiven);

    const conversation = [
      { role: "system", content: activeSystemPrompt },
      ...messages,
    ] as Parameters<typeof client.chat.completions.create>[0]["messages"];

    const structuredData: StructuredResponse = {
      details: storedDetails,
      priceQuote: storedPriceQuote,
      pricingSummary: getPricingSummary(storedPriceQuote, storedDetails),
      prompt: null,
      order: null,
    };

    const lastUserMessage = getLastUserMessage(messages);

    if (lastUserMessage) {
      const lastContent = lastUserMessage.content.trim();
      const mergedDetails = mergeBookingDetails(
        structuredData.details,
        inferBookingDetailsFromMessages(messages)
      );

      structuredData.details = mergedDetails;
      structuredData.pricingSummary = getPricingSummary(storedPriceQuote, mergedDetails);

      let handledReply: string | null = null;

      if (PRICE_OBJECTION_RE.test(lastContent) && structuredData.pricingSummary && storedPriceQuote) {
        const discountedSummary = buildQuoteAdjustmentSummary(
          storedPriceQuote,
          mergedDetails.selectedAddOns ?? [],
          true
        );
        handledReply = `I understand — moving costs can add up. I can offer you a 10% discount if you book today. That brings your total to ${formatCurrency(discountedSummary.finalTotal)}. Want to lock that in?`;
        structuredData.prompt = {
          type: "discount-offer",
          discountedTotal: discountedSummary.finalTotal,
        };
      } else if (MAYBE_LATER_RE.test(lastContent)) {
        handledReply = "No problem. Can I grab your name and number so we can follow up when you're ready? No obligation at all.";
        structuredData.prompt = { type: "lead-capture" };
      } else if (INSURANCE_RE.test(lastContent)) {
        handledReply = "Yes! We're fully FMCSA licensed and every move is insured up to $50,000, so your belongings are protected throughout the move.";
      } else if (TIMING_RE.test(lastContent) && mergedDetails.pickupZip && mergedDetails.dropoffZip) {
        const distance = calculateDistanceMiles(
          zipToCoordinates(mergedDetails.pickupZip),
          zipToCoordinates(mergedDetails.dropoffZip)
        );
        handledReply = formatMoveTiming(distance);
      }

      if (handledReply) {
        if (dbSession) {
          dbSession.messages.push({ role: "user", content: lastUserMessage.content, timestamp: new Date() });
          dbSession.messages.push({ role: "assistant", content: handledReply, timestamp: new Date() });
          dbSession.partialData = {
            ...(dbSession.partialData ?? {}),
            ...structuredData.details,
          };
          dbSession.expiresAt = sessionExpiry();
          await dbSession.save();
        }

        return NextResponse.json({
          assistantMessage: handledReply,
          structuredData,
          sessionId: dbSession?.sessionId ?? null,
        });
      }
    }

    const cachedAnswer = getCachedAnswer(messages);

    if (cachedAnswer) {
      logger.info("Served cached chat answer", {
        sessionId,
        responseLength: cachedAnswer.length,
      });

      if (dbSession && lastUserMessage) {
        dbSession.messages.push({ role: "user", content: lastUserMessage.content, timestamp: new Date() });
        dbSession.messages.push({ role: "assistant", content: cachedAnswer, timestamp: new Date() });
        dbSession.expiresAt = sessionExpiry();
        await dbSession.save();
      }

      return NextResponse.json({
        assistantMessage: cachedAnswer,
        structuredData,
        sessionId: dbSession?.sessionId ?? null,
      });
    }

    for (let step = 0; step < 5; step += 1) {
      const { completion, model } = await createChatCompletion(client, {
        messages: conversation as Parameters<typeof client.chat.completions.create>[0]["messages"],
        ...(isBooked
          ? {}
          : {
              tools: TOOLS as unknown as Parameters<typeof client.chat.completions.create>[0]["tools"],
              tool_choice: "auto" as const,
            }),
      });

      logger.info("OpenAI completion created", { model, step: step + 1, sessionId });

      const assistantMessage = completion.choices[0]?.message;

      if (!assistantMessage) {
        throw new Error("OpenAI returned an empty response.");
      }

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        let assistantText = assistantMessage.content?.trim() ?? "";

        if (!assistantText) {
          const inferredDetails = inferBookingDetailsFromMessages(messages);
          const mergedDetails = mergeBookingDetails(structuredData.details, inferredDetails);

          structuredData.details = mergedDetails;

          const missingQuoteFields = getMissingQuoteFields(mergedDetails);
          if (
            !structuredData.priceQuote &&
            missingQuoteFields.length === 0 &&
            isValidUsZip(mergedDetails.pickupZip ?? "") &&
            isValidUsZip(mergedDetails.dropoffZip ?? "") &&
            !mergedDetails.items.some((item) => item.quantity > MAX_ITEM_QUANTITY)
          ) {
            structuredData.priceQuote = calculateMovePrice({
              pickup_zip: mergedDetails.pickupZip ?? "",
              dropoff_zip: mergedDetails.dropoffZip ?? "",
              items: mergedDetails.items,
            });
            structuredData.pricingSummary = getPricingSummary(structuredData.priceQuote, mergedDetails);
          }

          assistantText = buildFallbackAssistantMessage(mergedDetails, structuredData, quoteAlreadyGiven);
          logger.warn("Empty assistant response replaced with fallback", {
            sessionId,
            inferredQuote: Boolean(structuredData.priceQuote),
            inferredItems: mergedDetails.items.length,
          });
        }

        // Persist the new user+assistant turn into MongoDB
        if (dbSession) {
          const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
          if (lastUserMsg) {
            dbSession.messages.push({ role: "user", content: lastUserMsg.content, timestamp: new Date() });
          }
          dbSession.messages.push({ role: "assistant", content: assistantText, timestamp: new Date() });
          if (structuredData.details) {
            dbSession.partialData = {
              ...(dbSession.partialData ?? {}),
              ...structuredData.details,
            };
          }
          dbSession.expiresAt = sessionExpiry();
          await dbSession.save();
        }

        logger.info("Chat response sent", {
          sessionId: dbSession?.sessionId ?? sessionId ?? null,
          responseLength: assistantText.length,
          structuredDetailsCaptured: Boolean(structuredData.details),
          quoted: Boolean(structuredData.priceQuote),
          booked: Boolean(structuredData.order),
        });

        return NextResponse.json({
          assistantMessage: assistantText,
          structuredData,
          sessionId: dbSession?.sessionId ?? null,
        });
      }
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
            toolResult = {
              error: "Missing fields for order creation.",
              missingFields,
            };
          } else if (!isValidUsZip(details.pickupZip ?? "")) {
            toolResult = { error: "pickup_zip must be a valid 5-digit US ZIP code." };
          } else if (!isValidUsZip(details.dropoffZip ?? "")) {
            toolResult = { error: "dropoff_zip must be a valid 5-digit US ZIP code." };
          } else if (!isValidUsPhone(details.customerPhone ?? "")) {
            toolResult = { error: "customer_phone must be a valid US phone number (e.g. 555-867-5309)." };
          } else if (details.items.some((item) => item.quantity > MAX_ITEM_QUANTITY)) {
            toolResult = { error: `Item quantity cannot exceed ${MAX_ITEM_QUANTITY} per type.` };
          } else if (!userConfirmedBooking(messages)) {
            toolResult = {
              error: "Booking has not been confirmed by the user yet.",
            };
          } else {
            const created = await createOrder(details);
            structuredData.priceQuote = created.priceQuote;
            structuredData.pricingSummary = created.pricingSummary;
            structuredData.order = created.order;
            toolResult = created;
            logger.info("Order created", { orderId: created.order.id });

            // Mark session as booked and link to the new order
            if (dbSession) {
              dbSession.status = "booked";
              dbSession.orderId = created.order.id;
              dbSession.partialData = {
                ...(dbSession.partialData ?? {}),
                ...details,
              };
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

    return NextResponse.json(
      {
        error: "Unable to complete chat request.",
      },
      { status: 500 }
    );
  } catch (error) {
    return toErrorResponse(error, ROUTE);
  }
}