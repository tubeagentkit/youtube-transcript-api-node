/**
 * Live integration tests against the real GetYouTubeTranscript API.
 *
 * These make real network calls and spend real credits, so they are
 * skipped by default. Run them explicitly with:
 *
 *   GYT_API_KEY=sk_live_... npm run test:live
 *
 * Prefers the two free endpoints (`resolveChannel`, `getChannelLatest`)
 * so repeated runs don't burn credits. Paid endpoints are each hit once,
 * only when explicitly opted into via GYT_RUN_PAID_TESTS=1, to respect
 * shared credit budgets in CI or shared test keys.
 */
import { describe, expect, it } from "vitest";
import { GetYouTubeTranscript } from "../src/index.js";

const apiKey = process.env.GYT_API_KEY;
const runPaid = process.env.GYT_RUN_PAID_TESTS === "1";

describe.skipIf(!apiKey)("live integration", () => {
  const client = new GetYouTubeTranscript({ apiKey: apiKey ?? "" });

  it("resolveChannel resolves a well-known handle (free)", async () => {
    const data = await client.resolveChannel({ handle: "@mkbhd" });
    expect(data.channel_id).toMatch(/^UC/);
    expect(typeof data.title).toBe("string");
  });

  it(
    "getChannelLatest returns channel metadata (free)",
    async () => {
      const data = await client.getChannelLatest({ channel: "@mkbhd" });
      expect(data).toBeTruthy();
      expect(typeof data).toBe("object");
    },
    20_000,
  );

  it("getCredits returns the key's plan and balance (free)", async () => {
    const data = await client.getCredits();
    expect(typeof data.plan_credits_left).toBe("number");
    expect(typeof data.rate_limit_per_minute).toBe("number");
    expect(["free", "monthly", "yearly"]).toContain(data.plan);
  });

  it.skipIf(!runPaid)(
    "getTranscript returns a transcript for a known video (1 credit)",
    async () => {
      const data = await client.getTranscript({ v: "jNQXAC9IVRw" });
      expect(data.video_id).toBe("jNQXAC9IVRw");
      expect(data.transcript.length).toBeGreaterThan(0);
    },
    20_000,
  );

  it.skipIf(!runPaid)(
    "search finds video results for a query (1 credit)",
    async () => {
      const data = await client.search({ q: "lofi beats" });
      expect(Array.isArray(data.video_results)).toBe(true);
    },
    20_000,
  );
});
