type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  route: string;
  message: string;
  timestamp: string;
  data?: unknown;
}

function write(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export function makeLogger(route: string) {
  return {
    info(message: string, data?: unknown) {
      write({
        level: "info",
        route,
        message,
        timestamp: new Date().toISOString(),
        ...(data !== undefined ? { data } : {}),
      });
    },
    warn(message: string, data?: unknown) {
      write({
        level: "warn",
        route,
        message,
        timestamp: new Date().toISOString(),
        ...(data !== undefined ? { data } : {}),
      });
    },
    error(message: string, data?: unknown) {
      write({
        level: "error",
        route,
        message,
        timestamp: new Date().toISOString(),
        ...(data !== undefined ? { data } : {}),
      });
    },
  };
}
