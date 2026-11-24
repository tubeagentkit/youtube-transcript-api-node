import { GetYouTubeTranscriptError } from "./errors.js";
import type {
  ApiErrorBody,
  ApiSuccessBody,
  BatchData,
  BatchItem,
  ChannelBannerData,
  ChannelLatestData,
  ChannelPageParams,
  ChannelPlaylistsData,
  ChannelPostsData,
  CreateBatchParams,
  GetBatchParams,
  WaitForBatchOptions,
  WaitForTranscriptOptions,
  ChannelVideosData,
  CreditsData,
  GetChannelBannerParams,
  GetChannelLatestParams,
  GetPlaylistParams,
  GetRelatedVideosParams,
  GetTranscriptJobParams,
  GetTranscriptLanguagesParams,
  GetTranscriptParams,
  GetVideoCommentsParams,
  GetVideoDetailsParams,
  GetVideoDislikesParams,
  GetYouTubeTranscriptOptions,
  ListChannelPlaylistsParams,
  ListChannelPostsParams,
  ListChannelVideosParams,
  PlaylistData,
  RelatedVideosData,
  ResolveChannelData,
  ResolveChannelParams,
  SearchChannelParams,
  SearchData,
  SearchParams,
  SignupResponse,
  TranscriptData,
  TranscriptJob,
  TranscriptJobResponse,
  TranscriptLanguagesData,
  TranscriptResponse,
  VerifySignupResponse,
  VideoCommentsData,
  VideoDetailsData,
  VideoDislikesData,
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
  const { body } = await send(fetchImpl, url, init);
  const parsed = body as ApiSuccessBody<T> | T;
  if (parsed && typeof parsed === "object" && "data" in parsed) {
    return (parsed as ApiSuccessBody<T>).data;
  }
  return parsed as T;
}

