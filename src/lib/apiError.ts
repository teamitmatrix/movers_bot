import { NextResponse } from "next/server";

/**
 * Represents an HTTP error that should be returned directly to the client.
 * The message is safe to expose.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const GENERIC_500 = "An unexpected error occurred. Please try again.";

/**
 * Converts any thrown value into a NextResponse.
 * - ApiError → returns the status + message as-is
 * - Everything else → logs the real error to stderr and returns a generic 500
 *   (or the real message in development)
 */
export function toErrorResponse(error: unknown, route: string): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  process.stderr.write(
    JSON.stringify({
      level: "error",
      route,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    }) + "\n"
  );

  return NextResponse.json(
    {
      error:
        process.env.NODE_ENV === "production"
          ? GENERIC_500
          : (error instanceof Error ? error.message : "Unexpected error."),
    },
    { status: 500 }
  );
}
