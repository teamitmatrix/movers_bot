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
  order:
    | {
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
const GREETING_RE = /^(hi|hello|hey|good morning|good afternoon|good evening|hola|yo)\b/i;
const SERVICES_INFO_RE = /\b(services?|offer|provide|do you do|can you handle)\b/i;
const QUESTION_START_RE = /^(what|who|when|where|why|how|is|are|can|could|do|does|did|will|would|should)\b/i;
const COST_INQUIRY_RE = /\b(cost|price|total|amount|how much)\b/i;
const MOVING_SCOPE_RE = /\b(move|moving|mover|movers|service|services|quote|book|booking|pickup|dropoff|zip|route|items?|boxes|bed|sofa|wardrobe|appliance|piano|packing|packaging|unpacking|storage|disassembly|crew|truck|local|long-distance|long distance|cross-country|across the country|commercial|office|insured|license|fmcsa|payment|reschedule|cancel|order|oid-\d+|status)\b/i;
const SAME_DAY_RE = /\b(same[ -]?day|today)\b/i;
const SPECIALTY_ITEMS_RE = /\b(piano|pianos|antique|antiques|specialty items?|fragile items?)\b/i;
const PAYMENT_METHODS_RE = /\b(payment methods?|pay(?:ment)?|credit cards?|cash|zelle)\b/i;
const PACKING_RE = /\b(pack(?:ing|aging)?|unpack(?:ing)?|packing services?)\b/i;
const STORAGE_RE = /\b(storage|climate[- ]controlled)\b/i;
const RESCHEDULE_OR_CANCEL_RE = /\b(reschedule|cancel(?:lation)?|cancellations?)\b/i;
const ORDER_ID_RE = /\bOID-\d+\b/i;
const FAQ_ADJUSTMENT_CONFIRM_RE = /\b(yes|yeah|yep|sure|please|okay|ok|go ahead|do it|sounds good|add it|add that|include it|include that|check availability)\b/i;
const CONTINUE_BOOKING_OPTIONS = ["Continue Booking", "Ask Something Else"] as const;
const ORDER_ACTION_OPTIONS = [
  "Reschedule",
  "Cancel Booking",
  "Check Status",
] as const;

type FaqResponse = {
  assistantMessage: string;
  quickReplies: string[];
};

const SAME_DAY_FAQ_MESSAGE = "We do offer same-day moves based on crew availability! There's a $50 same-day fee. Want me to check availability for your route?";
const SPECIALTY_FAQ_MESSAGE = "Yes! We have specialty crews for pianos, antiques, and fragile items. There's an additional handling fee starting at $100. Shall I include that in your quote?";
const PACKING_FAQ_MESSAGE = "Yes, we provide full and partial packing/unpacking services. Professional packing starts at $150 and includes materials plus careful handling for fragile items. Want me to include packing in your quote?";
const STORAGE_FAQ_MESSAGE = "Yes, we have climate-controlled storage units available. Short-term (1-30 days) starts at $99/month. Want me to add that to your booking?";
const OUT_OF_SCOPE_REPLY = "Sorry, I can't help with that, if you are looking for moving service I can book your move.";
const GREETING_REPLY = "Hello! Welcome to Vanturo Moving. Would you like to book a new move or check an existing booking?";
const SERVICES_REPLY = "We provide local and long-distance moving across the country, plus packing, storage, furniture moving, and commercial moving services. If you want, I can help you book a move now or check an existing booking with your Order ID (like OID-101).";

function isGreetingMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return false;

  const words = trimmed.split(/\s+/).length;
  return words <= 8 && GREETING_RE.test(trimmed);
}

function looksLikeQuestion(message: string) {
  const trimmed = message.trim();
  if (!trimmed) return false;
  return trimmed.includes("?") || QUESTION_START_RE.test(trimmed.toLowerCase());
}

function isMovingScopeMessage(message: string) {
  return MOVING_SCOPE_RE.test(message.trim().toLowerCase());
}