/** Like `request`, but returns the whole parsed body and the response (for 202s and headers). */
async function send(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<{ response: Response; body: unknown }> {
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

  return { response, body: (await response.json()) as unknown };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    return request<T>(this.fetchImpl, url, this.getInit());
  }

  /** A GET that keeps the whole body and the response, for endpoints that can answer 202. */
  private getRaw(path: string, query: Record<string, QueryValue>): Promise<{ response: Response; body: unknown }> {
    return send(this.fetchImpl, `${this.baseUrl}${path}${buildQuery(query)}`, this.getInit());
  }

  private getInit(): RequestInit {
    return {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    };
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
   *
   * `mode: 'auto'` (captions if any, otherwise AI) or `mode: 'generate'`
   * (always AI) gives an AI speech-to-text transcript for videos without
   * captions, at 3 credits per minute of video (minimum 3). If it is still
   * being made, this polls the job (free) until it is done, up to
   * `options.timeoutMs`. Use `startTranscript` to get the job back instead
   * of waiting.
   */
  async getTranscript(params: GetTranscriptParams, options: WaitForTranscriptOptions = {}): Promise<TranscriptData> {
    const { data, job } = await this.startTranscript(params);
    if (data) return data;
    if (!job) {
      throw new GetYouTubeTranscriptError(0, undefined, "GetYouTubeTranscript.getTranscript: answer had no transcript and no job");
    }
    return this.waitForTranscript(job, { ...options, timestamps: params.timestamps });
  }

  /**
   * One GET /transcript call without waiting. `data` is the transcript, or
   * `null` with a `job` to poll (`getTranscriptJob` / `waitForTranscript`)
   * when an AI transcript is still being made. `creditsCharged` is what
   * the call cost (X-Credits-Charged header).
   */
  async startTranscript(params: GetTranscriptParams): Promise<TranscriptResponse> {
    const { response, body } = await this.getRaw("/transcript", {
      v: params.v,
      language: params.language,
      timestamps: params.timestamps ? true : undefined,
      mode: params.mode,
    });
    const parsed = body as { data?: TranscriptData | null; job?: TranscriptJob };
    const result: TranscriptResponse = { data: parsed.data ?? null };
    if (parsed.job) result.job = parsed.job;
    const charged = response.headers.get("X-Credits-Charged");
    if (charged !== null && charged !== "" && Number.isFinite(Number(charged))) {
      result.creditsCharged = Number(charged);
    }
    return result;
  }

  /**
   * Status or result of an AI transcript job. Free. `data` is `null` while
   * the job is queued or running. A failed job throws its error (e.g.
   * `AI_FAILED`, `AUDIO_UNAVAILABLE`); its credits are refunded.
   */
  async getTranscriptJob(params: GetTranscriptJobParams): Promise<TranscriptJobResponse> {
    const { body } = await this.getRaw("/transcript/jobs", {
      id: params.id,
      timestamps: params.timestamps ? true : undefined,
    });
    const parsed = body as { data?: TranscriptData | null; job: TranscriptJob };
    return { data: parsed.data ?? null, job: parsed.job };
  }

  /**
   * Poll an AI transcript job until it is done and return the transcript.
   * Free. Accepts the job from `startTranscript` or its `job_id`. Throws the
   * job's error if it fails, or an Error after `timeoutMs` (the job keeps
   * running and can be polled again later).
   */
  async waitForTranscript(
    job: TranscriptJob | string,
    options: WaitForTranscriptOptions & { timestamps?: boolean } = {},
  ): Promise<TranscriptData> {
    const id = typeof job === "string" ? job : job.job_id;
    const serverInterval = typeof job === "string" ? undefined : job.poll_interval_seconds;
    const { timeoutMs = 1_800_000, timestamps } = options;
    let pollIntervalMs = options.pollIntervalMs ?? (serverInterval ?? 5) * 1000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const { data, job: current } = await this.getTranscriptJob({ id, timestamps });
      if (data) return data;
      if (current?.status === "failed") {
        throw new GetYouTubeTranscriptError(0, {
          success: false,
          code: current.error?.code ?? "AI_FAILED",
          message: current.error?.message ?? "The AI transcript could not be made. Credits are refunded.",
          job: current,
        });
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `GetYouTubeTranscript.waitForTranscript: job ${id} not done after ${timeoutMs} ms (status ${current?.status ?? "unknown"}). Poll it later with getTranscriptJob.`,
        );
      }
      if (options.pollIntervalMs === undefined && current?.poll_interval_seconds) {
        pollIntervalMs = current.poll_interval_seconds * 1000;
      }
      await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
    }
  }

  /**
   * The caption languages a video offers (manual and auto-generated), before
   * fetching one. Costs 1 credit. An empty `languages` list means captions are turned off.
   */
  getTranscriptLanguages(params: GetTranscriptLanguagesParams): Promise<TranscriptLanguagesData> {
    return this.get<TranscriptLanguagesData>("/transcript/languages", { v: params.v });
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

  /** Resolve a channel @handle, URL, or UC... id to its channel ID. Costs 1 credit. */
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

  /** Channel metadata plus its latest uploads. Costs 1 credit. */
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
   * A paged channel list. Options in `firstPageOnly` are dropped once a
   * `continuation` is given, because the token already carries them.
   */
  private getChannelPage<T>(
    path: string,
    params: ChannelPageParams,
    firstPageOnly: Record<string, QueryValue> = {},
  ): Promise<T> {
    return this.get<T>(path, {
      channel: params.channel,
      continuation: params.continuation,
      ...(params.continuation ? {} : firstPageOnly),
    });
  }

  /**
   * List a channel's uploads. Provide `channel` for a first page, or
   * `continuation` to continue. `tab` ('videos', 'shorts' or 'streams') and
   * `sort` ('latest', 'popular' or 'oldest') apply to a first page only.
   * 1 credit.
   */
  listChannelVideos(params: ListChannelVideosParams): Promise<ChannelVideosData> {
    return this.getChannelPage<ChannelVideosData>("/channel/videos", params, {
      tab: params.tab,
      sort: params.sort,
    });
  }

  /**
   * List a channel's playlists. Provide `channel` for a first page, or
   * `continuation` to continue. Pass a playlist's `id` to `getPlaylist` for
   * its videos. 1 credit.
   */
  listChannelPlaylists(params: ListChannelPlaylistsParams): Promise<ChannelPlaylistsData> {
    return this.getChannelPage<ChannelPlaylistsData>("/channel/playlists", params);
  }

  /**
   * List a channel's community posts. Provide `channel` for a first page, or
   * `continuation` to continue. 1 credit.
   */
  listChannelPosts(params: ListChannelPostsParams): Promise<ChannelPostsData> {
    return this.getChannelPage<ChannelPostsData>("/channel/posts", params);
  }

  /** A channel's banner (original, largest and every crop size) and avatar. 1 credit. */
  getChannelBanner(params: GetChannelBannerParams): Promise<ChannelBannerData> {
    return this.get<ChannelBannerData>("/channel/banner", { channel: params.channel });
  }

  /** The videos YouTube suggests next to a video. 1 credit. */
  getRelatedVideos(params: GetRelatedVideosParams): Promise<RelatedVideosData> {
    return this.get<RelatedVideosData>("/video/related", { v: params.v });
  }

  /**
   * Estimated likes and dislikes for a video. YouTube no longer publishes
   * dislikes, so the numbers are estimates (`estimated` is always `true`).
   * 1 credit.
   */
  getVideoDislikes(params: GetVideoDislikesParams): Promise<VideoDislikesData> {
    return this.get<VideoDislikesData>("/video/dislikes", { v: params.v });
  }

  /**
   * A video's details: title, description, channel, views, likes, upload
   * date, duration, thumbnails and tags. 1 credit.
   */
  getVideoDetails(params: GetVideoDetailsParams): Promise<VideoDetailsData> {
    return this.get<VideoDetailsData>("/video", { v: params.v });
  }

  /**
   * A page of a video's comments, top comments first. For the next page pass
   * the same `v` plus `continuation` (unlike the channel lists, `v` is still
   * required). A 404 `COMMENTS_DISABLED` means comments are off or the video
   * does not exist. 1 credit per page.
   */
  getVideoComments(params: GetVideoCommentsParams): Promise<VideoCommentsData> {
    return this.get<VideoCommentsData>("/video/comments", {
      v: params.v,
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
