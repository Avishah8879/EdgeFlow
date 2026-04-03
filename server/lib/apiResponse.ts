import type { Response } from "express";

/**
 * Standard API response helpers.
 * All responses follow: { success: boolean, data?: any, message?: string, error?: string }
 */

export function sendSuccess(
  res: Response,
  data: unknown,
  message?: string,
  statusCode = 200,
): Response {
  return res.status(statusCode).json({ success: true, data, message });
}

export function sendError(
  res: Response,
  message: string,
  error?: string,
  statusCode = 500,
): Response {
  return res.status(statusCode).json({ success: false, message, error });
}

export function sendDataUnavailable(
  res: Response,
  message = "Data unavailable",
  retryAfterSeconds = 60,
): Response {
  return res
    .status(503)
    .set("Retry-After", String(retryAfterSeconds))
    .json({ success: false, message, error: "SERVICE_UNAVAILABLE" });
}
