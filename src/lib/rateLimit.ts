type Entry = { count: number; windowStart: number };

// In-memory fixed-window store. Resets per instance.
// For multi-instance deployments, replace with a shared store (e.g., Upstash Redis).
const store = new Map<string, Entry>();

/**
 * Returns true if the request is within the allowed rate, false if it exceeds it.
 * Uses a fixed window that resets after windowMs.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

/**
 * Extracts the client IP from standard proxy headers, falling back to "unknown".
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
