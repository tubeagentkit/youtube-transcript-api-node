/**
 * Verify batch-completion webhooks sent by the GetYouTubeTranscript API.
 *
 * Each delivery carries an `X-GYT-Signature: t=<unix seconds>,v1=<hex>`
 * header, where `v1` is the HMAC-SHA256 of `"<t>.<raw request body>"` keyed
 * with the `webhook_secret` that `createBatch` returned.
 *
 * Uses Web Crypto, so it also runs on edge runtimes; on Node 18, where the
 * global isn't enabled by default, it falls back to `node:crypto`'s copy.
 */

export interface VerifyWebhookOptions {
  /** Reject signatures older (or newer) than this many seconds, to limit replays. 0 skips the check. Defaults to 300. */
  toleranceSeconds?: number;
  /** Current Unix time in seconds, for tests. Defaults to now. */
  now?: number;
}

async function subtleCrypto(): Promise<SubtleCrypto> {
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle;
  // Node 18 without --experimental-global-webcrypto. The specifier is kept out of the
  // type graph so the package doesn't need @types/node to build.
  const nodeCryptoSpecifier = "node:crypto";
  const nodeCrypto = (await import(/* @vite-ignore */ nodeCryptoSpecifier)) as { webcrypto: { subtle: SubtleCrypto } };
  return nodeCrypto.webcrypto.subtle;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compares in time independent of where the strings first differ. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Resolves to `true` if a webhook delivery is genuine and recent.
 *
 * @param body The raw request body exactly as received (e.g. `await request.text()`).
 *   Don't re-serialize parsed JSON: any whitespace change breaks the signature.
 * @param signatureHeader The `X-GYT-Signature` header value.
 * @param secret The batch's `webhook_secret` (`whsec_...`).
 */
export async function verifyWebhookSignature(
  body: string | Uint8Array,
  signatureHeader: string | null | undefined,
  secret: string,
  options: VerifyWebhookOptions = {},
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const parts = new Map(
    signatureHeader.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index), part.slice(index + 1)] as const;
    }),
  );
  const timestamp = parts.get("t") ?? "";
  const signature = parts.get("v1") ?? "";
  if (!/^\d+$/.test(timestamp) || !signature) return false;

  const { toleranceSeconds = 300, now = Date.now() / 1000 } = options;
  if (toleranceSeconds && Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const rawBody = typeof body === "string" ? encoder.encode(body) : body;
  const signed = new Uint8Array(timestamp.length + 1 + rawBody.length);
  signed.set(encoder.encode(`${timestamp}.`));
  signed.set(rawBody, timestamp.length + 1);

  const subtle = await subtleCrypto();
  const key = await subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toHex(await subtle.sign("HMAC", key, signed));
  return constantTimeEqual(expected, signature);
}
