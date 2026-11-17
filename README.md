# SyncView

Watch together with friends: one person shares a browser tab or screen, everyone watches it in up to 1080p at 30 fps with the tab's audio, and talks over live voice chat with text chat on the side.

## How it works

```
 Browser (sharer) ──upload once──▶  LiveKit Cloud (media server)  ──▶  each viewer
        │                                                               ▲
        └──── POST /api/rooms, /api/rooms/:id/token ──▶ Node server ────┘ (join tokens only)
```

- **Media goes through [LiveKit](https://livekit.io)**, an open-source WebRTC media server, hosted on LiveKit Cloud. The sharer uploads one stream no matter how many people watch. LiveKit relays it, adapts quality to each viewer's connection, and falls back to TCP/TLS on networks that block direct connections.
- **The Node server is small.** It creates rooms and signs join tokens with your LiveKit API secret. It stores nothing, so restarts and Render's free-tier sleeping don't lose rooms.
- **Chat, presence, mute state and speaking indicators** all run over the same LiveKit connection.

Rooms close automatically 10 minutes after creation if nobody joins, and 2 minutes after the last person leaves (long enough to refresh).

## Set up

Requires Node.js 18 or newer and a free [LiveKit Cloud](https://cloud.livekit.io) project.

1. Create a project at https://cloud.livekit.io, then go to **Settings → Keys** and create an API key.
2. Copy `server/.env.example` to `server/.env` and fill in the URL, key and secret.
3. Install and run:

```bash
npm run install:all
npm run dev
```

Open http://localhost:5173, create a room, and open the invite link in another browser or device.

## Using a room

- **Share**: pick a **browser tab** and keep **Share tab audio** on to get the movie's sound. Use the quality menu next to the Share button *before* sharing: 720p (data saver), 1080p (recommended) or 1080p+ (best quality, needs about 8 Mbps upload).
- **Voice**: click **Unmute** to talk. Echo cancellation and noise suppression are on.
- **Volumes**: the movie volume is on the player and the voice volume is in **People**. Both are remembered.
- Anyone can share. If two people share at once, viewers can switch between them at the top of the player.

Screen sharing needs Chrome, Edge or Firefox on a computer, and HTTPS anywhere except `localhost`. Phones can watch, talk and chat. Some streaming sites block capture with DRM and show a black screen; no web app can get around that.

## Production

```bash
npm run build
npm start
```

The Node server serves the built client and the API from one origin. See [DEPLOY.md](./DEPLOY.md) for Render.

| Variable | Required | Purpose |
|---|---|---|
| `LIVEKIT_URL` | yes | Your project URL, e.g. `wss://my-app-abc123.livekit.cloud` |
| `LIVEKIT_API_KEY` | yes | API key from LiveKit Cloud |
| `LIVEKIT_API_SECRET` | yes | API secret. Keep it server-side only; it is never sent to browsers. |
| `PORT` | no | Server port, default `3001` |
| `NODE_ENV` | no | `production` when deployed |

## Checks

```bash
npm run test:smoke
```

Runs against a running server (`TEST_URL` overrides the default `http://localhost:3001`). It creates a room, looks it up, and verifies that join tokens are scoped to the room and can't publish a camera.
