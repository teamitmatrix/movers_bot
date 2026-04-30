import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/apiError";
import { makeLogger } from "@/lib/logger";
import { connectToDatabase } from "@/lib/mongodb";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import Conversation from "@/models/Conversation";

const logger = makeLogger("POST /api/sessions");

// 5 new sessions per minute per IP
const SESSION_RATE_MAX = 5;
const SESSION_RATE_WINDOW_MS = 60_000;

// 24 hours from now
function sessionExpiry() {
  const date = new Date();
  date.setHours(date.getHours() + 24);
  return date;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  if (!checkRateLimit(`sessions:${ip}`, SESSION_RATE_MAX, SESSION_RATE_WINDOW_MS)) {
    logger.warn("Rate limit exceeded", { ip });
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment before trying again." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    await connectToDatabase();

    const sessionId = crypto.randomUUID();

    await Conversation.create({
      sessionId,
      messages: [],
      partialData: {},
      status: "active",
      expiresAt: sessionExpiry(),
    });

    logger.info("Session created", { sessionId });

    return NextResponse.json({ sessionId }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "POST /api/sessions");
  }
}
