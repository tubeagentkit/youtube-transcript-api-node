import type { ApiErrorBody } from "./types.js";

/**
 * Thrown for any non-2xx response from the GetYouTubeTranscript API.
 * Wraps the API's `{ success: false, code, message }` error shape.
 */
export class GetYouTubeTranscriptError extends Error {
  /** Machine-readable error code, e.g. 'INVALID_API_KEY', 'RATE_LIMITED'. */
  public readonly code: string;
  /** HTTP status code of the response. */
  public readonly statusCode: number;
  /** Credits remaining, present on 402 responses. */
  public readonly creditsLeft?: number;
  /** Top-up credits remaining, present on 402 responses. */
  public readonly topupCreditsLeft?: number;
  /** Requests made in the current minute, present on 429 responses. */
  public readonly requestsThisMinute?: number;
  /** The raw parsed response body, if the body was valid JSON. */
  public readonly body?: ApiErrorBody;

  constructor(statusCode: number, body?: ApiErrorBody, fallbackMessage?: string) {
    const message = body?.message ?? fallbackMessage ?? `Request failed with status ${statusCode}`;
    super(message);
    this.name = "GetYouTubeTranscriptError";
    this.statusCode = statusCode;
    this.code = body?.code ?? "UNKNOWN_ERROR";
    this.creditsLeft = body?.creditsLeft;
    this.topupCreditsLeft = body?.topupCreditsLeft;
    this.requestsThisMinute = body?.requestsThisMinute;
    this.body = body;

    // Maintain proper prototype chain for `instanceof` checks after transpilation.
    Object.setPrototypeOf(this, GetYouTubeTranscriptError.prototype);
  }
}
