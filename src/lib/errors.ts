// Centralised error formatting. Every catch site in the app should pass the
// raw thrown value through `formatError` rather than coercing with String(e)
// — that's what surfaces our backend error codes (e.g. RCON-001) so the
// user can hand them back to us in a bug report.

import type { AppErrorWire } from "@/types/models";

/**
 * Returns true if the value matches the wire shape Tauri uses to deliver
 * a backend AppError back to the frontend. We're defensive here: anything
 * thrown inside the JS bridge (e.g. a TypeError from a bad invoke arg)
 * arrives as a plain Error / string instead, and we need to keep handling
 * those gracefully.
 */
export function isAppError(e: unknown): e is AppErrorWire {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as AppErrorWire).code === "string" &&
    typeof (e as AppErrorWire).message === "string"
  );
}

/** "Connection timed out [RCON-001]" — the canonical user-visible string. */
export function formatError(e: unknown): string {
  if (isAppError(e)) {
    return `${e.message} [${e.code}]`;
  }
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === "string") return e;
  // Last-resort serialization. Should never fire for backend errors.
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Just the code, or null if the error didn't come from the backend. */
export function errorCode(e: unknown): string | null {
  return isAppError(e) ? e.code : null;
}

/** Just the human message, no code. */
export function errorMessage(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return formatError(e);
}
