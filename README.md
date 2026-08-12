# SyncView — Screen Sharing with Friends

SyncView creates private rooms where a host can broadcast a browser tab, window, or screen while everyone talks over live voice chat and text chat.

## Features

- Host screen sharing with tab/system audio when the browser supports it
- Multi-user voice chat with echo cancellation, mute, and leave controls
- Text chat and a people list
- Shareable room links and transferable host role
- Automatic WebRTC reconnection handling and ICE candidate queuing
- Optional TURN server support for restrictive networks

## Run locally

Requires Node.js 18 or newer.

```bash
npm run install:all
npm run dev
```

Open `http://localhost:5173`. Create a room, copy its invite link, and open it in another browser/device.

## Use a room

1. The host clicks **Share my screen** and selects a browser tab, window, or display.
2. Select a browser tab and enable **Share tab audio** for the clearest media audio.
3. Each person clicks **Join voice** and grants microphone permission.
4. If a browser blocks incoming audio, click **Play screen share** or **Enable voice audio**.

Screen and microphone capture require HTTPS when the app is not running on localhost. Some DRM-protected services may intentionally show a black screen during capture; the app cannot override that browser/platform restriction.

## Production

```bash
npm run build
npm start
```

The Node server serves the production client, API, WebSocket signaling, and room state from one origin. See [DEPLOY.md](./DEPLOY.md) for Render instructions.

## TURN configuration

STUN-only WebRTC does not work through every router, mobile carrier, or corporate network. For reliable public use, create credentials with a TURN provider (for example Cloudflare Calls TURN, Twilio Network Traversal, or Metered) and set these during the client build:

```env
VITE_TURN_URL=turn:your-turn-host:3478,turns:your-turn-host:5349
VITE_TURN_USERNAME=your-username
VITE_TURN_CREDENTIAL=your-credential
```

TURN credentials are delivered to browsers and therefore must be temporary/restricted credentials from your provider—not a permanent master secret.

## Server environment

- `PORT`: server port; defaults to `3001`
- `NODE_ENV`: set to `production` when deployed
- `CLIENT_ORIGIN`: optional comma-separated allowlist when client and server use different origins

## Architecture

- React client for rooms and media controls
- Socket.io for room state and WebRTC signaling
- One host-to-viewer WebRTC connection per screen viewer
- A small peer-to-peer mesh for voice participants
- In-memory rooms; restarting the server clears active rooms

Peer-to-peer voice is intended for small private groups. For larger rooms, replace the mesh with an SFU such as LiveKit, mediasoup, or Cloudflare Calls.

## License

MIT — use and modify freely for personal projects.
