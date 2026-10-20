# Mochi 🍡

A tiny, warm Android chat app for exactly two people. It is a small WebView
shell around an offline-first, deeply customizable UI, plus a tiny Node.js
WebSocket + upload server you run yourself.

- **Tiny APK** (~170 KB), no ads, no accounts, no tracking.
- **Warm and customizable**: 8 balanced themes, accent colors, a full theme
  studio (every color + custom CSS), your own background photo, profile photo,
  bubble shapes, fonts, doodles, text size, sounds, haptics, compact and calm
  modes.
- **Photos, video and voice**: send images, videos and voice notes from the
  gallery or camera, with an Instagram-style camera button and hold-to-selfie.
- **Your own server**: one small Node process, plain JSON history on disk,
  self-hosted media in an `uploads/` folder.
- **Good for two**: presence, typing indicator, emoji reactions, optimistic
  send with retry, message cache, reconnect with backoff.

## What is here

```
C:\projects\ysr
├─ Mochi.apk            signed, sideloadable release build
├─ render.yaml          one-click deploy for Render (free tier)
├─ android\             Gradle project (minSdk 24, targetSdk 34)
│  └─ app\src\main\assets\www\   the whole UI (HTML/CSS/JS, bundled fonts)
└─ server\              Node WebSocket + upload server, tests, Dockerfile
   ├─ server.js
   ├─ test.mjs
   ├─ Dockerfile
   └─ data\             created at runtime: messages.json + uploads\
```

## Run the server

Requirements: **Node.js 18 or newer** (nothing else).

```powershell
cd C:\projects\ysr\server
npm install
npm start
```

On start it prints the addresses to use, for example:

```
  local:   ws://localhost:8787
  wi-fi:   ws://192.168.1.20:8787
  health:  http://localhost:8787/health
  files:   C:\projects\ysr\server\data\uploads
```

Keep that window open while you chat. Health check: `http://localhost:8787/health`.

Environment variables:

| Variable        | Default              | Meaning                          |
| --------------- | -------------------- | -------------------------------- |
| `PORT`          | `8787`               | listening port                   |
| `HOST`          | `0.0.0.0`            | interface to bind                |
| `DATA_FILE`     | `data/messages.json` | where history is saved           |
| `UPLOAD_DIR`    | `<data>/uploads`     | where media files are stored     |
| `MAX_HISTORY`   | `300`                | messages kept per room           |
| `MAX_UPLOAD_MB` | `64`                 | largest single upload, in MB     |

Messages are capped at 300 per room and sends are idempotent per
`sender + clientMsgId`, so retries never duplicate.

### HTTP endpoints

| Route                | Meaning                                                   |
| -------------------- | --------------------------------------------------------- |
| `GET /`              | human-friendly status page                                 |
| `GET /health`        | JSON stats (rooms, sockets, files, uptime)                 |
| `GET /files/<name>`  | serves an uploaded file (supports byte ranges for video)   |
| `POST /upload`       | stores the raw body; send `content-type` + `x-filename`    |

`POST /upload` returns `{"url":"/files/<name>","name","type","size"}`. The app
then references that URL in a normal send. CORS is open, so uploads work even
when the UI runs from a `file://` page inside the WebView.

## Install the app

Copy `Mochi.apk` to the phone and open it (allow installing from unknown
sources if asked). It is signed with the standard Android debug key, which is
fine for personal sideloading. Use a dedicated keystore before distributing it
to others.

Camera, gallery and microphone are requested on first use.

## Connect the two phones

Both phones must be able to reach the server.

1. Put the server computer and both phones on the **same Wi-Fi**.
2. Allow Node.js through the Windows Firewall (private networks) the first
   time, so port `8787` is reachable.
3. In the app's welcome screen:
   - **your name**: anything, e.g. `strawberry` and `matcha`
   - **room key**: the **exact same key** on both phones, e.g. `mint-2048`
   - **server address**: `ws://<computer-LAN-IP>:8787`
4. Tap **open our little world** on both phones. You should see
   "you + 1 here" and each other's messages.

On an **Android emulator** on the same PC, use `ws://10.0.2.2:8787` instead of
the LAN address.

## Keep it always on ("infinity")

Your phone needs the server to be reachable at all times. Pick whichever fits:

### 1. A free hosting website (easiest)

This repo ships a `render.yaml`, so **Render** can host the server for free.

