import { NextResponse } from "next/server";

import { ApiError, toErrorResponse } from "@/lib/apiError";
import { makeLogger } from "@/lib/logger";
import { connectToDatabase } from "@/lib/mongodb";
import Conversation from "@/models/Conversation";

const logger = makeLogger("GET /api/sessions/[sessionId]");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: { sessionId: string };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { sessionId } = params;

  if (!sessionId || !UUID_RE.test(sessionId)) {
    throw new ApiError(400, "Invalid sessionId.");
  }

  try {
    await connectToDatabase();

    const conversation = await Conversation.findOne({ sessionId }).lean();

    if (!conversation) {
      return NextResponse.json(
        { error: "Session not found or expired." },
        { status: 404 }
      );
    }

    logger.info("Session loaded", { sessionId });

    return NextResponse.json({
      sessionId: conversation.sessionId,
      messages: conversation.messages,
      partialData: conversation.partialData,
      status: conversation.status,
      orderId: conversation.orderId ?? null,
    });
  } catch (error) {
    return toErrorResponse(error, "GET /api/sessions/[sessionId]");
  }
}
