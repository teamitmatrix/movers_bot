import { NextResponse } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/apiError";
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

function mapSessionCreationError(error: unknown): ApiError | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const message = error.message.toLowerCase();

  if (message.includes("missing mongodb_uri")) {
    return new ApiError(500, "Server misconfiguration: missing MONGODB_URI.");
  }

  if (
    message.includes("authentication failed") ||
    message.includes("bad auth") ||
    message.includes("auth failed")
  ) {
    return new ApiError(503, "Database authentication failed. Check MongoDB user credentials.");
  }

  if (
    message.includes("server selection") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("timed out") ||
    message.includes("connection")
  ) {
    return new ApiError(503, "Database is unreachable. Check Atlas network access and cluster status.");
  }

  return null;
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
    const mappedError = mapSessionCreationError(error);
    if (mappedError) {
      return toErrorResponse(mappedError, "POST /api/sessions");
    }
    return toErrorResponse(error, "POST /api/sessions");
  }
}