1. Push this folder to a GitHub repository.
2. On [render.com](https://render.com): **New → Blueprint**, pick the repo.
3. Render reads `render.yaml`, installs `ws`, and starts `node server.js`.
4. Copy the service URL (`https://mochi-xxxx.onrender.com`) and use it in the
   app as **`wss://mochi-xxxx.onrender.com`** for both phones. Uploads and
   `wss://` just work because Render terminates TLS.

Notes for the free tier:

- Free instances **sleep after ~15 minutes** of no traffic and take a few
  seconds to wake. Open the app (or point a free uptime pinger like
  UptimeRobot at `https://<your-service>/health` every 10 minutes) to keep it
  warm.
- There is **no persistent disk** on the free plan, so history and uploads
  reset on each deploy/restart. That is fine for casual use; add a paid disk
  (mount it at `/data` and set `DATA_FILE=/data/messages.json`) to keep them.

Any Docker host works too (Railway, Fly.io, Koyeb, a VPS…). A `server/Dockerfile`
is included:

```powershell
cd C:\projects\ysr\server
docker build -t mochi-server .
docker run -p 8787:8787 -v mochi-data:/data mochi-server
```

### 2. Keep it on your own computer

Just leave `npm start` running. Combine it with a **Cloudflare Tunnel** so it
stays reachable without port forwarding even when your IP changes:

```powershell
cloudflared tunnel --url http://localhost:8787
```

Use the printed `https://...trycloudflare.com` address in the app, changing
`https://` to `wss://`.

### 3. A tiny always-on box

A Raspberry Pi, an old laptop, or an **Oracle Cloud Always Free** VM will run
this server forever. Install Node 18+, copy `server\`, run `npm install &&
npm start`, and put `wss://` in front of it with Caddy:

```
chat.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Then use `wss://chat.example.com` on both phones.

## Make it yours

Open the settings sheet (the two-line icon in the header):

- **You**: display name, profile photo, or an emoji face.
- **Our room**: rename your friend, change the room key, change the server.
- **Theme**: 8 balanced presets — warm paper, soft sage, fired clay, quiet
  slate, dusty rose, graphite, warm ink, deep night — plus an accent row and a
  custom accent color.
- **Recipes**: five one-tap looks — anime dusk, strawberry milk, noor,
  rosy love, best friends — or paste/load your own JSON or CSS look.
- **Theme studio**: recolor every token (background, cards, text, borders,
  accent), choose a **background photo** with dim/blur, write **custom CSS**,
  and **export/import** your theme as a JSON file.
- **Shape & paper**: font (editorial / friendly / modern), bubble shape,
  avatar shape, background doodles, text size, paper-note texture.
- **Behaviour**: timestamps, typing indicator, read receipts, send-with-enter,
  group messages, sounds, haptics, compact mode, calm motion, clock format,
  sound volume.
- **Photos, video & voice**: autoplay media, and when to download media
  (always / wi-fi only / tap to load).
- **Backup**: export and import all settings, theme and CSS.
- **Start over**: forget local settings and history (tap twice to confirm).

Settings, the last 300 messages, and your theme are cached locally, so the app
opens with your conversation already on screen.

### Recipes

A recipe is a small JSON file that sets the whole look at once: theme colors,
accent, font, shape, doodles, background gradient or photo, avatar and extra CSS.

- **Built in** (settings → recipes): `anime dusk`, `strawberry milk`, `noor`
  (islamic), `rosy love`, `best friends`.
- **Load your own**: paste a recipe into the box and tap **apply**, or tap
  **load file** and pick a `.json` / `.mochi` file from your phone. Pasting plain
  CSS also works — it is applied as a quick custom look.
- **Share a look**: style the app, tap **save my look**, and send the downloaded
  `mochi-recipe.json` to the other phone.

Ready-to-drop examples live in [`recipes/`](recipes/) (`anime.json`,
`girly.json`, `islamic.json`, `love.json`, `friendship.json`), and
[`recipes/README.md`](recipes/README.md) documents every field. The built-in
copies live in `android/app/src/main/assets/www/recipes.js` — edit that file and
rebuild to add more presets.

### Sending media

- **Gallery** button → pick photos/videos (multi-select).
- **Camera** button → take a photo; **press and hold** it for a selfie.
- **Mic** button → record a voice note; send or cancel from the bar.

Long-press any message to react with an emoji or copy it. Tap an image to open
the full-screen viewer.

## Demo mode (for screenshots and UI checks)

Append query parameters to the local page (`assets/www/index.html`):

- `?demo=1` — seeded conversation with a friend (includes a sample image)
- `?demo=empty` — empty conversation
- `?theme=sage&accent=%235e8c6a` — pick a theme and accent

Example: `index.html?demo=1&theme=ink`

## WebSocket protocol

The client opens `ws(s)://host:port/?room=...&name=...&avatar=...&client=...`.

Client to server:

| Message | Shape |
| ------- | ----- |
| send   | `{"type":"send","clientMsgId":"...","text":"...","attachment":{...}}` |
| typing | `{"type":"typing","on":true}` |
| react  | `{"type":"react","messageId":"...","emoji":"🔥"}` |

Server to client:

| Message  | Shape |
| -------- | ----- |
| history  | `{"type":"history","messages":[...],"presence":2}` |
| message  | `{"type":"msg","message":{"id","clientMsgId","senderId","name","avatar","text","ts","attachment","reactions"}}` |
| presence | `{"type":"presence","count":2}` |
| typing   | `{"type":"typing","senderId":"...","name":"...","on":true}` |
| reaction | `{"type":"reaction","messageId":"...","reactions":{"🔥":["id"]}}` |
| error    | `{"type":"error","code":"rate","message":"...","clientMsgId":"..."}` |

An `attachment` is `{"url":"/files/<name>","type","name","size","width","height","duration"}`.
Reactions toggle per sender: reacting with the same emoji again removes it.
Sends are rate limited to 30 messages per 10 seconds per socket.

## Test the server

```powershell
cd C:\projects\ysr\server
npm test
```

This starts a throwaway server, connects two clients and checks delivery,
typing, presence, reactions, an upload round-trip, and that history persists
across a restart.

## Build the APK yourself

Requirements: **JDK 17** and the **Android SDK** (platform 35, build-tools
34.0.0+, platform-tools). Then either:

- Open `android\` in Android Studio and build the `release` variant, or
- From the command line:

  ```powershell
  cd C:\projects\ysr\android
  # one-time: point Gradle at your SDK
  "sdk.dir=C:/Users/YOU/AppData/Local/Android/Sdk" | Set-Content local.properties
  .\gradlew.bat assembleRelease
  ```

The APK lands in `android\app\build\outputs\apk\release\app-release.apk`.

## Notes

- No accounts and no message-sending to third parties. Messages pass through
  your server and are stored as JSON; media is stored as files under
  `server\data\uploads`.
- The app allows cleartext (`ws://`) traffic so it works on a home LAN, and
  `wss://`/`https://` for hosted servers.
- The release build uses the debug signing key for convenience. Generate a real
  keystore before sharing the app with anyone else.
- Layout is portrait-only, `minSdk 24` (Android 7+), `targetSdk 34`.
