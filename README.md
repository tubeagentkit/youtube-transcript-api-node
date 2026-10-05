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
| `caption_type` | `"manual"` (uploaded by the creator), `"auto"` (YouTube speech recognition), or `null` if unknown |
| `cached` | `true` when served from the stored copy rather than fetched from YouTube just now |
| `fetched_at` | ISO 8601 time it was fetched from YouTube |

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

// Resolve a channel handle to its channel ID (free)
const { channel_id } = await client.resolveChannel({ handle: "@mkbhd" });

// List a playlist's videos
const playlist = await client.getPlaylist({ list: "PLillGF-RfqbYE6Ik_EuXA2iZFcE082B3s" });

// Channel metadata + latest uploads (free)
const channel = await client.getChannelLatest({ channel: "@mkbhd" });

// Search within a channel
const channelResults = await client.searchChannel({ channel: "@mkbhd", q: "iphone" });

// List all of a channel's uploads
const uploads = await client.listChannelVideos({ channel: "@mkbhd" });

// Check remaining credits, plan, and rate limit (free)
const { plan_credits_left, plan } = await client.getCredits();
```

Paginated endpoints (`search`, `getPlaylist`, `searchChannel`, `listChannelVideos`) return a continuation token you feed back in on the next call:

```ts
let page = await client.search({ q: "lofi beats" });
while (page.continuation_token) {
  page = await client.search({ pageToken: page.continuation_token });
}
```

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
| `getTranscript(params)` | `GET /transcript` (optional `timestamps: true`) | 1 |
| `createBatch(params)` | `POST /batch` (up to 100 videos) | 1 per successful video |
| `getBatch(params)` / `waitForBatch(id)` | `GET /batch` | free |
| `search(params)` | `GET /search` | 1 |
| `resolveChannel(params)` | `GET /resolve` | free |
| `getPlaylist(params)` | `GET /playlist` | 1 |
| `getChannelLatest(params)` | `GET /channel/latest` | free |
| `searchChannel(params)` | `GET /channel/search` | 1 |
| `listChannelVideos(params)` | `GET /channel/videos` | 1 |
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