function hasBookingContext(details: BookingDetails) {
  return Boolean(
    details.pickupZip ||
    details.dropoffZip ||
    details.items.length > 0 ||
    details.inventorySize ||
    details.moveDate
  );
}

function parseOrderNumberFromOrderId(orderId: string) {
  const match = orderId.match(/^OID-(\d+)$/i);
  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

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
- You must ONLY answer questions related to moving services, moving bookings, or order support
- If the user asks an unrelated question, reply exactly: "Sorry, I can't help with that, if you are looking for moving service I can book your move."
- For greetings (hi/hello/etc), warmly welcome them and ask whether they want to book a new move or check an existing booked move
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
You are guiding the customer step-by-step to get a moving quote. Be warm, natural, and helpful — like a real human agent on chat. Answer any questions they have, then continue the booking.

STRICT STEP ORDER (follow this exactly, ONE step at a time):
Step 1 → If pickup ZIP is not yet known: ask "What's your pickup ZIP code?"
Step 2 → If dropoff ZIP is not yet known: ask "Got it — and what's the dropoff ZIP?"
Step 3 → Once BOTH ZIP codes are confirmed: reply with a brief, natural confirmation like "Perfect, I have your route set!" then STOP. The booking interface will automatically present home-size options, item details, and add-on services to the customer. You do not need to ask for those.

CALCULATE PRICE WHEN:
- BOTH a pickup ZIP and a dropoff ZIP appear in the conversation, AND
- The customer has listed items (e.g. "1 sofa, 2 beds, 10 boxes") in their messages
→ In that case: call calculate_price immediately. Do NOT ask any further questions first.

HANDLING QUESTIONS:
- If the customer asks ANYTHING at any point, answer it naturally and helpfully
- After answering, continue from where you left off in the step order
- Never ignore a question — always acknowledge it
- You are an intelligent agent, not just a form-filler

WHAT NOT TO DO:
- Do NOT ask for items, home size, move date, or add-on services — the UI handles those steps
- Do NOT ask for name/phone/email — the contact form handles that
- Do NOT calculate or guess prices yourself — always use calculate_price tool
- Do NOT ask multiple questions at once
- Do NOT say "fill in the form" unprompted
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

function getLatestOrderId(messages: IncomingMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const match = messages[index]?.content.match(ORDER_ID_RE);

    if (match) {
      return match[0].toUpperCase();
    }
  }

  return null;
}

function appendFaqClosing(message: string) {
  return `${message}\n\nIs there anything else you'd like to know, or shall we continue with your quote?`;
}

function getPreviousAssistantMessage(messages: IncomingMessage[]) {
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      return messages[index]?.content ?? null;
    }
  }

  return null;
}

function addUniqueAddOn(addOnIds: ServiceAddOnId[] = [], addOnId: ServiceAddOnId) {
  return addOnIds.includes(addOnId) ? addOnIds : [...addOnIds, addOnId];
}

function getPendingFaqAdjustment(
  messages: IncomingMessage[],
  userMessage: string
): ServiceAddOnId | null {
  if (!FAQ_ADJUSTMENT_CONFIRM_RE.test(userMessage.trim())) {
    return null;
  }

  const previousAssistantMessage = getPreviousAssistantMessage(messages);

  if (!previousAssistantMessage) {
    return null;
  }

  if (previousAssistantMessage.includes(SAME_DAY_FAQ_MESSAGE)) {
    return "same-day-service";
  }

  if (previousAssistantMessage.includes(SPECIALTY_FAQ_MESSAGE)) {
    return "specialty-item-handling";
  }

  if (previousAssistantMessage.includes(STORAGE_FAQ_MESSAGE)) {
    return "storage-unit-30-days";
  }

  return null;
}

