import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GetYouTubeTranscript,
  GetYouTubeTranscriptError,
  signup,
  verifySignup,
} from "../src/index.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GetYouTubeTranscript constructor", () => {
  it("throws if apiKey is missing", () => {
    // @ts-expect-error - intentionally omitting required field
    expect(() => new GetYouTubeTranscript({})).toThrow(/apiKey/);
  });

  it("throws if apiKey is an empty string", () => {
    expect(() => new GetYouTubeTranscript({ apiKey: "" })).toThrow(/apiKey/);
  });
});

describe("GetYouTubeTranscript request construction", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: GetYouTubeTranscript;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new GetYouTubeTranscript({ apiKey: "sk_live_test123", fetch: fetchMock as unknown as typeof fetch });
  });

  it("sends the Authorization bearer header", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: { channel_id: "UC1", title: "T", handle: "@t", resolved_via: "scrape" } }),
    );
    await client.resolveChannel({ handle: "@mkbhd" });

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_test123");
  });

  it("builds the correct URL and query string for getTranscript", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: {
          video_id: "jNQXAC9IVRw",
          language_code: "en",
          title: "Me at the zoo",
          author_name: "jawed",
          author_url: "https://www.youtube.com/channel/UC4",
          thumbnail_url: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
          transcript: "All right...",
          word_count: 2,
        },
      }),
    );

    const result = await client.getTranscript({ v: "jNQXAC9IVRw", language: "es" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://getyoutubetranscript.com/api/v1/transcript?v=jNQXAC9IVRw&language=es");
    expect(init.method).toBe("GET");
    expect(result.video_id).toBe("jNQXAC9IVRw");
    expect(result.word_count).toBe(2);
  });

  it("omits undefined optional query params instead of sending 'undefined'", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: { video_id: "x", language_code: "en", title: "t", author_name: "a", author_url: "u", thumbnail_url: "th", transcript: "tr", word_count: 1 } }),
    );

    await client.getTranscript({ v: "abc123" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://getyoutubetranscript.com/api/v1/transcript?v=abc123");
  });

  it("sends timestamps=true and returns segments when requested", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: {
          video_id: "5e37ZT3SQbk",
          language_code: "en",
          title: "t",
          author_name: "a",
          author_url: "u",
          thumbnail_url: "th",
          transcript: "So, Reed, education",
          word_count: 3,
          segments: [{ start: 3.96, duration: 4.56, text: "So, Reed, education" }],
        },
      }),
    );

    const result = await client.getTranscript({ v: "5e37ZT3SQbk", language: "en", timestamps: true });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://getyoutubetranscript.com/api/v1/transcript?v=5e37ZT3SQbk&language=en&timestamps=true");
    expect(result.segments).toEqual([{ start: 3.96, duration: 4.56, text: "So, Reed, education" }]);
  });

  it("does not send timestamps when false or omitted, and segments is absent", async () => {
    const body = { success: true, data: { video_id: "x", language_code: "en", title: "t", author_name: "a", author_url: "u", thumbnail_url: "th", transcript: "tr", word_count: 1 } };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, body)).mockResolvedValueOnce(jsonResponse(200, body));

    const result = await client.getTranscript({ v: "abc123", timestamps: false });
    await client.getTranscript({ v: "abc123" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://getyoutubetranscript.com/api/v1/transcript?v=abc123");
    expect(fetchMock.mock.calls[1][0]).toBe("https://getyoutubetranscript.com/api/v1/transcript?v=abc123");
    expect(result.segments).toBeUndefined();
  });

  it("maps pageToken to page_token for search()", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, data: { query: "lofi", video_results: [], pagination: {} } }),
    );

    await client.search({ pageToken: "CBkS...", type: "video", limit: 10 });

    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get("page_token")).toBe("CBkS...");
    expect(parsed.searchParams.get("type")).toBe("video");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(parsed.searchParams.has("q")).toBe(false);
  });

  it("builds correct URLs for playlist, channel/latest, channel/search, channel/videos", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { success: true, data: {} }));

    await client.getPlaylist({ list: "PL123" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://getyoutubetranscript.com/api/v1/playlist?list=PL123");

    await client.getChannelLatest({ channel: "@mkbhd" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://getyoutubetranscript.com/api/v1/channel/latest?channel=%40mkbhd");

    await client.searchChannel({ channel: "@mkbhd", q: "iphone" });
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://getyoutubetranscript.com/api/v1/channel/search?channel=%40mkbhd&q=iphone",
    );

    await client.listChannelVideos({ channel: "@mkbhd" });
    expect(fetchMock.mock.calls[3][0]).toBe(
      "https://getyoutubetranscript.com/api/v1/channel/videos?channel=%40mkbhd",
    );
  });

  it("builds the correct URL for getCredits with no query params", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: { plan_credits_left: 87, topup_credits_left: 0, plan: "monthly", rate_limit_per_minute: 200 },
      }),
    );

    const result = await client.getCredits();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://getyoutubetranscript.com/api/v1/credits");
    expect(init.method).toBe("GET");
    expect(result.plan).toBe("monthly");
    expect(result.plan_credits_left).toBe(87);
  });

  it("honors a custom baseUrl", async () => {
    const localClient = new GetYouTubeTranscript({
      apiKey: "sk_live_test123",
      baseUrl: "http://localhost:3000/api/v1/",
      fetch: fetchMock as unknown as typeof fetch,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, data: {} }));

    await localClient.getChannelLatest({ channel: "@mkbhd" });

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/api/v1/channel/latest?channel=%40mkbhd");
  });
});

