/**
 * Shared request/response types for the GetYouTubeTranscript API.
 * Mirrors https://getyoutubetranscript.com/openapi.json
 */

/** Standard error body returned by the API on any non-2xx response. */
export interface ApiErrorBody {
  success: false;
  code: string;
  message: string;
  /** Present on 402 responses. */
  creditsLeft?: number;
  topupCreditsLeft?: number;
  /** Present on 429 responses. */
  requestsThisMinute?: number;
  [key: string]: unknown;
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

// ---------------------------------------------------------------------------
// GET /transcript
// ---------------------------------------------------------------------------

export interface GetTranscriptParams {
  /** YouTube video URL (full or short) or an 11-character video ID. */
  v: string;
  /** Caption language code, e.g. 'en', 'es'. Defaults to 'en'. */
  language?: string;
  /**
   * Also return per-line timing as `segments`. Same 1 credit. The query
   * param is only sent when this is `true`.
   */
  timestamps?: boolean;
}

/** One caption line with its timing, returned in `segments` when `timestamps: true`. */
export interface Segment {
  /** Start time in seconds. */
  start: number;
  /** Duration in seconds. */
  duration: number;
  text: string;
}

/** `manual` = uploaded by the creator, `auto` = YouTube speech recognition, `null` = unknown (older transcripts). */
export type CaptionType = "manual" | "auto" | null;

/** Fields shared by a transcript and a succeeded batch item. */
export interface TranscriptFields {
  video_id: string;
  /** The caption track actually returned. */
  language_code: string;
  /** What was asked for. Differs from `language_code` when YouTube didn't have that language. */
  requested_language: string;
  caption_type: CaptionType;
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  transcript: string;
  word_count: number;
  /** ISO 8601 time the transcript was fetched from YouTube. */
  fetched_at: string | null;
  /** Per-line timing. Present only when the request set `timestamps: true`. */
  segments?: Segment[];
}

export interface TranscriptData extends TranscriptFields {
  /** `true` when served from the stored copy rather than fetched from YouTube just now. */
  cached: boolean;
}

// ---------------------------------------------------------------------------
// GET /transcript/languages (free)
// ---------------------------------------------------------------------------

export interface GetTranscriptLanguagesParams {
  /** YouTube video URL (full or short) or an 11-character video ID. */
  v: string;
}

export interface TranscriptLanguage {
  language_code: string;
  /** YouTube's display name, e.g. "English (auto-generated)". */
  name: string;
  caption_type: "manual" | "auto";
}

export interface TranscriptLanguagesData {
  video_id: string;
  /** What `getTranscript` returns with no `language`; `null` when the video has no captions. */
  default_language_code: string | null;
  /** One per language and caption type. Empty when the video has captions turned off. */
  languages: TranscriptLanguage[];
}

// ---------------------------------------------------------------------------
// POST /batch, GET /batch
// ---------------------------------------------------------------------------

export interface CreateBatchParams {
  /** 1-100 video URLs or 11-character IDs. Duplicates are fetched once. */
  videos: string[];
  /** Caption language code for every video. Defaults to 'en'. */
  language?: string;
  /** Include per-line `segments` in the results. */
  timestamps?: boolean;
  /** Public https URL (port 443) that receives a signed `batch.completed` POST. See `verifyWebhookSignature`. */
  webhookUrl?: string;
  /** Sent as the `Idempotency-Key` header: a retry with the same key returns the original batch. */
  idempotencyKey?: string;
}

export interface GetBatchParams {
  /** The `batch_id` from `createBatch`. */
  id: string;
  /** Items to skip. Defaults to 0. */
  offset?: number;
  /** Items per page, 1-50. Defaults to 20. */
  limit?: number;
}

export interface WaitForBatchOptions {
  /** Milliseconds between status checks. Defaults to 3000. */
  pollIntervalMs?: number;
  /** Give up after this many milliseconds. Defaults to 900000 (15 minutes). */
  timeoutMs?: number;
  /** Items fetched per request once complete, 1-50. Defaults to 50. */
  pageSize?: number;
}

export type BatchStatus = "queued" | "processing" | "completed";

/** One video in a batch: succeeded items carry the transcript fields, failed ones an `error_code`. */
export interface BatchItem extends Partial<TranscriptFields> {
  /** Index in the submitted `videos` list (after de-duplication). */
  position: number;
  video_id: string;
  status: "pending" | "succeeded" | "failed";
  /** `true` when this video used a credit. */
  charged: boolean;
  /** e.g. `TRANSCRIPT_DISABLED`, `VIDEO_UNAVAILABLE`, `PAYMENT_REQUIRED`. */
  error_code?: string;
}

export interface BatchData {
  batch_id: string;
  status: BatchStatus;
  language: string;
  timestamps: boolean;
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
  webhook_status: "none" | "pending" | "delivered" | "failed";
  created_at: string;
  completed_at: string | null;
  results_url: string;
  /** `createBatch` only, and only when `webhookUrl` was given. Shown once. */
  webhook_secret?: string;
  /** `createBatch`: `true` when the Idempotency-Key matched an earlier batch. */
  idempotent_replay?: boolean;
  /** `getBatch` / `waitForBatch`. */
  credits_charged?: number;
  /** `getBatch`: one page. `waitForBatch`: every item. */
  items?: BatchItem[];
  /** `getBatch`: offset of the next page, `null` on the last one. */
  next_offset?: number | null;
}

// ---------------------------------------------------------------------------
// GET /search
// ---------------------------------------------------------------------------

export interface SearchParams {
  /** Search query. Required unless `pageToken` is set. */
  q?: string;
  /** Opaque continuation token from a previous response. */
  pageToken?: string;
  /** Restrict results to one kind. Defaults to 'video'. */
  type?: "video" | "channel";
  /** Two-letter region code, e.g. 'us'. */
  country?: string;
  /** Result language hint, e.g. 'en'. */
  language?: string;
  /** Max results for this page. */
  limit?: number;
}

export interface VideoResult {
  title: string;
  videoId: string;
  channel?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ChannelResult {
  title?: string;
  channelId?: string;
  [key: string]: unknown;
}

/** @deprecated The API never returns `pagination`; use `SearchData.continuation_token`. Kept for type compatibility. */
export interface SearchPagination {
  next_page_token?: string;
  [key: string]: unknown;
}

export interface SearchData {
  query?: string;
  video_results?: VideoResult[];
  channel_results?: ChannelResult[];
  /** Pass back as `pageToken` for the next page. Missing or null when there are no more pages. */
  continuation_token?: string | null;
  /** @deprecated Never returned by the API; use `continuation_token`. */
  pagination?: SearchPagination;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// GET /resolve (free)
// ---------------------------------------------------------------------------

export interface ResolveChannelParams {
  /** Channel @handle, channel URL, or UC... id. */
  handle: string;
}

export interface ResolveChannelData {
  channel_id: string;
  title: string;
  handle: string;
  resolved_via: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// GET /playlist
// ---------------------------------------------------------------------------

export interface GetPlaylistParams {
  /** Playlist ID or URL. Required unless `continuation` is set. */
  list?: string;
  /** Opaque continuation token from a previous response. */
  continuation?: string;
}

export interface PlaylistVideo {
  position: number;
  id: string;
  title: string;
  channel?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PlaylistData {
  playlist_id: string;
  title: string;
  videos: PlaylistVideo[];
  has_more: boolean;
  continuation_token?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// GET /channel/latest (free)
// ---------------------------------------------------------------------------

export interface GetChannelLatestParams {
  /** Channel @handle, channel URL, or UC... id. */
  channel: string;
}

/**
 * Field set is passed through from upstream and may grow over time -
 * treat as loosely typed, per the API's own OpenAPI spec.
 */
export type ChannelLatestData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// GET /channel/search
// ---------------------------------------------------------------------------

export interface SearchChannelParams {
  /** Channel @handle, URL, or UC... id. Required unless `continuation` is set. */
  channel?: string;
  /** Query to search within the channel. Required unless `continuation` is set. */
  q?: string;
  /** Opaque continuation token from a previous response. */
  continuation?: string;
}

export interface ChannelVideo {
  id: string;
  title: string;
  length?: string;
  published_time?: string;
  thumbnail?: string;
  [key: string]: unknown;
}

export interface ChannelVideosData {
  videos: ChannelVideo[];
  has_more: boolean;
  continuation_token?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// GET /channel/videos
// ---------------------------------------------------------------------------

export interface ListChannelVideosParams {
  /** Channel @handle, URL, or UC... id. Required unless `continuation` is set. */
  channel?: string;
  /** Opaque continuation token from a previous response. */
  continuation?: string;
}

// ---------------------------------------------------------------------------
// GET /credits (free)
// ---------------------------------------------------------------------------

export interface CreditsData {
  plan_credits_left: number;
  topup_credits_left: number;
  plan: "free" | "monthly" | "yearly";
  rate_limit_per_minute: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// POST /signup, POST /signup/verify (free, no key required)
// ---------------------------------------------------------------------------

export interface SignupResponse {
  success: true;
  message: string;
}

export interface VerifySignupResponse {
  success: true;
  api_key: string;
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface GetYouTubeTranscriptOptions {
  /** Your API key, e.g. `sk_live_...`. Get one free at https://getyoutubetranscript.com */
  apiKey: string;
  /** Override the API base URL. Defaults to `https://getyoutubetranscript.com/api/v1`. */
  baseUrl?: string;
  /** Override the fetch implementation (mainly for testing). Defaults to global `fetch`. */
  fetch?: typeof fetch;
}
