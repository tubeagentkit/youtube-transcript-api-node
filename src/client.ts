import { GetYouTubeTranscriptError } from "./errors.js";
import type {
  ApiErrorBody,
  ApiSuccessBody,
  BatchData,
  BatchItem,
  ChannelLatestData,
  CreateBatchParams,
  GetBatchParams,
  WaitForBatchOptions,
  ChannelVideosData,
  CreditsData,
  GetChannelLatestParams,
  GetPlaylistParams,
  GetTranscriptParams,
  GetYouTubeTranscriptOptions,
  ListChannelVideosParams,
  PlaylistData,
  ResolveChannelData,
  ResolveChannelParams,
  SearchChannelParams,
  SearchData,
  SearchParams,
  SignupResponse,
  TranscriptData,
  VerifySignupResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://getyoutubetranscript.com/api/v1";

type QueryValue = string | number | boolean | undefined;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody | undefined> {
  try {
    const json = (await response.json()) as unknown;
    if (json && typeof json === "object") {
      return json as ApiErrorBody;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Low-level helper used by both the `Client` and the standalone signup
 * helpers. Not exported - construct a `Client` or call `signup`/`verifySignup`.
 */
async function request<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (cause) {
    throw new GetYouTubeTranscriptError(
      0,
      undefined,
      cause instanceof Error ? `Network error: ${cause.message}` : "Network error",
    );
  }

  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new GetYouTubeTranscriptError(response.status, body);
  }

  const parsed = (await response.json()) as ApiSuccessBody<T> | T;
  if (parsed && typeof parsed === "object" && "data" in parsed) {
    return (parsed as ApiSuccessBody<T>).data;
  }
  return parsed as T;
}

/**
 * Client for the GetYouTubeTranscript REST API.
 *
 * @example
 * ```ts
 * import { GetYouTubeTranscript } from "@tubeagentkit/getyoutubetranscript";
 *
 * const client = new GetYouTubeTranscript({ apiKey: process.env.GYT_API_KEY! });
 * const { transcript } = await client.getTranscript({ v: "jNQXAC9IVRw" });
 * ```
 */
export class GetYouTubeTranscript {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GetYouTubeTranscriptOptions) {
    if (!options?.apiKey) {
      throw new Error(
        "GetYouTubeTranscript: an `apiKey` is required. Get a free key at https://getyoutubetranscript.com",
      );
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error(
        "GetYouTubeTranscript: no `fetch` implementation found. Use Node 18+, or pass `fetch` explicitly in the options.",
      );
    }
    this.fetchImpl = fetchImpl;
  }

  private get<T>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQuery(query)}`;
    return request<T>(this.fetchImpl, url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  private post<T>(path: string, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}): Promise<T> {
    return request<T>(this.fetchImpl, `${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      // JSON.stringify drops undefined values, so unset options are omitted.
      body: JSON.stringify(body),
    });
  }

  /**
   * Full transcript for one video, plus title/author/thumbnail metadata. 1 credit.
   * Pass `timestamps: true` to also get per-line `segments` (same credit).
   */
  getTranscript(params: GetTranscriptParams): Promise<TranscriptData> {
    return this.get<TranscriptData>("/transcript", {
      v: params.v,
      language: params.language,
      timestamps: params.timestamps ? true : undefined,
    });
  }

  /**
   * Queue transcripts for up to 100 videos in one call. Free to submit:
   * 1 credit per video that returns a transcript, failed videos are never
   * charged. Follow with `waitForBatch` (or `getBatch`), or pass
   * `webhookUrl` to be notified.
   */
  createBatch(params: CreateBatchParams): Promise<BatchData> {
    if (!params?.videos?.length) {
      return Promise.reject(new Error("GetYouTubeTranscript.createBatch: `videos` must contain at least one video"));
    }
    return this.post<BatchData>(
      "/batch",
      {
        videos: params.videos,
        language: params.language,
        timestamps: params.timestamps ? true : undefined,
        webhook_url: params.webhookUrl,
      },
      params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {},
    );
  }

  /** A batch's status and one page of results, in submission order. Free. */
  getBatch(params: GetBatchParams): Promise<BatchData> {
    return this.get<BatchData>("/batch", { id: params.id, offset: params.offset, limit: params.limit });
  }

  /** Poll until a batch completes, then return it with every item. Free. */
  async waitForBatch(id: string, options: WaitForBatchOptions = {}): Promise<BatchData> {
    const { pollIntervalMs = 3000, timeoutMs = 900_000, pageSize = 50 } = options;
    const deadline = Date.now() + timeoutMs;

    let batch = await this.getBatch({ id, limit: 1 });
    while (batch.status !== "completed") {
      if (Date.now() >= deadline) {
        throw new Error(`GetYouTubeTranscript.waitForBatch: batch ${id} not completed after ${timeoutMs} ms (${batch.pending} pending)`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      batch = await this.getBatch({ id, limit: 1 });
    }

    const items: BatchItem[] = [];
    let offset: number | null | undefined = 0;
    while (offset !== null && offset !== undefined) {
      batch = await this.getBatch({ id, offset, limit: pageSize });
      items.push(...(batch.items ?? []));
      offset = batch.next_offset;
    }
    return { ...batch, items, next_offset: null };
  }

  /**
   * Search YouTube videos or channels. Provide `q` for a first page, or
   * `pageToken` (from a previous response's `continuation_token`) to
   * continue. 1 credit.
   */
  search(params: SearchParams): Promise<SearchData> {
    return this.get<SearchData>("/search", {
      q: params.q,
      page_token: params.pageToken,
      type: params.type,
      country: params.country,
      language: params.language,
      limit: params.limit,
    });
  }

  /** Resolve a channel @handle, URL, or UC... id to its channel ID. Free. */
  resolveChannel(params: ResolveChannelParams): Promise<ResolveChannelData> {
    return this.get<ResolveChannelData>("/resolve", { handle: params.handle });
  }

  /**
   * List videos in a playlist. Provide `list` for a first page, or
   * `continuation` (from a previous response) to continue. 1 credit.
   */
  getPlaylist(params: GetPlaylistParams): Promise<PlaylistData> {
    return this.get<PlaylistData>("/playlist", {
      list: params.list,
      continuation: params.continuation,
    });
  }

  /** Channel metadata plus its latest uploads. Free. */
  getChannelLatest(params: GetChannelLatestParams): Promise<ChannelLatestData> {
    return this.get<ChannelLatestData>("/channel/latest", { channel: params.channel });
  }

  /**
   * Search within a single channel. Provide `channel` + `q` for a first
   * page, or `continuation` to continue. 1 credit.
   */
  searchChannel(params: SearchChannelParams): Promise<ChannelVideosData> {
    return this.get<ChannelVideosData>("/channel/search", {
      channel: params.channel,
      q: params.q,
      continuation: params.continuation,
    });
  }

  /**
   * List all of a channel's uploads. Provide `channel` for a first page,
   * or `continuation` to continue. 1 credit.
   */
  listChannelVideos(params: ListChannelVideosParams): Promise<ChannelVideosData> {
    return this.get<ChannelVideosData>("/channel/videos", {
      channel: params.channel,
      continuation: params.continuation,
    });
  }

  /** Remaining credit balance, plan, and rate limit for this key. Free. */
  getCredits(): Promise<CreditsData> {
    return this.get<CreditsData>("/credits");
  }
}

/**
 * Request a 6-digit email OTP to start self-service signup. Free, no API
 * key required. Follow up with {@link verifySignup} to receive the key.
 */
export async function signup(
  email: string,
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
): Promise<SignupResponse> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return request<SignupResponse>(fetchImpl, `${baseUrl}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

/**
 * Verify the 6-digit OTP sent by {@link signup} and receive a new API key.
 * Free, no API key required.
 */
export async function verifySignup(
  email: string,
  otp: string,
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
): Promise<VerifySignupResponse> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return request<VerifySignupResponse>(fetchImpl, `${baseUrl}/signup/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });
}