describe("GetYouTubeTranscript error handling", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: GetYouTubeTranscript;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new GetYouTubeTranscript({ apiKey: "sk_live_test123", fetch: fetchMock as unknown as typeof fetch });
  });

  it("throws GetYouTubeTranscriptError with code/message/statusCode on 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        success: false,
        code: "INVALID_API_KEY",
        message: "This API key is invalid or has been revoked.",
      }),
    );

    await expect(client.getTranscript({ v: "x" })).rejects.toMatchObject({
      name: "GetYouTubeTranscriptError",
      code: "INVALID_API_KEY",
      statusCode: 401,
      message: "This API key is invalid or has been revoked.",
    });
  });

  it("is a real instanceof GetYouTubeTranscriptError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { success: false, code: "MISSING_URL", message: "Provide v." }),
    );

    try {
      await client.getTranscript({ v: "" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GetYouTubeTranscriptError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it("captures creditsLeft/topupCreditsLeft on 402", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(402, {
        success: false,
        code: "PAYMENT_REQUIRED",
        message: "You have used all your credits.",
        creditsLeft: 0,
        topupCreditsLeft: 0,
      }),
    );

    await expect(client.getTranscript({ v: "x" })).rejects.toMatchObject({
      code: "PAYMENT_REQUIRED",
      statusCode: 402,
      creditsLeft: 0,
      topupCreditsLeft: 0,
    });
  });

  it("captures requestsThisMinute on 429", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, {
        success: false,
        code: "RATE_LIMITED",
        message: "Rate limit exceeded for your plan tier.",
        requestsThisMinute: 61,
      }),
    );

    await expect(client.search({ q: "x" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      statusCode: 429,
      requestsThisMinute: 61,
    });
  });

  it("falls back gracefully when the error body isn't valid JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
    );

    await expect(client.getTranscript({ v: "x" })).rejects.toMatchObject({
      code: "UNKNOWN_ERROR",
      statusCode: 502,
    });
  });

  it("wraps a network-level fetch rejection", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(client.getTranscript({ v: "x" })).rejects.toMatchObject({
      name: "GetYouTubeTranscriptError",
      statusCode: 0,
    });
  });
});

describe("signup / verifySignup standalone helpers", () => {
  it("signup() posts email with no auth header", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, { success: true, message: "A 6-digit code was sent to this email." }),
    );

    const result = await signup("dev@example.com", { fetch: fetchMock as unknown as typeof fetch });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://getyoutubetranscript.com/api/v1/signup");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(init.body as string)).toEqual({ email: "dev@example.com" });
    expect(result.message).toContain("6-digit code");
  });

  it("verifySignup() posts email + otp and returns api_key", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, { success: true, api_key: "sk_live_abc123" }),
    );

    const result = await verifySignup("dev@example.com", "123456", {
      fetch: fetchMock as unknown as typeof fetch,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://getyoutubetranscript.com/api/v1/signup/verify");
    expect(JSON.parse(init.body as string)).toEqual({ email: "dev@example.com", otp: "123456" });
    expect(result.api_key).toBe("sk_live_abc123");
  });

  it("throws GetYouTubeTranscriptError when the OTP is wrong", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(400, { success: false, code: "INVALID_OTP", message: "Incorrect or expired code." }),
    );

    await expect(
      verifySignup("dev@example.com", "000000", { fetch: fetchMock as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "INVALID_OTP", statusCode: 400 });
  });
});
