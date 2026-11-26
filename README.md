# YouTube Transcript API: Node.js / TypeScript SDK

[![License](https://img.shields.io/badge/License-MIT-4CAF50?style=for-the-badge)](./LICENSE)
[![Website](https://img.shields.io/badge/Website-getyoutubetranscript.com-FF3B00?style=for-the-badge)](https://getyoutubetranscript.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-typed-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)

The official Node.js / TypeScript SDK (`@tubeagentkit/getyoutubetranscript`) for the [GetYouTubeTranscript](https://getyoutubetranscript.com) YouTube Transcript API. Get YouTube video transcripts, captions and subtitles (optionally with per-line timestamps) in JavaScript without a Google API key, yt-dlp, or a headless browser, plus YouTube search, channel, and playlist data over a simple REST API.

- Fully typed, Promise-based client
- Zero dependencies - built on native `fetch` (Node 18+)
- ESM and CommonJS builds, with `.d.ts` types included
- Typed errors: every failed request throws a `GetYouTubeTranscriptError` with a `code`, `message`, and `statusCode`

[![npm](https://img.shields.io/npm/v/%40tubeagentkit%2Fgetyoutubetranscript)](https://www.npmjs.com/package/@tubeagentkit/getyoutubetranscript)

```bash
npm install @tubeagentkit/getyoutubetranscript
```

Works the same on a laptop, a VPS, a serverless function or a CI job: the API fetches transcripts on its own servers, so YouTube never sees (or blocks) your server's IP and there are no proxies to manage.

## Quickstart

```ts
import { GetYouTubeTranscript } from "@tubeagentkit/getyoutubetranscript";

const client = new GetYouTubeTranscript({ apiKey: process.env.GYT_API_KEY! });

const { title, transcript, word_count } = await client.getTranscript({
  v: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
});

console.log(title, word_count, transcript.slice(0, 200));
```

### Timestamps

Pass `timestamps: true` to also get one entry per caption line in `segments` (same 1 credit). Without it, the response has no `segments` key.

```ts
const { transcript, segments } = await client.getTranscript({
  v: "5e37ZT3SQbk",
  timestamps: true,
});

console.log(segments?.[0]); // { start: 3.96, duration: 4.56, text: "So, Reed, education, which a lot of" }
```

Each segment is `{ start, duration, text }` with `start` and `duration` in seconds (exported as the `Segment` type).

### Where a transcript came from

| Field | Meaning |
| --- | --- |
| `language_code` | The caption track actually returned |
| `requested_language` | What you asked for. If it differs from `language_code`, YouTube didn't have that language |
| `caption_type` | `"manual"` (uploaded by the creator), `"auto"` (YouTube speech recognition), `"ai"` (an AI transcript, see below), or `null` if unknown |
| `cached` | `true` when served from the stored copy rather than fetched from YouTube just now. Absent on AI transcripts |
| `fetched_at` | ISO 8601 time it was fetched from YouTube |

Not sure which languages a video has? `getTranscriptLanguages` lists them (1 credit per call) before you fetch a transcript:

```ts
const { default_language_code, languages } = await client.getTranscriptLanguages({ v: "kJQP7kiw5Fk" });
for (const lang of languages) console.log(lang.language_code, lang.caption_type, lang.name); // "es manual Spanish"
```

An empty `languages` list means the video has captions turned off.

### AI transcripts for videos without captions

Pass `mode` to get an AI speech-to-text transcript when a video has no captions:

- `"native"` (default): captions only, 1 credit.
- `"auto"`: captions if the video has any (1 credit), otherwise an AI transcript.
- `"generate"`: always an AI transcript.

An AI transcript costs 3 credits per minute of video, rounded up, minimum 3 (videos up to 4 hours). Reading your own AI transcript again within 24 hours costs 0, and credits are refunded automatically if it fails. With an AI mode, `language` is the language spoken; leave it out to use the video's own audio language.

```ts
const t = await client.getTranscript({ v: "jNQXAC9IVRw", mode: "auto" });
console.log(t.caption_type, t.source, t.duration_seconds); // "ai" "ai" 19 when the video had no captions
```

A long video can take a while. When the API answers `202` with a job, `getTranscript` polls it (free, every 5 seconds) until the transcript is ready, for up to 30 minutes by default:

```ts
const t = await client.getTranscript({ v: "dQw4w9WgXcQ", mode: "generate" }, { timeoutMs: 10 * 60_000 });
```

To handle the job yourself, use `startTranscript`. It makes one call and returns `{ data, job, creditsCharged }`: `data` is the transcript, or `null` with a `job` to poll.

```ts
const { data, job, creditsCharged } = await client.startTranscript({ v: "dQw4w9WgXcQ", mode: "generate" });
console.log("cost:", creditsCharged); // X-Credits-Charged header

if (!data && job) {
  // later, or from another process:
  const status = await client.getTranscriptJob({ id: job.job_id }); // { data: null, job: { status: "running", ... } } until done
  const transcript = await client.waitForTranscript(job.job_id); // or poll until done
}
```

A failed job throws its error (`AI_FAILED`, `AUDIO_UNAVAILABLE`); a timeout throws an `Error` naming the job id, and the job keeps running so you can poll it later. Other AI errors: `LIVE_STREAM` and `TOO_LONG` (422), `TOO_MANY_JOBS` (429, 5 already in progress), and `PAYMENT_REQUIRED` (402) with `err.creditsRequired` set to what the transcript needs.

### Batch: many videos at once

Queue up to 100 videos in one call; transcripts are fetched in the background. Submitting is free, each video that returns a transcript costs 1 credit, and failed videos are never charged (10 videos where 2 have no captions = 8 credits).

```ts
const { batch_id } = await client.createBatch({ videos: ["jNQXAC9IVRw", "https://youtu.be/dQw4w9WgXcQ"] });
const result = await client.waitForBatch(batch_id); // polls, then collects every page

for (const item of result.items ?? []) {
  if (item.status === "succeeded") console.log(item.video_id, item.caption_type, item.transcript?.slice(0, 80));
  else console.log(item.video_id, "failed:", item.error_code); // e.g. TRANSCRIPT_DISABLED
}
console.log("credits used:", result.credits_charged);
```

`getBatch({ id, offset, limit })` returns the status and one page if you'd rather poll yourself. Pass `idempotencyKey` to `createBatch` so a retried call returns the same batch instead of queuing a second one. Batches are kept for 7 days, and an account can have 5 unfinished batches at a time.

To be notified instead of polling, pass `webhookUrl` (public https). The response includes a `webhook_secret` (shown once); each delivery is signed, so check it against the raw body before trusting it:

```ts
import { verifyWebhookSignature } from "@tubeagentkit/getyoutubetranscript";

// e.g. a Next.js route handler
export async function POST(request: Request) {
  const body = await request.text(); // raw body, not re-serialized JSON
  if (!(await verifyWebhookSignature(body, request.headers.get("x-gyt-signature"), process.env.GYT_WEBHOOK_SECRET!))) {
    return new Response("invalid signature", { status: 401 });
  }
  const event = JSON.parse(body); // { event: "batch.completed", batch_id, results_url, ... }
  return new Response("ok");
}
```

## Command line

The same API from a shell: `npm install -g @tubeagentkit/cli`, then `gyt login` and `gyt transcript <url>`. It is built on this SDK; see [tubeagentkit/youtube-transcript-cli](https://github.com/tubeagentkit/youtube-transcript-cli).

## Getting an API key

Every request needs an API key. New accounts get **100 free credits, no card required** - grab one at [getyoutubetranscript.com](https://getyoutubetranscript.com).

Prefer to do it in code? Use the self-serve signup flow, which sends a 6-digit email OTP and hands back a key once verified:

```ts
import { signup, verifySignup } from "@tubeagentkit/getyoutubetranscript";

await signup("you@example.com");
// check your inbox for the 6-digit code, then:
const { api_key } = await verifySignup("you@example.com", "123456");
```

## Usage

Every method returns the parsed `data` payload directly - no need to unwrap `{ success, data }` yourself.

```ts
// Search videos or channels
const results = await client.search({ q: "lofi beats" });

// Resolve a channel handle to its channel ID (1 credit)
const { channel_id } = await client.resolveChannel({ handle: "@mkbhd" });

// List a playlist's videos
const playlist = await client.getPlaylist({ list: "PLillGF-RfqbYE6Ik_EuXA2iZFcE082B3s" });

// Channel metadata + latest uploads (1 credit)
const channel = await client.getChannelLatest({ channel: "@mkbhd" });

// Search within a channel
const channelResults = await client.searchChannel({ channel: "@mkbhd", q: "iphone" });

// List all of a channel's uploads
const uploads = await client.listChannelVideos({ channel: "@mkbhd" });

// Shorts or live streams instead, most popular first (first page only)
const topShorts = await client.listChannelVideos({ channel: "@mkbhd", tab: "shorts", sort: "popular" });

// A channel's playlists (1 credit); pass a playlist's id to getPlaylist for its videos
const { playlists } = await client.listChannelPlaylists({ channel: "@mkbhd" });

// A channel's community posts (1 credit)
const { posts } = await client.listChannelPosts({ channel: "@mkbhd" });

// A channel's banner and avatar (1 credit)
const { has_banner, banner, avatar } = await client.getChannelBanner({ channel: "@mkbhd" });
console.log(banner?.largest);

// Videos YouTube suggests next to a video (1 credit)
const { related } = await client.getRelatedVideos({ v: "dQw4w9WgXcQ" });

// Estimated likes and dislikes (1 credit)
const { likes, dislikes, estimated } = await client.getVideoDislikes({ v: "dQw4w9WgXcQ" });

// A video's details: title, description, channel, views, likes, duration, tags (1 credit)
const video = await client.getVideoDetails({ v: "dQw4w9WgXcQ" });
console.log(video.title, video.views, video.duration_formatted);

// A page of a video's comments, top comments first (1 credit per page)
const { comments, has_more, continuation_token } = await client.getVideoComments({ v: "dQw4w9WgXcQ" });

// A TikTok video's captions with start times: URL, vm.tiktok.com short link, or numeric ID (1 credit)
const tiktok = await client.getTikTokTranscript({ url: "https://www.tiktok.com/@thedailybugleofficial/video/7039900146041343278" });
console.log(tiktok.author, tiktok.language, tiktok.segments[0]); // { start: 4.525, text: "In your book, ..." }

// Check remaining credits, plan, and rate limit (free). total_credits_left is
// plan + top-up combined - use that, not plan_credits_left alone, to check
// whether the key is actually out of credits.
const { total_credits_left, plan } = await client.getCredits();
```

Paginated endpoints (`search`, `getPlaylist`, `searchChannel`, `listChannelVideos`, `listChannelPlaylists`, `listChannelPosts`, `getVideoComments`) return a continuation token you feed back in on the next call:

```ts
let page = await client.search({ q: "lofi beats" });
while (page.continuation_token) {
  page = await client.search({ pageToken: page.continuation_token });
}
```

The channel lists take `continuation` instead of `channel` on later pages. `tab` (`"videos"`, `"shorts"` or `"streams"`, the Live tab) and `sort` (`"latest"`, `"popular"` or `"oldest"`) on `listChannelVideos` only apply to a first page: a continuation already carries them, so the SDK leaves them out of continuation requests.

```ts
let page = await client.listChannelVideos({ channel: "@mkbhd", tab: "streams", sort: "oldest" });
while (page.has_more && page.continuation_token) {
  page = await client.listChannelVideos({ continuation: page.continuation_token });
}
```

`getVideoComments` is different: every page needs the same `v` as well as `continuation` (the token does not replace `v`). A 404 with code `COMMENTS_DISABLED` means comments are turned off or the video does not exist.

```ts
let comments = await client.getVideoComments({ v: "dQw4w9WgXcQ" });
while (comments.has_more && comments.continuation_token) {
  comments = await client.getVideoComments({ v: "dQw4w9WgXcQ", continuation: comments.continuation_token });
}
```

Each call is 1 credit. The dislike numbers are estimates: YouTube no longer publishes dislikes, so `getVideoDislikes` always returns `estimated: true`.

`getTikTokTranscript` throws a 404 with code `TRANSCRIPT_NOT_FOUND` when the video has no captions or does not exist; that call is not charged.

### Handling errors

```ts
import { GetYouTubeTranscriptError } from "@tubeagentkit/getyoutubetranscript";

try {
  await client.getTranscript({ v: "invalid" });
} catch (err) {
  if (err instanceof GetYouTubeTranscriptError) {
    console.error(err.statusCode, err.code, err.message);
    // e.g. 402 PAYMENT_REQUIRED "You have used all your credits."
  } else {
    throw err;
  }
}
```

## API coverage

| Method | Endpoint | Credits |
| --- | --- | --- |
| `getTranscript(params, options?)` | `GET /transcript` (optional `timestamps: true`, `mode`) | 1 (AI: 3 per minute of video) |
| `startTranscript(params)` | `GET /transcript`, without waiting for an AI job | 1 (AI: 3 per minute of video) |
| `getTranscriptJob(params)` / `waitForTranscript(job)` | `GET /transcript/jobs` | free |
| `getTranscriptLanguages(params)` | `GET /transcript/languages` | 1 credit |
| `createBatch(params)` | `POST /batch` (up to 100 videos) | 1 per successful video |
| `getBatch(params)` / `waitForBatch(id)` | `GET /batch` | free |
| `search(params)` | `GET /search` | 1 |
| `resolveChannel(params)` | `GET /resolve` | 1 credit |
| `getPlaylist(params)` | `GET /playlist` | 1 |
| `getChannelLatest(params)` | `GET /channel/latest` | 1 credit |
| `searchChannel(params)` | `GET /channel/search` | 1 |
| `listChannelVideos(params)` | `GET /channel/videos` (optional `tab`, `sort`) | 1 |
| `listChannelPlaylists(params)` | `GET /channel/playlists` | 1 |
| `listChannelPosts(params)` | `GET /channel/posts` | 1 |
| `getChannelBanner(params)` | `GET /channel/banner` | 1 |
| `getRelatedVideos(params)` | `GET /video/related` | 1 |
| `getVideoDislikes(params)` | `GET /video/dislikes` (estimates) | 1 |
| `getVideoDetails(params)` | `GET /video` | 1 |
| `getVideoComments(params)` | `GET /video/comments` (paginated) | 1 per page |
| `getTikTokTranscript(params)` | `GET /tiktok/transcript` | 1 |
| `getCredits()` | `GET /credits` | free |
| `signup(email)` | `POST /signup` | free |
| `verifySignup(email, otp)` | `POST /signup/verify` | free |

Full parameter and response shapes are exported as TypeScript types (`TranscriptData`, `SearchData`, `PlaylistData`, etc.) - see [`src/types.ts`](./src/types.ts) or your editor's autocomplete.

## Development

```bash
npm install
npm run build       # tsup -> dist/ (ESM + CJS + .d.ts)
npm test            # unit tests, mocked fetch, no network
npm run typecheck
```

Live integration tests hit the real API and are skipped unless `GYT_API_KEY` is set:

```bash
GYT_API_KEY=sk_live_... npm run test:live
```

## Links

- Docs: [getyoutubetranscript.com/docs](https://getyoutubetranscript.com/docs)
- API reference (OpenAPI): [getyoutubetranscript.com/openapi.json](https://getyoutubetranscript.com/openapi.json)

## Related projects

Other ways to use the [GetYouTubeTranscript API](https://getyoutubetranscript.com):

- [youtube-transcript-api](https://github.com/tubeagentkit/youtube-transcript-api): YouTube Transcript API docs, endpoint reference, OpenAPI spec and examples in curl, Python, JavaScript, Go and PHP
- [youtube-transcript-api-python](https://github.com/tubeagentkit/youtube-transcript-api-python): YouTube Transcript API SDK for Python
- [youtube-mcp](https://github.com/tubeagentkit/youtube-mcp): Remote YouTube MCP server for Claude, ChatGPT, Cursor and VS Code
- [youtube-transcript-skills](https://github.com/tubeagentkit/youtube-transcript-skills): YouTube transcript Agent Skill for Claude Code, Cursor, Codex and OpenClaw
- [youtube-transcript-cursor-plugin](https://github.com/tubeagentkit/youtube-transcript-cursor-plugin): YouTube Transcript Cursor plugin bundling the MCP server, skills, commands and a research agent
- [n8n-nodes-getyoutubetranscript](https://github.com/tubeagentkit/n8n-nodes-getyoutubetranscript): YouTube transcript n8n community node, also usable as an AI Agent tool

## License

MIT © tubeagentkit
