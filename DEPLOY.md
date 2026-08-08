# Deploy SyncView Online

Right now the app only runs on your PC (`localhost`). To use it from your phone, a friend's laptop, or anywhere else, you need to publish it on a public server with **HTTPS** (required for screen sharing).

The easiest free option is **[Render](https://render.com)** — it supports WebSockets (needed for chat and sync) and gives you a public URL like `https://syncview-xxxx.onrender.com`.

---

## Step 1 — Put the code on GitHub

Render deploys from GitHub. If you don't have a repo yet:

1. Create a free account at [github.com](https://github.com)
2. Click **New repository** → name it `syncview` → **Create repository**
3. In a terminal, from your project folder:

```powershell
cd "C:\Users\mrith\OneDrive\Desktop\Practice\Online Viewing"
git init
git add .
git commit -m "Initial SyncView watch party app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/syncview.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Step 2 — Deploy on Render

1. Sign up at [render.com](https://render.com) (use **Sign in with GitHub**)
2. Click **New +** → **Web Service**
3. Connect your `syncview` GitHub repository
4. Use these settings:

| Setting | Value |
|---------|--------|
| **Name** | `syncview` (or anything you like) |
| **Region** | Pick the closest to you |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm run install:all && npm run build` |
| **Start Command** | `npm start` |
| **Plan** | Free |

5. Under **Environment**, add:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |

6. Click **Create Web Service**

Render will build and deploy. After 2–5 minutes you'll get a URL like:

`https://syncview.onrender.com`

Open that link on **any device** — phone, tablet, another PC — and it works.

---

## Step 3 — Share with friends

1. Open your public URL
2. Create a watch party
3. Copy the invite link — it will use your public domain automatically
4. Send it to friends; they join from anywhere

---

## Test production locally first (optional)

Before deploying, you can simulate production on your machine:

```powershell
cd "C:\Users\mrith\OneDrive\Desktop\Practice\Online Viewing"
npm run install:all
npm run build
$env:NODE_ENV="production"; npm start
```

Open http://localhost:3001 — the built app is served from one port, same as production.

---

## Free tier notes (Render)

- The app **spins down after ~15 minutes** of no use. The first visit after that may take 30–60 seconds to wake up.
- Free tier is fine for watching with friends occasionally.
- For always-on hosting, upgrade to a paid plan (~$7/month on Render).

---

## Other hosting options

Same build/start commands work on:

| Platform | Notes |
|----------|--------|
| [Railway](https://railway.app) | Easy GitHub deploy, limited free credits |
| [Fly.io](https://fly.io) | Good WebSocket support, CLI-based |
| VPS (DigitalOcean, etc.) | More control, you manage Node + HTTPS yourself |

Build command: `npm run install:all && npm run build`  
Start command: `npm start`  
Environment: `NODE_ENV=production`

---

## Troubleshooting

**Screen share doesn't work**  
→ You must use **HTTPS**. Localhost works for dev; public URL must be `https://...`

**Friends can't connect to the stream**  
→ Some networks block WebRTC. Try again on Wi‑Fi vs mobile data. A TURN server can help (advanced).

**"Room not found" after server restart**  
→ Rooms are stored in memory. If Render restarts or sleeps, active rooms are cleared. Create a new room.

**Cold start is slow**  
→ Normal on Render free tier. Wait a minute and refresh.

---

## Quick alternative: ngrok (temporary testing only)

If you want to test from another device **without** full deployment:

```powershell
npm run dev
# In another terminal:
ngrok http 5173
```

This gives a temporary public URL, but it's not ideal for regular use — the URL changes and you'd need to proxy both ports. **Render is the better long-term solution.**