function buildQuoteAdjustmentReply(
  addOnId: ServiceAddOnId,
  details: BookingDetails,
  pricingSummary: QuoteAdjustmentSummary | null
) {
  const addOnLabel = SERVICE_ADDONS.find((addOn) => addOn.id === addOnId)?.shortLabel ?? addOnId;

  if (pricingSummary) {
    return appendFaqClosing(
      `Perfect — I included ${addOnLabel.toLowerCase()} in your quote. Your updated total is ${formatCurrency(pricingSummary.finalTotal)}.`
    );
  }

  if (details.pickupZip && details.dropoffZip && details.items.length > 0) {
    return appendFaqClosing(
      `Perfect — I included ${addOnLabel.toLowerCase()} in your quote prep. I can finalize the adjusted total as soon as we finish the quote details.`
    );
  }

  return appendFaqClosing(
    `Perfect — I’ll include ${addOnLabel.toLowerCase()} when I prepare your quote.`
  );
}

function getGlobalFaqResponse(messages: IncomingMessage[], userMessage: string): FaqResponse | null {
  const trimmedMessage = userMessage.trim();
  const latestOrderId = getLatestOrderId(messages);
  const explicitOrderId = trimmedMessage.match(ORDER_ID_RE)?.[0]?.toUpperCase();
  const activeOrderId = explicitOrderId ?? latestOrderId;

  if (/\b(check existing booking|existing booking|booked move|already booked)\b/i.test(trimmedMessage)) {
    return {
      assistantMessage: "Absolutely. Please share your Order ID (for example, OID-101), and I can help with status, rescheduling, or cancellation.",
      quickReplies: [...ORDER_ACTION_OPTIONS],
    };
  }

  if (explicitOrderId) {
    return {
      assistantMessage: appendFaqClosing(
        `Got it! I found your booking ${explicitOrderId}. Would you like to reschedule, cancel, or just check your status?`
      ),
      quickReplies: [...ORDER_ACTION_OPTIONS],
    };
  }

  if (activeOrderId && /^reschedule$/i.test(trimmedMessage)) {
    return {
      assistantMessage: appendFaqClosing(
        `Absolutely. For this demo, I've marked ${activeOrderId} for reschedule review and a coordinator will confirm your new preferred date shortly.`
      ),
      quickReplies: [...CONTINUE_BOOKING_OPTIONS],
    };
  }

  if (activeOrderId && /^cancel booking$/i.test(trimmedMessage)) {
    return {
      assistantMessage: appendFaqClosing(
        `No problem. For this demo, ${activeOrderId} is marked for cancellation review and our team will send a confirmation shortly.`
      ),
      quickReplies: [...CONTINUE_BOOKING_OPTIONS],
    };
  }

  if (activeOrderId && /^check status$/i.test(trimmedMessage)) {
    return {
      assistantMessage: `Sure thing. For this demo, ${activeOrderId} is active and waiting for final crew confirmation.`,
      quickReplies: [],
    };
  }

  if (SAME_DAY_RE.test(trimmedMessage)) {
    return {
      assistantMessage: appendFaqClosing(SAME_DAY_FAQ_MESSAGE),
      quickReplies: [...CONTINUE_BOOKING_OPTIONS],
    };
  }

  if (SPECIALTY_ITEMS_RE.test(trimmedMessage)) {
    return {
      assistantMessage: appendFaqClosing(SPECIALTY_FAQ_MESSAGE),
      quickReplies: [...CONTINUE_BOOKING_OPTIONS],
    };
  }

  if (PAYMENT_METHODS_RE.test(trimmedMessage)) {
    return {
      assistantMessage: appendFaqClosing(
        "We accept all major credit cards, cash, and Zelle. Payment is due on move day after everything is delivered."
      ),
      quickReplies: [...CONTINUE_BOOKING_OPTIONS],
    };
  }

  if (PACKING_RE.test(trimmedMessage)) {
    return {
      assistantMessage: appendFaqClosing(PACKING_FAQ_MESSAGE),
      quickReplies: [...CONTINUE_BOOKING_OPTIONS],
    };
  }

  if (STORAGE_RE.test(trimmedMessage)) {
    return {
      assistantMessage: appendFaqClosing(STORAGE_FAQ_MESSAGE),
      quickReplies: [...CONTINUE_BOOKING_OPTIONS],
    };
  }

  if (RESCHEDULE_OR_CANCEL_RE.test(trimmedMessage)) {
    return {
      assistantMessage: appendFaqClosing(
        "Absolutely. Cancellations are free up to 48 hours before your move. To reschedule, just reply here with your Order ID (format: OID-101) and your new preferred date."
      ),
      quickReplies: [...CONTINUE_BOOKING_OPTIONS],
    };
  }

  return null;
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
    reminderCall:
      typeof args.reminder_call === "boolean"
        ? args.reminder_call
        : typeof args.reminderCall === "boolean"
          ? args.reminderCall
          : undefined,
    afterHoursSession:
      typeof args.after_hours_session === "boolean"
        ? args.after_hours_session
        : typeof args.afterHoursSession === "boolean"
          ? args.afterHoursSession
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
    const total = (structuredData.pricingSummary?.finalTotal ?? structuredData.priceQuote.totalPrice).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const includedAddOns = structuredData.pricingSummary?.selectedAddOns.map((addOn) => addOn.shortLabel) ?? [];
    const addOnLine = includedAddOns.length > 0 ? `\nIncluded: ${includedAddOns.join(", ")}` : "";
    return `Quote ready — ${total}\nPickup: ${details.pickupZip} → Dropoff: ${details.dropoffZip}\nItems: ${itemSummary}${addOnLine}`;
  }

  const missingQuoteFields = getMissingQuoteFields(details);

  if (missingQuoteFields.length > 0) {
    if (missingQuoteFields.includes("pickup_zip")) {
      return "What's your pickup ZIP code?";
    }
    if (missingQuoteFields.includes("dropoff_zip")) {
      return "Got it — and what's the dropoff ZIP code?";
    }
    // Both ZIPs present but items not yet provided — UI will show options
    return "I have your route. Let me pull up your options now.";
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
      const reminderCall =
        typeof rawBookingProgress.reminderCall === "boolean"
          ? rawBookingProgress.reminderCall
          : undefined;
      const afterHoursSession =
        typeof rawBookingProgress.afterHoursSession === "boolean"
          ? rawBookingProgress.afterHoursSession
          : undefined;

      if (
        !moveDate &&
        !inventorySize &&
        selectedAddOns === undefined &&
        upsellReviewed === undefined &&
        discountApplied === undefined &&
        reminderCall === undefined &&
        afterHoursSession === undefined
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
        ...(reminderCall !== undefined ? { reminderCall } : {}),
        ...(afterHoursSession !== undefined ? { afterHoursSession } : {}),
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
      const bookingInProgress = hasBookingContext(mergedDetails) && !isBooked;

      structuredData.details = mergedDetails;
      structuredData.pricingSummary = getPricingSummary(storedPriceQuote, mergedDetails);

      let handledReply: string | null = null;
      const pendingFaqAdjustment = getPendingFaqAdjustment(messages, lastContent);

      if (COST_INQUIRY_RE.test(lastContent)) {
        const requestedOrderId =
          lastContent.match(ORDER_ID_RE)?.[0]?.toUpperCase() ?? getLatestOrderId(messages);

        if (requestedOrderId) {
          const orderNumber = parseOrderNumberFromOrderId(requestedOrderId);
          if (orderNumber) {
            const orderDoc = await Order.findOne({ orderNumber }).select("price").lean();

            if (orderDoc && typeof orderDoc.price === "number") {
              handledReply = appendFaqClosing(
                `The total cost for ${requestedOrderId} is ${formatCurrency(orderDoc.price)}.`
              );
              structuredData.prompt = {
                type: "quick-replies",
                options: [...ORDER_ACTION_OPTIONS],
              };
            }
          }
        }
      }

      if (!handledReply && isGreetingMessage(lastContent)) {
        handledReply = bookingInProgress
          ? appendFaqClosing("Hey! Happy to help.")
          : GREETING_REPLY;
        structuredData.prompt = {
          type: "quick-replies",
          options: bookingInProgress
            ? [...CONTINUE_BOOKING_OPTIONS]
            : ["Book a new move", "Check existing booking"],
        };
      } else if (!handledReply && SERVICES_INFO_RE.test(lastContent.toLowerCase()) && isMovingScopeMessage(lastContent)) {
        handledReply = appendFaqClosing(SERVICES_REPLY);
        structuredData.prompt = {
          type: "quick-replies",
          options: ["Continue Booking", "Check existing booking"],
        };
      } else if (!handledReply && looksLikeQuestion(lastContent) && !isMovingScopeMessage(lastContent)) {
        handledReply = OUT_OF_SCOPE_REPLY;
      }

      if (!handledReply && pendingFaqAdjustment) {
        const nextSelectedAddOns = addUniqueAddOn(mergedDetails.selectedAddOns, pendingFaqAdjustment);
        structuredData.details = {
          ...mergedDetails,
          selectedAddOns: nextSelectedAddOns,
        };
        structuredData.pricingSummary = getPricingSummary(storedPriceQuote, structuredData.details);
        handledReply = buildQuoteAdjustmentReply(
          pendingFaqAdjustment,
          structuredData.details,
          structuredData.pricingSummary ?? null
        );
        structuredData.prompt = {
          type: "quick-replies",
          options: [...CONTINUE_BOOKING_OPTIONS],
        };
      }

      if (!handledReply && PRICE_OBJECTION_RE.test(lastContent) && structuredData.pricingSummary && storedPriceQuote) {
        const discountedSummary = buildQuoteAdjustmentSummary(
          storedPriceQuote,
          structuredData.details?.selectedAddOns ?? [],
          true
        );
        handledReply = `I understand — moving costs can add up. I can offer you a 10% discount if you book today. That brings your total to ${formatCurrency(discountedSummary.finalTotal)}. Want to lock that in?`;
        structuredData.prompt = {
          type: "discount-offer",
          discountedTotal: discountedSummary.finalTotal,
        };
      } else if (!handledReply && MAYBE_LATER_RE.test(lastContent)) {
        handledReply = "No problem. Can I grab your name and number so we can follow up when you're ready? No obligation at all.";
        structuredData.prompt = { type: "lead-capture" };
      } else if (!handledReply && INSURANCE_RE.test(lastContent)) {
        handledReply = "Yes! We're fully FMCSA licensed and every move is insured up to $50,000, so your belongings are protected throughout the move.";
      } else if (!handledReply && TIMING_RE.test(lastContent) && mergedDetails.pickupZip && mergedDetails.dropoffZip) {
        const distance = calculateDistanceMiles(
          zipToCoordinates(mergedDetails.pickupZip),
          zipToCoordinates(mergedDetails.dropoffZip)
        );
        handledReply = formatMoveTiming(distance);
      }

      if (handledReply) {
        if (bookingInProgress) {
          structuredData.prompt ??= {
            type: "quick-replies",
            options: [...CONTINUE_BOOKING_OPTIONS],
          };
        } else {
          structuredData.prompt ??= null;
        }
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

      const faqResponse = getGlobalFaqResponse(messages, lastContent);

      if (faqResponse) {
        structuredData.prompt = {
          type: "quick-replies",
          options: faqResponse.quickReplies,
        };

        if (dbSession) {
          dbSession.messages.push({ role: "user", content: lastUserMessage.content, timestamp: new Date() });
          dbSession.messages.push({ role: "assistant", content: faqResponse.assistantMessage, timestamp: new Date() });
          dbSession.partialData = {
            ...(dbSession.partialData ?? {}),
            ...structuredData.details,
          };
          dbSession.expiresAt = sessionExpiry();
          await dbSession.save();
        }

        return NextResponse.json({
          assistantMessage: faqResponse.assistantMessage,
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

        if (
          structuredData.priceQuote &&
          structuredData.pricingSummary &&
          structuredData.pricingSummary.selectedAddOnIds.length > 0 &&
          !structuredData.order
        ) {
          assistantText = buildFallbackAssistantMessage(
            structuredData.details ?? { items: [] },
            structuredData,
            quoteAlreadyGiven
          );
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