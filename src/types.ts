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

export interface TranscriptData {
  video_id: string;
  language_code: string;
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  transcript: string;
  word_count: number;
  /** Per-line timing. Present only when the request set `timestamps: true`. */
  segments?: Segment[];
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
