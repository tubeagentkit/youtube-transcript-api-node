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

  it("getTranscriptLanguages lists caption languages (free)", async () => {
    const data = await client.getTranscriptLanguages({ v: "jNQXAC9IVRw" });
    expect(data.languages.length).toBeGreaterThan(0);
    expect(data.languages.map((lang) => lang.language_code)).toContain(data.default_language_code);
  }, 20_000);

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
      expect(data.requested_language).toBe("en");
      expect(["manual", "auto", null]).toContain(data.caption_type);
      expect(typeof data.cached).toBe("boolean");
      expect(data.fetched_at).toBeTruthy();
    },
    20_000,
  );

  it.skipIf(!runPaid)(
    "batch charges only the video that succeeds (1 credit)",
    async () => {
      const created = await client.createBatch({ videos: ["jNQXAC9IVRw", "aaaaaaaaaaa"] });
      expect(created.total).toBe(2);

      const done = await client.waitForBatch(created.batch_id, { pollIntervalMs: 2000, timeoutMs: 120_000 });
      const byVideo = Object.fromEntries((done.items ?? []).map((item) => [item.video_id, item]));
      expect(byVideo.jNQXAC9IVRw.status).toBe("succeeded");
      expect(byVideo.jNQXAC9IVRw.transcript).toBeTruthy();
      expect(byVideo.aaaaaaaaaaa.status).toBe("failed");
      expect(byVideo.aaaaaaaaaaa.charged).toBe(false);
      expect(done.credits_charged).toBe(1);
    },
    150_000,
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
