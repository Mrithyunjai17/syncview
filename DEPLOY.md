# Deploy SyncView

SyncView has two parts in production:

1. **LiveKit Cloud** carries the video, audio and chat. It is free to start.
2. **The Node app** (this repo) serves the website and issues join tokens. Render's free tier works.

Screen sharing requires HTTPS, which Render provides automatically.

---

## Step 1: Create a LiveKit Cloud project

1. Sign up at https://cloud.livekit.io and create a project.
2. Go to **Settings → Keys** and create an API key. Note three values:
   - **URL**, like `wss://my-app-abc123.livekit.cloud`
   - **API key**
   - **API secret**

Keep the secret private. It only goes into the server's environment, never into the client or git.

## Step 2: Deploy on Render

The repo includes a `render.yaml`, so Render can configure itself.

1. Sign in at https://render.com with GitHub.
2. Click **New + → Blueprint** and pick the `syncview` repository.
3. When Render asks for the environment values, enter `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` from step 1.
4. Click **Apply**. After a few minutes you get a URL like `https://syncview.onrender.com`.

**Manual alternative:** create a **Web Service** instead, with:

| Setting | Value |
|---|---|
| Build Command | `npm run install:all && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Environment | `NODE_ENV=production`, plus the three `LIVEKIT_*` values |

## Step 3: Check it

Open `https://<your-app>.onrender.com/api/health`. It should say `"livekit": true`. Then create a room and open the invite link on another device.

To run the API smoke test against the live site:

```bash
TEST_URL=https://<your-app>.onrender.com npm run test:smoke
```

---

## Notes

- **Render free tier sleeps** after about 15 minutes without traffic. The first visit then takes 30–60 seconds. Rooms live in LiveKit, so a sleeping server doesn't lose them, but nobody can *join* until it wakes.
- **LiveKit Cloud free tier** has a monthly allowance of participant-minutes and bandwidth, which is plenty for occasional watch parties with a few friends. Check usage in the LiveKit dashboard.
- **Other hosts** (Railway, Fly.io, a VPS) work the same way: same build and start commands, same environment variables.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The server is missing its LiveKit settings" | One of the `LIVEKIT_*` variables is missing. Set it and redeploy. |
| "Could not reach the media server" | The URL, key or secret is wrong, or the LiveKit project is paused. Check them in the LiveKit dashboard. |
| Share button disabled | The page isn't on HTTPS, or the browser can't share (phones can't). |
| Viewers see video but no sound | The sharer must pick a **tab** and keep **Share tab audio** on. Window and full-screen shares only carry audio on some systems. |
| Black screen for a streaming site | That site blocks capture with DRM. Nothing can get around this. |
