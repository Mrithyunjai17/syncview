# SyncView — Watch Together Online

SyncView lets you create a private watch party room, invite friends with a link, and keep video playback synchronized in real time with live chat.

## Features

- **Screen sharing** — host broadcasts their screen so friends can watch Netflix, YouTube, Prime, or anything else
- **Synchronized playback** — play, pause, and seek stay aligned for direct video URLs
- **Shareable rooms** — create a room and send friends the invite link or room code
- **Live chat** — talk while you watch
- **Host controls** — one person drives the session; host can be transferred
- **Format support** — MP4, WebM, and HLS (`.m3u8`) streams for URL mode
- **Drift correction** — viewers automatically re-sync every few seconds (URL mode)

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer

### Install

```bash
npm run install:all
```

### Development

Run the server and client together:

```bash
npm run dev
```

- App: http://localhost:5173
- API / WebSocket server: http://localhost:3001

### Production

```bash
npm run build
npm start
```

The server serves the built client from `client/dist` on port 3001 (or `PORT` env var).

## How to use

1. Open the app and enter your name.
2. Click **Create watch party** or join with a room code.
3. Share the invite link with friends.
4. **Screen share (recommended):** as host, click **Share my screen** and pick the browser tab or window with your movie.
5. **Video URL mode:** paste a direct video URL and click **Load for everyone** (optional alternative).

### Screen share tips

- Choose **Browser tab** when sharing Netflix, Prime, Disney+, or YouTube — this captures tab audio.
- Enable **Share tab audio** in Chrome’s share dialog.
- Friends see a live stream of your screen — they watch exactly what you watch.
- Works best with 2–6 friends on a decent connection (WebRTC peer-to-peer).

## Video sources (URL mode)

SyncView plays videos from URLs you provide. Use content you have the legal right to stream (your own files hosted on cloud storage, royalty-free samples, etc.).

**Works well:**

- Direct `.mp4` / `.webm` links with CORS enabled
- HLS streams (`.m3u8`) via [hls.js](https://github.com/video-dev/hls.js/)

**Does not support out of the box:**

- Netflix, Disney+, Prime Video (DRM protected)
- YouTube (use YouTube’s official watch-together or embed separately)

### Hosting your own files

Upload video files to S3, Cloudflare R2, Backblaze B2, or similar and use the public URL. Enable CORS on the bucket so browsers can fetch the file.

Example CORS rule (S3):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:5173", "https://your-domain.com"],
    "ExposeHeaders": []
  }
]
```

## Deploy for friends

See **[DEPLOY.md](./DEPLOY.md)** for full step-by-step instructions.

**Quick path (free on Render):**

1. Push this project to GitHub
2. Create a **Web Service** on [render.com](https://render.com) from that repo
3. Build command: `npm run install:all && npm run build`
4. Start command: `npm start`
5. Environment: `NODE_ENV=production`

You get a public HTTPS URL like `https://syncview.onrender.com` — open it on any phone, tablet, or PC.

## Architecture

```
Browser (React + hls.js)
    ↕ WebSocket (Socket.io)
Node server (Express)
    └── In-memory rooms (play state, chat, members)
```

Playback sync flow:

1. Host emits play/pause/seek events.
2. Server stores authoritative state with a timestamp.
3. Viewers apply state and periodically request corrected time (accounts for network delay).

## Environment variables

| Variable        | Default               | Description                          |
|----------------|-----------------------|--------------------------------------|
| `PORT`         | `3001`                | Server port (set automatically on Render) |
| `NODE_ENV`     | (unset)               | Set to `production` when deployed    |
| `CLIENT_ORIGIN`| auto in production    | Only if client/server are on different domains |

## Roadmap ideas

- Persistent rooms with Redis
- Subtitle track support
- Voice/video reactions
- File upload instead of URL-only
- Better buffering / loading indicators

## License

MIT — use and modify freely for personal projects with friends.
