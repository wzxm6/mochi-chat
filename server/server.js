import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";

const DEFAULT_PORT = 8787;
const MAX_HISTORY = Number(process.env.MAX_HISTORY) || 300;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 64;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_TEXT = 2000;
const KEEPALIVE_MS = 30000;
const RATE_WINDOW_MS = 10000;
const RATE_LIMIT = 30;

const EXT_BY_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav"
};

const SAFE_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;

function clean(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

function cleanText(value) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, MAX_TEXT)
    .replace(/\s+$/, "");
}

function cleanRoom(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 40);
}

function cleanId(value) {
  return String(value == null ? "" : value)
    .replace(/[^a-zA-Z0-9_-]+/g, "")
    .slice(0, 48);
}

function json(value) {
  return JSON.stringify(value);
}

function extensionFor(contentType, filename) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_TYPE[type]) return EXT_BY_TYPE[type];
  const fromName = path.extname(String(filename || "")).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return ".bin";
}

function fileUrls(file) {
  try {
    const stat = fs.statSync(file);
    return stat.isFile();
  } catch (error) {
    return false;
  }
}

function loadData(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.rooms && typeof parsed.rooms === "object") {
      const rooms = {};
      for (const [room, list] of Object.entries(parsed.rooms)) {
        if (Array.isArray(list)) {
          rooms[room] = list
            .filter((message) => message && (typeof message.text === "string" || message.attachment))
            .slice(-MAX_HISTORY);
        }
      }
      return { rooms };
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[mochi] could not read history:", error.message);
    }
  }
  return { rooms: {} };
}

function saveData(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  } catch (error) {
    console.warn("[mochi] could not save history:", error.message);
  }
}

function localAddresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const entry of list || []) {
      if (entry && entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

function landingPage(stats, port) {
  const addresses = localAddresses();
  const rows = addresses.length
    ? addresses.map((address) => `<li><code>ws://${address}:${port}</code></li>`).join("")
    : "<li>connect this computer to Wi-Fi to see its address</li>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mochi server</title>
<style>
  :root { --bg:#f4f1ea; --surface:#fff; --ink:#2b2723; --ink2:#6b6259; --line:#e3dccf; --accent:#c4623f; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
         background:var(--bg); color:var(--ink);
         font-family:"Georgia",system-ui,serif; }
  main { width:min(100%,540px); background:var(--surface); border:1px solid var(--line);
         border-radius:18px; padding:28px; box-shadow:0 24px 60px -40px rgba(43,39,35,.5); }
  h1 { margin:0 0 4px; font-size:2rem; letter-spacing:-.03em; }
  p { color:var(--ink2); line-height:1.5; }
  .pill { display:inline-block; padding:4px 12px; border-radius:999px; background:#f3e4dc;
          color:var(--accent); font-weight:700; font-size:.75rem; letter-spacing:.08em; text-transform:uppercase; font-family:system-ui,sans-serif; }
  ul { padding-left:20px; }
  code { background:#f8f5ef; border-radius:8px; padding:2px 7px; font-size:.9rem; }
  .stats { display:flex; gap:12px; margin-top:20px; }
  .stats div { flex:1; background:#f8f5ef; border-radius:14px; padding:12px; text-align:center; font-family:system-ui,sans-serif; }
  .stats strong { display:block; font-size:1.5rem; }
  .stats span { color:var(--ink2); font-size:.75rem; }
  footer { margin-top:22px; color:var(--ink2); font-size:.8rem; }
</style>
</head>
<body>
<main>
  <span class="pill">awake</span>
  <h1>mochi server</h1>
  <p>Everything is warm and listening. Point the Mochi app at one of these addresses:</p>
  <ul>${rows}</ul>
  <div class="stats">
    <div><strong>${stats.rooms}</strong><span>rooms</span></div>
    <div><strong>${stats.clients}</strong><span>open sockets</span></div>
    <div><strong>${stats.files}</strong><span>files</span></div>
    <div><strong>${Math.floor(stats.uptime)}s</strong><span>uptime</span></div>
  </div>
  <footer>Keep this window open while you chat. On the same Wi-Fi is easiest.</footer>
</main>
</body>
</html>`;
}

export function createChatServer(options = {}) {
  const port = options.port == null ? DEFAULT_PORT : options.port;
  const host = options.host || "0.0.0.0";
  const dataFile = options.dataFile || path.join(process.cwd(), "data", "messages.json");
  const uploadDir = options.uploadDir || path.join(path.dirname(dataFile), "uploads");

  const data = loadData(dataFile);
  const clients = new Set();
  const rooms = new Map();

  let saveTimer = null;
  let startedAt = Date.now();

  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (error) {
    console.warn("[mochi] could not create upload dir:", error.message);
  }

  function historyFor(room) {
    if (!data.rooms[room]) data.rooms[room] = [];
    return data.rooms[room];
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveData(dataFile, data);
    }, 500);
  }

  function saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveData(dataFile, data);
  }

  function roomClients(room) {
    if (!rooms.has(room)) rooms.set(room, new Set());
    return rooms.get(room);
  }

  function broadcast(room, payload, except) {
    const members = rooms.get(room);
    if (!members) return;
    const text = json(payload);
    for (const client of members) {
      if (client === except) continue;
      if (client.ws.readyState === 1) {
        try {
          client.ws.send(text);
        } catch (error) {
          /* the socket will close on its own */
        }
      }
    }
  }

  function sendTo(client, payload) {
    if (client.ws.readyState !== 1) return;
    try {
      client.ws.send(json(payload));
    } catch (error) {
      /* ignore */
    }
  }

  function presence(room) {
    const members = rooms.get(room);
    return members ? members.size : 0;
  }

  function findExisting(client, clientMsgId) {
    if (!clientMsgId) return null;
    const list = historyFor(client.room);
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const message = list[index];
      if (message.clientMsgId === clientMsgId && message.senderId === client.id) {
        return message;
      }
    }
    return null;
  }

  function rateLimited(client) {
    const now = Date.now();
    client.rate = (client.rate || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
    if (client.rate.length >= RATE_LIMIT) return true;
    client.rate.push(now);
    return false;
  }

  function sanitizeAttachment(raw) {
    if (!raw || typeof raw !== "object") return null;
    const url = String(raw.url || "");
    if (!/^\/files\/[A-Za-z0-9._-]+$/.test(url)) return null;
    const type = SAFE_TYPE.test(String(raw.type || "")) ? String(raw.type) : "application/octet-stream";
    return {
      url,
      type,
      name: clean(raw.name, 120) || "file",
      size: Math.max(0, Math.min(Number(raw.size) || 0, MAX_UPLOAD_BYTES)),
      width: Math.max(0, Math.min(Number(raw.width) || 0, 100000)),
      height: Math.max(0, Math.min(Number(raw.height) || 0, 100000)),
      duration: Math.max(0, Math.min(Number(raw.duration) || 0, 86400))
    };
  }

  function handleMessage(client, raw) {
    let parsed;
    try {
      parsed = JSON.parse(String(raw));
    } catch (error) {
      return sendTo(client, { type: "error", code: "json", message: "that was not a message" });
    }
    if (!parsed || typeof parsed !== "object") return;

    if (parsed.type === "send") {
      const clientMsgId = cleanId(parsed.clientMsgId);
      const text = cleanText(parsed.text);
      const attachment = sanitizeAttachment(parsed.attachment);
      if (!text && !attachment) return;

      if (rateLimited(client)) {
        return sendTo(client, {
          type: "error",
          code: "rate",
          clientMsgId,
          message: "slow down a little"
        });
      }

      const existing = findExisting(client, clientMsgId);
      if (existing) {
        return sendTo(client, { type: "msg", message: existing });
      }

      const message = {
        id: randomUUID(),
        clientMsgId,
        senderId: client.id,
        name: client.name,
        avatar: client.avatar,
        text,
        ts: Date.now()
      };
      if (attachment) message.attachment = attachment;

      const list = historyFor(client.room);
      list.push(message);
      if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);
      scheduleSave();
      broadcast(client.room, { type: "msg", message });
      return;
    }

    if (parsed.type === "typing") {
      broadcast(client.room, {
        type: "typing",
        senderId: client.id,
        name: client.name,
        on: Boolean(parsed.on)
      }, client);
      return;
    }

    if (parsed.type === "react") {
      const messageId = cleanId(parsed.messageId);
      const emoji = clean(parsed.emoji, 8);
      if (!messageId || !emoji) return;
      const list = historyFor(client.room);
      const target = list.find((message) => message.id === messageId);
      if (!target) return;
      target.reactions = target.reactions || {};
      const current = target.reactions[emoji] || [];
      const next = current.includes(client.id)
        ? current.filter((id) => id !== client.id)
        : current.concat(client.id);
      if (next.length) target.reactions[emoji] = next;
      else delete target.reactions[emoji];
      scheduleSave();
      broadcast(client.room, { type: "reaction", messageId, reactions: target.reactions });
      return;
    }
  }

  // --- HTTP: health, landing, upload, media ---
  function cors(response) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Filename");
    response.setHeader("Access-Control-Max-Age", "86400");
  }

  function streamFile(request, response, file, contentType) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch (error) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not here");
      return;
    }
    const headers = {
      "content-type": contentType || "application/octet-stream",
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": stat.size
    };
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        let start = match[1] ? Number(match[1]) : 0;
        let end = match[2] ? Number(match[2]) : stat.size - 1;
        if (start > end || start >= stat.size) {
          response.writeHead(416, { "content-range": `bytes */${stat.size}` });
          response.end();
          return;
        }
        end = Math.min(end, stat.size - 1);
        headers["content-length"] = end - start + 1;
        headers["content-range"] = `bytes ${start}-${end}/${stat.size}`;
        response.writeHead(206, headers);
        fs.createReadStream(file, { start, end }).pipe(response);
        return;
      }
    }
    response.writeHead(200, headers);
    fs.createReadStream(file).pipe(response);
  }

  function readBody(request, limit) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      request.on("data", (chunk) => {
        size += chunk.length;
        if (size > limit) {
          reject(Object.assign(new Error("too large"), { code: "TOO_LARGE" }));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on("end", () => resolve(Buffer.concat(chunks)));
      request.on("error", reject);
    });
  }

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    cors(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (requestUrl.pathname === "/health") {
      let files = 0;
      try {
        files = fs.readdirSync(uploadDir).length;
      } catch (error) {
        files = 0;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(json({
        ok: true,
        rooms: Object.keys(data.rooms).length,
        openRooms: rooms.size,
        clients: clients.size,
        files,
        uptime: (Date.now() - startedAt) / 1000
      }));
      return;
    }

    if (requestUrl.pathname === "/upload" && request.method === "POST") {
      let body;
      try {
        body = await readBody(request, MAX_UPLOAD_BYTES);
      } catch (error) {
        response.writeHead(413, { "content-type": "application/json" });
        response.end(json({ error: "file is too big (max " + MAX_UPLOAD_MB + " MB)" }));
        return;
      }
      if (!body.length) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(json({ error: "empty upload" }));
        return;
      }
      const contentType = String(request.headers["content-type"] || "").split(";")[0].trim();
      const filename = decodeURIComponent(String(request.headers["x-filename"] || ""));
      const ext = extensionFor(contentType, filename);
      const stored = Date.now().toString(36) + "-" + randomUUID().slice(0, 8) + ext;
      try {
        fs.writeFileSync(path.join(uploadDir, stored), body);
      } catch (error) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(json({ error: "could not store file" }));
        return;
      }
      const type = SAFE_TYPE.test(contentType) ? contentType : "application/octet-stream";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(json({
        url: "/files/" + stored,
        name: path.basename(filename).slice(0, 120) || stored,
        type,
        size: body.length
      }));
      return;
    }

    if (requestUrl.pathname.startsWith("/files/") && request.method === "GET") {
      const name = path.basename(requestUrl.pathname.slice("/files/".length));
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end("bad name");
        return;
      }
      const typeByExt = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
        ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
        ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav"
      };
      streamFile(request, response, path.join(uploadDir, name), typeByExt[path.extname(name).toLowerCase()]);
      return;
    }

    if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
      const stats = {
        rooms: Object.keys(data.rooms).length,
        clients: clients.size,
        files: (() => { try { return fs.readdirSync(uploadDir).length; } catch (error) { return 0; } })(),
        uptime: (Date.now() - startedAt) / 1000
      };
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(landingPage(stats, port));
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not here");
  });

  const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });

  wss.on("connection", (ws, request) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    const room = cleanRoom(requestUrl.searchParams.get("room"));
    if (!room) {
      ws.close(1008, "room required");
      return;
    }

    const client = {
      id: cleanId(requestUrl.searchParams.get("client")) || randomUUID(),
      name: clean(requestUrl.searchParams.get("name"), 24) || "someone",
      avatar: clean(requestUrl.searchParams.get("avatar"), 300) || "☁️",
      room,
      ws,
      rate: [],
      alive: true
    };

    clients.add(client);
    roomClients(room).add(client);
    console.log(`[mochi] + ${client.name} in #${room} (${clients.size} sockets)`);

    sendTo(client, {
      type: "history",
      messages: historyFor(room),
      presence: presence(room)
    });
    broadcast(room, { type: "presence", count: presence(room) });

    ws.on("message", (raw) => handleMessage(client, raw));
    ws.on("pong", () => {
      client.alive = true;
    });
    ws.on("close", () => {
      clients.delete(client);
      const members = rooms.get(room);
      if (members) members.delete(client);
      broadcast(room, { type: "presence", count: presence(room) });
      console.log(`[mochi] - ${client.name} in #${room} (${clients.size} sockets)`);
    });
    ws.on("error", () => {
      /* close will fire next */
    });
  });

  const keepalive = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        try {
          client.ws.terminate();
        } catch (error) {
          /* ignore */
        }
        continue;
      }
      client.alive = false;
      try {
        client.ws.ping();
      } catch (error) {
        /* ignore */
      }
    }
  }, KEEPALIVE_MS);

  return {
    server,
    wss,
    port,
    host,
    dataFile,
    uploadDir,
    listen(listenPort = port, listenHost = host) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(listenPort, listenHost, () => {
          server.removeListener("error", reject);
          startedAt = Date.now();
          resolve(server.address());
        });
      });
    },
    close() {
      clearInterval(keepalive);
      saveNow();
      return new Promise((resolve) => {
        for (const client of clients) {
          try {
            client.ws.close(1001, "server going to sleep");
          } catch (error) {
            /* ignore */
          }
        }
        wss.close(() => {
          server.close(() => resolve());
        });
      });
    },
    stats() {
      return {
        rooms: Object.keys(data.rooms).length,
        openRooms: rooms.size,
        clients: clients.size,
        uptime: (Date.now() - startedAt) / 1000
      };
    }
  };
}

async function main() {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const chat = createChatServer({
    port,
    host: process.env.HOST || "0.0.0.0",
    dataFile: process.env.DATA_FILE || path.join(process.cwd(), "data", "messages.json"),
    uploadDir: process.env.UPLOAD_DIR || undefined
  });

  await chat.listen();
  const addresses = localAddresses();

  console.log("");
  console.log("  mochi server is awake");
  console.log("  -------------------------");
  console.log(`  local:   ws://localhost:${port}`);
  for (const address of addresses) {
    console.log(`  wi-fi:   ws://${address}:${port}`);
  }
  console.log(`  health:  http://localhost:${port}/health`);
  console.log(`  files:   ${chat.uploadDir}`);
  console.log("  stop with Ctrl+C");
  console.log("");

  const shutdown = async () => {
    console.log("\n[mochi] going to sleep, saving history...");
    await chat.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[mochi] failed to start:", error);
    process.exit(1);
  });
}
