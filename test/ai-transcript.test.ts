import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetYouTubeTranscript, GetYouTubeTranscriptError } from "../src/index.js";

const BASE = "https://getyoutubetranscript.com/api/v1";
const JOB_ID = "6f1c2b0e-8a4d-4c1e-9b7a-2d3e4f5a6b7c";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function job(status: string, extra: Record<string, unknown> = {}) {
  return {
    job_id: JOB_ID,
    status,
    video_id: "jNQXAC9IVRw",
    credits_charged: 3,
    poll_url: `/api/v1/transcript/jobs?id=${JOB_ID}`,
    poll_interval_seconds: 5,
    created_at: "2026-09-20T03:10:58.938Z",
    ...extra,
  };
}

const aiData = {
  video_id: "jNQXAC9IVRw",
  language_code: "en",
  requested_language: "en",
  caption_type: "ai",
  title: "Me at the zoo",
  author_name: "jawed",
  author_url: "u",
  thumbnail_url: "th",
  transcript: "All right, so here we are",
  word_count: 6,
  fetched_at: "2026-09-20T03:10:58.938Z",
  source: "ai",
  duration_seconds: 19,
};

describe("AI transcripts", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: GetYouTubeTranscript;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new GetYouTubeTranscript({ apiKey: "sk_live_test123", fetch: fetchMock as unknown as typeof fetch });
  });

  it("sends mode and returns an AI transcript answered with 200", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: aiData }, { "X-Credits-Charged": "3" }));

    const result = await client.getTranscript({ v: "jNQXAC9IVRw", mode: "generate" });

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/transcript?v=jNQXAC9IVRw&mode=generate`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.caption_type).toBe("ai");
    expect(result.source).toBe("ai");
    expect(result.duration_seconds).toBe(19);
  });

  it("does not send mode when omitted", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: aiData }));
    await client.getTranscript({ v: "jNQXAC9IVRw" });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/transcript?v=jNQXAC9IVRw`);
  });

  it("startTranscript returns the 202 job and the credits charged without polling", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { success: true, data: null, job: job("running") }, { "X-Credits-Charged": "12" }));

    const result = await client.startTranscript({ v: "jNQXAC9IVRw", mode: "auto" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/transcript?v=jNQXAC9IVRw&mode=auto`);
    expect(result.data).toBeNull();
    expect(result.job?.job_id).toBe(JOB_ID);
    expect(result.creditsCharged).toBe(12);
  });

  it("startTranscript leaves creditsCharged unset when the header is missing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: aiData }));
    const result = await client.startTranscript({ v: "jNQXAC9IVRw" });
    expect(result.creditsCharged).toBeUndefined();
    expect(result.job).toBeUndefined();
    expect(result.data?.transcript).toBe("All right, so here we are");
  });

  it("getTranscript polls the job after a 202 until it is done, passing timestamps", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(202, { success: true, data: null, job: job("queued") }))
      .mockResolvedValueOnce(jsonResponse(202, { success: true, data: null, job: job("running") }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { ...aiData, segments: [] }, job: job("done") }));

    const result = await client.getTranscript({ v: "jNQXAC9IVRw", mode: "generate", timestamps: true }, { pollIntervalMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/transcript?v=jNQXAC9IVRw&timestamps=true&mode=generate`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/transcript/jobs?id=${JOB_ID}&timestamps=true`);
    expect(result.segments).toEqual([]);
    expect(result.source).toBe("ai");
  });

  it("getTranscriptJob returns null data while running and sends the auth header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { success: true, data: null, job: job("running") }));

    const result = await client.getTranscriptJob({ id: JOB_ID });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/transcript/jobs?id=${JOB_ID}`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_test123");
    expect(result.data).toBeNull();
    expect(result.job.status).toBe("running");
  });

  it("waitForTranscript throws the job's error when it fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(502, { success: false, code: "AI_FAILED", message: "Could not make the transcript.", job: job("failed") }),
    );

    const err = await client.waitForTranscript(JOB_ID, { pollIntervalMs: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GetYouTubeTranscriptError);
    expect((err as GetYouTubeTranscriptError).code).toBe("AI_FAILED");
    expect((err as GetYouTubeTranscriptError).statusCode).toBe(502);
  });

  it("waitForTranscript throws when a polled job reports status failed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(202, { success: true, data: null, job: job("failed", { error: { code: "AUDIO_UNAVAILABLE", message: "No audio." } }) }),
    );
    await expect(client.waitForTranscript(JOB_ID, { pollIntervalMs: 0 })).rejects.toMatchObject({ code: "AUDIO_UNAVAILABLE" });
  });

  it("waitForTranscript times out with the job id in the message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { success: true, data: null, job: job("running") }));
    await expect(client.waitForTranscript(JOB_ID, { pollIntervalMs: 0, timeoutMs: 0 })).rejects.toThrow(new RegExp(JOB_ID));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exposes credits_required on a 402 for an AI transcript", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(402, { success: false, code: "PAYMENT_REQUIRED", message: "You have used all your credits.", credits_required: 12 }),
    );
    const err = await client.getTranscript({ v: "dQw4w9WgXcQ", mode: "generate" }).catch((e: unknown) => e);
    expect((err as GetYouTubeTranscriptError).code).toBe("PAYMENT_REQUIRED");
    expect((err as GetYouTubeTranscriptError).creditsRequired).toBe(12);
  });

  it("surfaces JOB_NOT_FOUND from getTranscriptJob", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { success: false, code: "JOB_NOT_FOUND", message: "No AI transcript job with this id." }));
    await expect(client.getTranscriptJob({ id: JOB_ID })).rejects.toMatchObject({ code: "JOB_NOT_FOUND", statusCode: 404 });
  });
});
