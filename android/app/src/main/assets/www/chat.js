"use strict";

let messages = [];
let socket = null;
let socketToken = 0;
let reconnectTimer = null;
let reconnectAttempt = 0;
let connectionState = "offline";
let presenceCount = 0;
let lastCloseReason = "";
let pendingTimers = new Map();
let typingUsers = new Map();
let typingStopTimer = null;
let lastTypingSentAt = 0;
let newMessageIds = new Set();
let unseenMessages = false;
let demoTypingTimer = null;
let demoReplyIndex = 0;

let voiceAudio = null;
let voiceCurrent = null;
let reactionTarget = null;

let micGranted = null;
let micResolve = null;
let mediaRecorder = null;
let recordStream = null;
let recordChunks = [];
let recordTimer = null;
let recordStartedAt = 0;
let recordCancelled = false;
let recordAutoStop = null;

const RECORD_MAX_SECONDS = 120;

/* ------------------------------------------------------------------ *
 *  helpers
 * ------------------------------------------------------------------ */

function iconSvg(name, extraClass) {
  return '<svg class="icon' + (extraClass ? " " + extraClass : "") +
    '" aria-hidden="true"><use href="#' + name + '"/></svg>';
}

function mediaKind(type) {
  const value = String(type || "").toLowerCase();
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("audio/")) return "audio";
  return "file";
}

function sanitizeAttachment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const url = String(raw.url || "");
  if (!url) return null;
  return {
    url,
    type: String(raw.type || "").slice(0, 80) || "application/octet-stream",
    name: String(raw.name || "file").slice(0, 120),
    size: Math.max(0, Number(raw.size) || 0),
    width: Math.max(0, Math.round(Number(raw.width) || 0)),
    height: Math.max(0, Math.round(Number(raw.height) || 0)),
    duration: Math.max(0, Number(raw.duration) || 0)
  };
}

function sanitizeReactions(raw) {
  const result = {};
  if (!raw || typeof raw !== "object") return result;
  for (const emoji of Object.keys(raw)) {
    const ids = raw[emoji];
    if (!Array.isArray(ids)) continue;
    const clean = ids.map((id) => String(id)).slice(0, 64);
    if (clean.length) result[String(emoji).slice(0, 8)] = clean;
  }
  return result;
}

function cacheKey(room) {
  return CACHE_PREFIX + room;
}

function normalizeMessage(raw, cached) {
  if (!raw || typeof raw !== "object") return null;
  const text = String(raw.text == null ? "" : raw.text).slice(0, 2000);
  let attachment = sanitizeAttachment(raw.attachment);
  if (attachment && attachment.url.startsWith("blob:")) attachment = null;
  if (!text.trim() && !attachment) return null;

  let msgState = "sent";
  if (raw.state === "pending" || raw.state === "sending" || raw.state === "failed") {
    msgState = raw.state === "sending" ? "failed" : raw.state;
  }

  return {
    id: String(raw.id || raw.clientMsgId || uid()),
    clientMsgId: raw.clientMsgId ? String(raw.clientMsgId) : "",
    senderId: String(raw.senderId || ""),
    name: String(raw.name || "someone").slice(0, 24),
    avatar: String(raw.avatar || "☁️").slice(0, 8),
    text,
    attachment,
    reactions: sanitizeReactions(raw.reactions),
    ts: Number(raw.ts) || Date.now(),
    mine: raw.senderId === state.clientId,
    state: msgState,
    loaded: false,
    file: null
  };
}

function findMessageById(id) {
  return messages.find((message) => message.id === id || message.clientMsgId === id) || null;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function findRow(message) {
  if (!ui.messageList) return null;
  let row = ui.messageList.querySelector('[data-id="' + cssEscape(message.id) + '"]');
  if (!row && message.clientMsgId) {
    row = ui.messageList.querySelector('[data-client-msg-id="' + cssEscape(message.clientMsgId) + '"]');
  }
  return row;
}

/* ------------------------------------------------------------------ *
 *  cache
 * ------------------------------------------------------------------ */

function loadCachedMessages(room) {
  if (!room) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey(room)) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored
      .map((raw) => normalizeMessage(raw, true))
      .filter(Boolean)
      .map((message) => ({ ...message, state: message.state === "sent" ? "sent" : "failed" }))
      .sort((a, b) => a.ts - b.ts)
      .slice(-MAX_CACHED);
  } catch (error) {
    return [];
  }
}

function saveMessageCache() {
  if (DEMO || !state.room) return;
  try {
    const plain = messages.slice(-MAX_CACHED).map((message) => ({
      id: message.id,
      clientMsgId: message.clientMsgId,
      senderId: message.senderId,
      name: message.name,
      avatar: message.avatar,
      text: message.text,
      attachment: message.attachment && !message.attachment.url.startsWith("blob:") ? message.attachment : null,
      reactions: message.reactions,
      ts: message.ts,
      state: message.state === "sent" ? "sent" : message.state
    }));
    localStorage.setItem(cacheKey(state.room), JSON.stringify(plain));
  } catch (error) {
    /* local history is a convenience, not a requirement */
  }
}

function trimMessages() {
  messages.sort((a, b) => a.ts - b.ts);
  if (messages.length > MAX_CACHED) messages = messages.slice(-MAX_CACHED);
}

/* ------------------------------------------------------------------ *
 *  scrolling
 * ------------------------------------------------------------------ */

function isNearBottom() {
  const el = ui.messages;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 90;
}

function scrollBottom(smooth) {
  requestAnimationFrame(() => {
    const behavior = smooth && !state.calm && !prefersReduced.matches ? "smooth" : "auto";
    ui.messages.scrollTo({ top: ui.messages.scrollHeight, behavior });
  });
}

function updateNewMessagesUI() {
  const show = unseenMessages && !isNearBottom() && !ui.chat.hidden;
  ui.newMessages.hidden = !show;
  ui.newMessages.dataset.visible = show ? "true" : "false";
}

/* ------------------------------------------------------------------ *
 *  rendering
 * ------------------------------------------------------------------ */

function buildDayDivider(timestamp) {
  return makeEl("div", "day-divider", dayLabel(timestamp));
}

function buildTapToLoad() {
  const button = makeEl("button", "media-load");
  button.type = "button";
  button.dataset.tapLoad = "";
  button.innerHTML = iconSvg("icon-download");
  button.appendChild(makeEl("span", "media-load__text", "tap to load"));
  return button;
}

function buildVoice(message, src) {
  const att = message.attachment;
  const voice = makeEl("div", "voice");
  voice.dataset.src = src;
  voice.dataset.duration = String(att.duration || 0);

  const play = makeEl("button", "voice__play");
  play.type = "button";
  play.dataset.voicePlay = "";
  play.setAttribute("aria-label", "Play voice note");
  play.innerHTML = iconSvg("icon-play");

  const body = makeEl("div", "voice__body");
  const track = makeEl("div", "voice__track");
  track.appendChild(makeEl("span", "voice__fill"));
  const time = makeEl("span", "voice__time", formatDuration(att.duration || 0));
  time.dataset.voiceTime = "";
  body.appendChild(track);
  body.appendChild(time);

  voice.appendChild(play);
  voice.appendChild(body);
  return voice;
}

function buildMedia(message) {
  const att = message.attachment;
  const wrap = makeEl("div", "message__media");
  const kind = mediaKind(att.type);
  wrap.classList.add("message__media--" + kind);

  if (!message.mine && !shouldAutoLoad(message) && !message.loaded) {
    wrap.appendChild(buildTapToLoad());
    return wrap;
  }

  const src = mediaUrl(att.url);

  if (kind === "image") {
    const img = document.createElement("img");
    img.src = src;
    img.alt = att.name || "photo";
    img.loading = "lazy";
    img.decoding = "async";
    img.className = "media-image";
    img.dataset.openMedia = "image";
    if (att.width) img.width = att.width;
    if (att.height) img.height = att.height;
    if (att.width && att.height) wrap.style.aspectRatio = att.width + " / " + att.height;
    wrap.appendChild(img);
  } else if (kind === "video") {
    const video = document.createElement("video");
    video.src = src;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.className = "media-video";
    if (att.width) video.width = att.width;
    if (att.height) video.height = att.height;
    if (state.mediaAutoplay && !message.mine) {
      video.autoplay = true;
      video.muted = true;
    }
    wrap.appendChild(video);
  } else if (kind === "audio") {
    wrap.appendChild(buildVoice(message, src));
  } else {
    const link = makeEl("a", "media-file");
    link.href = src;
    link.target = "_blank";
    link.rel = "noopener";
    link.appendChild(makeEl("span", "media-file__name", att.name));
    link.appendChild(makeEl("span", "media-file__size", formatBytes(att.size)));
    wrap.appendChild(link);
  }
  return wrap;
}

function buildReactions(message) {
  const wrap = makeEl("div", "message__reactions");
  const entries = message.reactions
    ? Object.keys(message.reactions)
      .map((emoji) => [emoji, message.reactions[emoji]])
      .filter((entry) => entry[1] && entry[1].length)
    : [];
  if (!entries.length) {
    wrap.hidden = true;
    return wrap;
  }
  for (const [emoji, ids] of entries) {
    const chip = makeEl("button", "reaction-chip");
    chip.type = "button";
    chip.dataset.emoji = emoji;
    if (ids.includes(state.clientId)) chip.classList.add("reaction-chip--mine");
    chip.appendChild(makeEl("span", "reaction-chip__emoji", emoji));
    chip.appendChild(makeEl("span", "reaction-chip__count", String(ids.length)));
    chip.setAttribute("aria-label", ids.length + " reacted " + emoji);
    wrap.appendChild(chip);
  }
  return wrap;
}

function buildMeta(message) {
  const meta = makeEl("div", "message__meta");
  if (state.timestamps && message.state !== "failed" && message.state !== "sending") {
    meta.appendChild(makeEl("span", "", formatTime(message.ts)));
  }
  if (message.state === "sending") meta.appendChild(makeEl("span", "", "uploading…"));
  if (message.state === "pending") meta.appendChild(makeEl("span", "", "sending…"));
  if (message.state === "failed") {
    if (state.timestamps) meta.appendChild(makeEl("span", "", formatTime(message.ts)));
    const retry = makeEl("button", "message__retry", "tap to retry");
    retry.type = "button";
    retry.dataset.retry = message.clientMsgId || message.id;
    meta.appendChild(retry);
  }
  return meta;
}

function buildBubble(message) {
  const bubble = makeEl("div", "message__bubble");
  bubble.dataset.copyTarget = message.id;
  if (message.attachment) {
    bubble.classList.add("message__bubble--media");
    bubble.appendChild(buildMedia(message));
  }
  if (message.text && message.text.trim()) {
    const text = makeEl("div", "message__text", message.text);
    bubble.appendChild(text);
  }
  if (!message.attachment) bubble.classList.add("message__bubble--text");
  return bubble;
}

function buildMessageRow(message, options) {
  const row = makeEl("div", "message message--" + (message.mine ? "mine" : "them"));
  row.dataset.id = message.id;
  if (message.clientMsgId) row.dataset.clientMsgId = message.clientMsgId;
  row.dataset.state = message.state;

  if (options.groupStart) row.classList.add("message--group-start");
  if (options.groupEnd) row.classList.add("message--group-end");
  if (options.animate) row.classList.add("message--new");

  if (!message.mine) {
    const avatar = avatarNode(
      message.avatar,
      "",
      "message__avatar" + (options.groupEnd ? "" : " message__avatar--ghost")
    );
    avatar.setAttribute("aria-hidden", "true");
    row.appendChild(avatar);
  }

  const stack = makeEl("div", "message__stack");
  if (!message.mine && options.groupStart) {
    stack.appendChild(makeEl("span", "message__name", peerName(message.name)));
  }
  stack.appendChild(buildBubble(message));
  const meta = buildMeta(message);
  if (meta.childNodes.length) stack.appendChild(meta);
  stack.appendChild(buildReactions(message));
  row.appendChild(stack);
  return row;
}

function renderMessages(options) {
  const settings = options || {};
  const nearBottom = isNearBottom();
  const previousTop = ui.messages.scrollTop;

  ui.messageList.textContent = "";
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const day = dateKey(message.ts);

    if (!previous || dateKey(previous.ts) !== day) {
      fragment.appendChild(buildDayDivider(message.ts));
    }

    const groupStart = !previous ||
      previous.senderId !== message.senderId ||
      dateKey(previous.ts) !== day;
    const groupEnd = !next ||
      next.senderId !== message.senderId ||
      dateKey(next.ts) !== day;

    fragment.appendChild(buildMessageRow(message, {
      groupStart,
      groupEnd,
      animate: newMessageIds.has(message.id)
    }));
  }

  ui.messageList.appendChild(fragment);
  ui.emptyState.hidden = messages.length > 0;

  if (voiceCurrent && !document.body.contains(voiceCurrent)) stopVoice();

  if (settings.forceScroll || nearBottom) {
    unseenMessages = false;
    scrollBottom(Boolean(settings.animate));
  } else {
    requestAnimationFrame(() => {
      ui.messages.scrollTop = previousTop;
    });
  }

  updateNewMessagesUI();

  if (newMessageIds.size) {
    setTimeout(() => {
      ui.messageList.querySelectorAll(".message--new").forEach((element) => {
        element.classList.remove("message--new");
      });
    }, 900);
  }
}

function updateRowState(message) {
  const row = findRow(message);
  if (!row) return;
  row.dataset.state = message.state;
  const stack = row.querySelector(".message__stack");
  if (!stack) return;
  const oldMeta = stack.querySelector(".message__meta");
  const fresh = buildMeta(message);
  if (oldMeta) {
    if (fresh.childNodes.length) stack.replaceChild(fresh, oldMeta);
    else oldMeta.remove();
  } else if (fresh.childNodes.length) {
    const reactions = stack.querySelector(".message__reactions");
    if (reactions) stack.insertBefore(fresh, reactions);
    else stack.appendChild(fresh);
  }
}

function updateReactionsInPlace(message) {
  const row = findRow(message);
  if (!row) return;
  const stack = row.querySelector(".message__stack");
  if (!stack) return;
  const old = stack.querySelector(".message__reactions");
  const fresh = buildReactions(message);
  if (old) {
    if (fresh.hidden) old.remove();
    else stack.replaceChild(fresh, old);
  } else if (!fresh.hidden) {
    stack.appendChild(fresh);
  }
}

/* ------------------------------------------------------------------ *
 *  media loading policy
 * ------------------------------------------------------------------ */

function shouldAutoLoad(message) {
  if (message.mine) return true;
  const att = message.attachment;
  if (att && /^(blob:|data:)/.test(att.url)) return true;
  if (state.mediaAutoDownload === "always") return true;
  if (state.mediaAutoDownload === "never") return false;
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ""))) return false;
  return true;
}

function refreshMediaVisibility() {
  for (const message of messages) message.loaded = false;
  renderMessages({ forceScroll: false, animate: false });
}

/* ------------------------------------------------------------------ *
 *  connection
 * ------------------------------------------------------------------ */

function setConnection(status, reason) {
  connectionState = status;
  if (reason) lastCloseReason = String(reason).slice(0, 120);
  refreshConnectionUI();
}

function connectionLabel() {
  if (connectionState === "online") {
    if (presenceCount > 1) return "you + " + (presenceCount - 1) + " here";
    if (presenceCount === 1) return "just you here";
    return "connected";
  }
  if (connectionState === "connecting") return "connecting…";
  return navigator.onLine ? "offline · retrying" : "offline · no wifi";
}

function refreshConnectionUI() {
  ui.connectionText.dataset.state = connectionState;
  ui.connectionLabel.textContent = connectionLabel();

  const showNotice = connectionState === "offline" && hasProfile() && !DEMO && !ui.chat.hidden;
  ui.offlineNotice.hidden = !showNotice;
  if (showNotice) {
    if (!navigator.onLine) {
      ui.offlineNoticeText.textContent = "you're offline — check wi-fi";
    } else if (lastCloseReason) {
      ui.offlineNoticeText.textContent = "server: " + lastCloseReason;
    } else {
      ui.offlineNoticeText.textContent = "the server is taking a nap";
    }
  }
}

function setPresence(count) {
  const parsed = Number(count);
  presenceCount = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  refreshConnectionUI();
}

function scheduleReconnect() {
  if (DEMO || !hasProfile() || !navigator.onLine) return;
  if (document.visibilityState === "hidden") return;
  clearTimeout(reconnectTimer);
  const delay = Math.min(15000, Math.round(900 * Math.pow(1.7, reconnectAttempt)));
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(connect, delay);
}

function connect() {
  clearTimeout(reconnectTimer);

  if (DEMO) {
    setConnection("online");
    setPresence(2);
    return;
  }
  if (!hasProfile()) {
    setConnection("offline");
    return;
  }

  const token = ++socketToken;
  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch (error) {
      /* ignore */
    }
    socket = null;
  }

  clearTyping();
  presenceCount = 0;

  if (!navigator.onLine) {
    lastCloseReason = "";
    setConnection("offline");
    return;
  }

  setConnection("connecting");
  lastCloseReason = "";

  let url;
  try {
    url = new URL(state.server);
    url.searchParams.set("room", state.room);
    url.searchParams.set("name", state.name);
    url.searchParams.set("avatar", state.avatar);
    url.searchParams.set("client", state.clientId);
  } catch (error) {
    setConnection("offline", "server address needs a little fix");
    return;
  }

  let ws;
  try {
    ws = new WebSocket(url.toString());
  } catch (error) {
    setConnection("offline", "could not open the server");
    scheduleReconnect();
    return;
  }

  socket = ws;

  ws.onopen = () => {
    if (token !== socketToken) return;
    reconnectAttempt = 0;
    lastCloseReason = "";
    setConnection("online");
  };
  ws.onmessage = (event) => {
    if (token !== socketToken || typeof event.data !== "string") return;
    handleServerMessage(event.data);
  };
  ws.onerror = () => {
    /* onclose handles the retry */
  };
  ws.onclose = (event) => {
    if (token !== socketToken) return;
    socket = null;
    presenceCount = 0;
    clearTyping();
    if (event && event.reason) lastCloseReason = event.reason;
    setConnection("offline");
    scheduleReconnect();
  };
}

function handleServerMessage(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    return;
  }
  if (!data || typeof data !== "object") return;

  if (data.type === "history") {
    mergeHistory(data.messages);
    if (data.presence !== undefined) setPresence(data.presence);
  } else if (data.type === "msg" && data.message) {
    receiveMessage(data.message);
  } else if (data.type === "presence") {
    setPresence(data.count);
  } else if (data.type === "typing") {
    handleTyping(data);
  } else if (data.type === "reaction" && data.messageId) {
    applyReactionUpdate(String(data.messageId), sanitizeReactions(data.reactions));
  } else if (data.type === "error") {
    handleServerError(data);
  }
}

/* ------------------------------------------------------------------ *
 *  history / receive
 * ------------------------------------------------------------------ */

function clearPendingTimer(clientMsgId) {
  if (!clientMsgId) return;
  const timer = pendingTimers.get(clientMsgId);
  if (timer) clearTimeout(timer);
  pendingTimers.delete(clientMsgId);
}

function setPendingTimer(clientMsgId) {
  clearPendingTimer(clientMsgId);
  const timer = setTimeout(() => {
    const message = messages.find((item) =>
      item.clientMsgId === clientMsgId && item.state === "pending"
    );
    pendingTimers.delete(clientMsgId);
    if (!message) return;
    message.state = "failed";
    saveMessageCache();
    updateRowState(message);
    showToast("still not sent — tap the message to retry");
  }, 12000);
  pendingTimers.set(clientMsgId, timer);
}

function mergeHistory(history) {
  const incoming = (Array.isArray(history) ? history : [])
    .map((raw) => normalizeMessage(raw, false))
    .filter(Boolean);

  const serverClientIds = new Set(incoming.map((message) => message.clientMsgId).filter(Boolean));
  const serverIds = new Set(incoming.map((message) => message.id));

  const local = messages.filter((message) => {
    if (serverIds.has(message.id)) return true;
    if (message.state !== "sent" && message.clientMsgId && serverClientIds.has(message.clientMsgId)) {
      clearPendingTimer(message.clientMsgId);
      return false;
    }
    return true;
  });

  const byId = new Map(local.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (message.clientMsgId) clearPendingTimer(message.clientMsgId);
    const existing = byId.get(message.id);
    byId.set(message.id, {
      ...(existing || {}),
      ...message,
      file: existing ? existing.file : null,
      state: "sent"
    });
  }

  messages = Array.from(byId.values());
  trimMessages();
  saveMessageCache();
  renderMessages({ forceScroll: false, animate: false });
}

function receiveMessage(raw) {
  const message = normalizeMessage(raw, false);
  if (!message) return;
  if (messages.some((item) => item.id === message.id)) return;

  if (message.clientMsgId) clearPendingTimer(message.clientMsgId);
  if (message.clientMsgId) {
    messages = messages.filter((item) =>
      !(item.clientMsgId === message.clientMsgId && item.state !== "sent")
    );
  }

  removeTyping(message.senderId);

  const wasNear = isNearBottom();
  messages.push(message);
  trimMessages();
  saveMessageCache();
  newMessageIds.add(message.id);

  const shouldScroll = message.mine || wasNear;
  renderMessages({ forceScroll: shouldScroll, animate: true });

  if (!message.mine) {
    if (!wasNear) {
      unseenMessages = true;
      updateNewMessagesUI();
    }
    if (document.visibilityState === "visible") playSound("receive");
  }
}

/* ------------------------------------------------------------------ *
 *  sending
 * ------------------------------------------------------------------ */

function sendSocket(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    return false;
  }
}

function sendMessage(rawText) {
  const text = String(rawText || "").trim().slice(0, 2000);
  if (!text) return;

  const clientMsgId = uid();
  const message = {
    id: "local-" + clientMsgId,
    clientMsgId,
    senderId: state.clientId,
    name: state.name,
    avatar: state.avatar,
    text,
    attachment: null,
    reactions: {},
    ts: Date.now(),
    mine: true,
    state: "pending",
    loaded: true,
    file: null
  };

  messages.push(message);
  trimMessages();
  saveMessageCache();
  newMessageIds.add(message.id);
  renderMessages({ forceScroll: true, animate: true });

  stopLocalTyping();
  playSound("send");
  haptic(8);
  floatHearts();

  if (DEMO) {
    handleDemoSend(clientMsgId);
    return;
  }

  if (!sendSocket({ type: "send", clientMsgId, text })) {
    message.state = "failed";
    saveMessageCache();
    updateRowState(message);
    showToast("not connected — tap the message to retry");
    return;
  }
  setPendingTimer(clientMsgId);
}

function uploadFile(file) {
  const base = serverHttpBase();
  if (!base) return Promise.reject(new Error("add your server address first"));
  return fetch(base + "/upload", {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-filename": encodeURIComponent(file.name || "file")
    },
    body: file
  }).then((response) => {
    if (!response.ok) {
      return response.json().catch(() => ({})).then((detail) => {
        throw new Error(detail.error || ("upload failed (" + response.status + ")"));
      });
    }
    return response.json();
  }).then((data) => {
    if (!data || !data.url) throw new Error("upload failed");
    return data;
  });
}

function mediaMeta(file, kind) {
  return new Promise((resolve) => {
    if (kind === "image") {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      img.src = url;
      return;
    }
    if (kind === "video") {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: isFinite(video.duration) ? video.duration : 0
        });
        URL.revokeObjectURL(url);
      };
      video.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      video.src = url;
      return;
    }
    resolve({});
  });
}

async function sendMediaFile(file, options) {
  const settings = options || {};
  const kind = settings.kind || mediaKind(file.type);
  const meta = kind === "audio"
    ? { duration: settings.duration || 0 }
    : await mediaMeta(file, kind);

  const clientMsgId = uid();
  const previewUrl = kind === "file" ? "" : URL.createObjectURL(file);
  const attachment = {
    url: previewUrl,
    type: file.type || (kind === "audio" ? "audio/webm" : "application/octet-stream"),
    name: file.name || (kind === "audio" ? "voice-note.webm" : "file"),
    size: file.size,
    width: meta.width || 0,
    height: meta.height || 0,
    duration: meta.duration || 0
  };

  const message = {
    id: "local-" + clientMsgId,
    clientMsgId,
    senderId: state.clientId,
    name: state.name,
    avatar: state.avatar,
    text: "",
    attachment,
    reactions: {},
    ts: Date.now(),
    mine: true,
    state: DEMO ? "pending" : "sending",
    loaded: true,
    file
  };

  messages.push(message);
  trimMessages();
  saveMessageCache();
  newMessageIds.add(message.id);
  renderMessages({ forceScroll: true, animate: true });
  playSound("send");
  haptic(8);

  if (DEMO) {
    handleDemoMedia(clientMsgId);
    return;
  }
  if (!serverHttpBase()) {
    message.state = "failed";
    saveMessageCache();
    updateRowState(message);
    showToast("add your server address to send media");
    return;
  }
  await uploadAndSend(message, file, attachment, clientMsgId);
}

async function uploadAndSend(message, file, attachment, clientMsgId) {
  try {
    const uploaded = await uploadFile(file);
    message.attachment = {
      url: uploaded.url,
      type: uploaded.type || attachment.type,
      name: uploaded.name || attachment.name,
      size: uploaded.size || attachment.size,
      width: attachment.width,
      height: attachment.height,
      duration: attachment.duration
    };
    if (attachment.url && attachment.url.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(attachment.url);
      } catch (error) {
        /* ignore */
      }
    }
    message.file = null;
    message.state = "pending";
    updateRowState(message);
    saveMessageCache();

    if (!sendSocket({ type: "send", clientMsgId, text: "", attachment: message.attachment })) {
      message.state = "failed";
      saveMessageCache();
      updateRowState(message);
      showToast("not connected — tap to retry");
      return;
    }
    setPendingTimer(clientMsgId);
  } catch (error) {
    message.state = "failed";
    saveMessageCache();
    updateRowState(message);
    showToast(String((error && error.message) || "could not send that").slice(0, 120));
  }
}

function retryMessage(clientMsgId) {
  const message = messages.find((item) => item.clientMsgId === clientMsgId);
  if (!message || message.state !== "failed") return;

  if (message.file) {
    message.state = "sending";
    saveMessageCache();
    updateRowState(message);
    uploadAndSend(message, message.file, message.attachment, clientMsgId);
    return;
  }

  if (DEMO) {
    message.state = "pending";
    renderMessages({ forceScroll: true, animate: false });
    handleDemoSend(clientMsgId);
    return;
  }

  const payload = { type: "send", clientMsgId, text: message.text };
  if (message.attachment) payload.attachment = message.attachment;
  if (!sendSocket(payload)) {
    showToast("still offline — try again in a moment");
    return;
  }
  message.state = "pending";
  saveMessageCache();
  updateRowState(message);
  setPendingTimer(clientMsgId);
  showToast("trying again…");
}

function handleServerError(data) {
  const clientMsgId = data.clientMsgId ? String(data.clientMsgId) : "";
  if (clientMsgId) {
    clearPendingTimer(clientMsgId);
    const message = messages.find((item) => item.clientMsgId === clientMsgId);
    if (message) {
      message.state = "failed";
      saveMessageCache();
      updateRowState(message);
    }
  }
  showToast(String(data.message || "the server said no").slice(0, 140));
}

/* ------------------------------------------------------------------ *
 *  reactions
 * ------------------------------------------------------------------ */

function toggleReaction(message, emoji) {
  if (!message || !emoji) return;
  if (message.id.startsWith("local-")) {
    showToast("hang on, still sending");
    return;
  }
  message.reactions = message.reactions || {};
  const list = message.reactions[emoji] ? message.reactions[emoji].slice() : [];
  const index = list.indexOf(state.clientId);
  if (index >= 0) list.splice(index, 1);
  else list.push(state.clientId);
  if (list.length) message.reactions[emoji] = list;
  else delete message.reactions[emoji];

  updateReactionsInPlace(message);
  saveMessageCache();
  haptic(5);

  if (!DEMO) sendSocket({ type: "react", messageId: message.id, emoji });
}

function applyReactionUpdate(messageId, reactions) {
  const message = findMessageById(messageId);
  if (!message) return;
  message.reactions = reactions;
  updateReactionsInPlace(message);
  saveMessageCache();
}

function showReactionBar(message, anchor) {
  reactionTarget = message;
  ui.reactionBar.innerHTML = "";
  for (const emoji of REACTIONS) {
    const button = makeEl("button", "reaction-option", emoji);
    button.type = "button";
    button.dataset.emoji = emoji;
    button.setAttribute("aria-label", "React with " + emoji);
    ui.reactionBar.appendChild(button);
  }
  if (message.text && message.text.trim()) {
    const copy = makeEl("button", "reaction-option reaction-option--copy");
    copy.type = "button";
    copy.dataset.action = "copy";
    copy.innerHTML = iconSvg("icon-copy") + "<span>copy</span>";
    ui.reactionBar.appendChild(copy);
  }
  ui.reactionBar.hidden = false;
  ui.reactionBar.dataset.open = "true";
  positionReactionBar(anchor);
  haptic(5);
}

function positionReactionBar(anchor) {
  const rect = anchor.getBoundingClientRect();
  const bar = ui.reactionBar;
  const barRect = bar.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - barRect.width / 2;
  left = clamp(left, 8, Math.max(8, window.innerWidth - barRect.width - 8));
  let top = rect.top - barRect.height - 10;
  if (top < 8) top = rect.bottom + 10;
  top = clamp(top, 8, Math.max(8, window.innerHeight - barRect.height - 8));
  bar.style.left = left + "px";
  bar.style.top = top + "px";
}

function hideReactionBar() {
  if (ui.reactionBar.hidden) return;
  reactionTarget = null;
  ui.reactionBar.hidden = true;
  delete ui.reactionBar.dataset.open;
}

function copyMessage(message) {
  if (message.text && message.text.trim()) {
    copyToClipboard(message.text);
    showToast("message copied");
  } else if (message.attachment) {
    copyToClipboard(mediaUrl(message.attachment.url));
    showToast("link copied");
  }
  haptic(5);
}

/* ------------------------------------------------------------------ *
 *  media viewer
 * ------------------------------------------------------------------ */

function openMediaViewer(attachment) {
  if (!attachment) return;
  const kind = mediaKind(attachment.type);
  ui.mediaViewerStage.textContent = "";
  if (kind === "image") {
    const img = document.createElement("img");
    img.src = mediaUrl(attachment.url);
    img.alt = attachment.name || "photo";
    ui.mediaViewerStage.appendChild(img);
  } else if (kind === "video") {
    const video = document.createElement("video");
    video.src = mediaUrl(attachment.url);
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    ui.mediaViewerStage.appendChild(video);
  } else if (kind === "audio") {
    const audio = document.createElement("audio");
    audio.src = mediaUrl(attachment.url);
    audio.controls = true;
    audio.autoplay = true;
    ui.mediaViewerStage.appendChild(audio);
  }
  ui.mediaViewer.hidden = false;
  ui.mediaViewer.dataset.open = "true";
}

function closeMediaViewer() {
  ui.mediaViewerStage.querySelectorAll("video, audio").forEach((media) => {
    try {
      media.pause();
    } catch (error) {
      /* ignore */
    }
  });
  ui.mediaViewerStage.textContent = "";
  ui.mediaViewer.hidden = true;
  delete ui.mediaViewer.dataset.open;
}

/* ------------------------------------------------------------------ *
 *  voice playback
 * ------------------------------------------------------------------ */

function ensureVoiceAudio() {
  if (voiceAudio) return voiceAudio;
  voiceAudio = new Audio();
  voiceAudio.preload = "metadata";
  voiceAudio.addEventListener("timeupdate", () => {
    if (!voiceCurrent) return;
    const fill = voiceCurrent.querySelector(".voice__fill");
    const duration = voiceAudio.duration || 0;
    if (fill && duration) fill.style.width = Math.min(100, (voiceAudio.currentTime / duration) * 100) + "%";
    const time = voiceCurrent.querySelector("[data-voice-time]");
    if (time) time.textContent = formatDuration(voiceAudio.currentTime);
  });
  voiceAudio.addEventListener("ended", stopVoice);
  voiceAudio.addEventListener("error", () => {
    if (voiceCurrent) showToast("could not play that one");
    stopVoice();
  });
  return voiceAudio;
}

function setVoiceButton(button, playing) {
  if (button) button.innerHTML = iconSvg(playing ? "icon-pause" : "icon-play");
}

function stopVoice() {
  if (voiceAudio) {
    try {
      voiceAudio.pause();
    } catch (error) {
      /* ignore */
    }
  }
  if (voiceCurrent) {
    voiceCurrent.classList.remove("is-playing");
    setVoiceButton(voiceCurrent.querySelector("[data-voice-play]"), false);
    const time = voiceCurrent.querySelector("[data-voice-time]");
    if (time) time.textContent = formatDuration(voiceCurrent.dataset.duration || 0);
    const fill = voiceCurrent.querySelector(".voice__fill");
    if (fill) fill.style.width = "0";
    voiceCurrent = null;
  }
}

function toggleVoice(button) {
  const voice = button.closest(".voice");
  if (!voice) return;
  const audio = ensureVoiceAudio();

  if (voice.classList.contains("is-playing")) {
    audio.pause();
    stopVoice();
    return;
  }

  if (voiceCurrent && voiceCurrent !== voice) stopVoice();
  if (audio.src !== voice.dataset.src) {
    audio.src = voice.dataset.src;
    audio.currentTime = 0;
  }
  voiceCurrent = voice;
  voice.classList.add("is-playing");
  setVoiceButton(button, true);
  audio.play().catch(() => {
    showToast("could not play that one");
    stopVoice();
  });
}

/* ------------------------------------------------------------------ *
 *  recording
 * ------------------------------------------------------------------ */

window.MochiMicPermission = function (status) {
  micGranted = status === "granted";
  if (micResolve) {
    micResolve(micGranted);
    micResolve = null;
  }
};

function ensureMicPermission() {
  if (!window.MochiAndroid || typeof window.MochiAndroid.requestMic !== "function") {
    return Promise.resolve(true);
  }
  if (micGranted === true) return Promise.resolve(true);
  return new Promise((resolve) => {
    micResolve = resolve;
    try {
      window.MochiAndroid.requestMic();
    } catch (error) {
      resolve(false);
      return;
    }
    setTimeout(() => {
      if (micResolve) {
        micResolve(false);
        micResolve = null;
      }
    }, 8000);
  });
}

function pickAudioMime() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of options) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

async function startRecording() {
  if (mediaRecorder) return;
  const allowed = await ensureMicPermission();
  if (!allowed) {
    showToast("microphone permission needed");
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("this device can't record audio");
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    showToast("could not reach the microphone");
    return;
  }

  recordStream = stream;
  recordChunks = [];
  recordCancelled = false;

  try {
    const mime = pickAudioMime();
    mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (error) {
    try {
      mediaRecorder = new MediaRecorder(stream);
    } catch (inner) {
      releaseRecordStream();
      showToast("recording isn't available here");
      return;
    }
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size) recordChunks.push(event.data);
  };
  mediaRecorder.onstop = finishRecording;

  mediaRecorder.start();
  recordStartedAt = Date.now();
  ui.recorderBar.hidden = false;
  updateRecordTime();
  recordTimer = setInterval(updateRecordTime, 200);
  recordAutoStop = setTimeout(() => stopRecording(false), RECORD_MAX_SECONDS * 1000);
  haptic(6);
}

function updateRecordTime() {
  const seconds = (Date.now() - recordStartedAt) / 1000;
  ui.recorderTime.textContent = formatDuration(seconds);
  if (seconds >= RECORD_MAX_SECONDS) stopRecording(false);
}

function releaseRecordStream() {
  if (recordStream) {
    recordStream.getTracks().forEach((track) => track.stop());
    recordStream = null;
  }
}

function stopRecording(cancelled) {
  recordCancelled = Boolean(cancelled);
  clearInterval(recordTimer);
  clearTimeout(recordAutoStop);
  recordTimer = null;
  recordAutoStop = null;
  ui.recorderBar.hidden = true;
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch (error) {
      releaseRecordStream();
      mediaRecorder = null;
    }
  } else {
    releaseRecordStream();
    mediaRecorder = null;
  }
}

function finishRecording() {
  const cancelled = recordCancelled;
  const duration = Math.max(1, Math.round((Date.now() - recordStartedAt) / 1000));
  const type = (mediaRecorder && mediaRecorder.mimeType) || "audio/webm";
  const chunks = recordChunks.slice();
  mediaRecorder = null;
  recordChunks = [];
  releaseRecordStream();

  if (cancelled || !chunks.length) return;

  const ext = type.indexOf("mp4") >= 0 ? "m4a" : type.indexOf("ogg") >= 0 ? "ogg" : "webm";
  const blob = new Blob(chunks, { type: type.split(";")[0] || "audio/webm" });
  const file = new File([blob], "voice-" + Date.now() + "." + ext, { type: blob.type });
  sendMediaFile(file, { kind: "audio", duration });
}

/* ------------------------------------------------------------------ *
 *  typing
 * ------------------------------------------------------------------ */

function clearTyping() {
  for (const user of typingUsers.values()) {
    if (user.timer) clearTimeout(user.timer);
  }
  typingUsers.clear();
  updateTypingIndicator();
}

function removeTyping(senderId) {
  const user = typingUsers.get(senderId);
  if (user && user.timer) clearTimeout(user.timer);
  typingUsers.delete(senderId);
  updateTypingIndicator();
}

function handleTyping(data) {
  if (!data || !data.senderId || data.senderId === state.clientId) return;
  if (!state.showTyping) return;
  const senderId = String(data.senderId);
  const existing = typingUsers.get(senderId);
  if (existing && existing.timer) clearTimeout(existing.timer);

  if (!data.on) {
    typingUsers.delete(senderId);
    updateTypingIndicator();
    return;
  }

  const timer = setTimeout(() => {
    typingUsers.delete(senderId);
    updateTypingIndicator();
  }, 3500);

  typingUsers.set(senderId, {
    name: peerName(String(data.name || "someone")),
    timer
  });
  updateTypingIndicator();
}

function updateTypingIndicator() {
  const users = Array.from(typingUsers.values());
  if (!users.length || !state.showTyping) {
    ui.typing.textContent = "";
    ui.typing.dataset.visible = "false";
    return;
  }
  const copy = users.length === 1
    ? users[0].name + " is typing"
    : users[0].name + " + " + (users.length - 1) + " are typing";
  ui.typing.textContent = copy;

  const dots = makeEl("span", "typing__dots");
  dots.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index += 1) dots.appendChild(makeEl("i"));
  ui.typing.appendChild(dots);
  ui.typing.dataset.visible = "true";
}

function sendTyping(on) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  sendSocket({ type: "typing", on: Boolean(on) });
}

function stopLocalTyping() {
  clearTimeout(typingStopTimer);
  lastTypingSentAt = 0;
  sendTyping(false);
}

/* ------------------------------------------------------------------ *
 *  composer
 * ------------------------------------------------------------------ */

function handleComposerInput() {
  const hasText = Boolean(ui.messageInput.value.trim());
  ui.sendBtn.disabled = !hasText;
  resizeInput();

  if (!hasText) {
    stopLocalTyping();
    return;
  }

  const now = Date.now();
  if (now - lastTypingSentAt > 1200) {
    lastTypingSentAt = now;
    sendTyping(true);
  }
  clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(() => {
    lastTypingSentAt = 0;
    sendTyping(false);
  }, 1600);
}

function resizeInput() {
  if (!ui.messageInput) return;
  ui.messageInput.style.height = "auto";
  ui.messageInput.style.height = Math.min(ui.messageInput.scrollHeight, 120) + "px";
}

function handleComposerSubmit(event) {
  event.preventDefault();
  const text = ui.messageInput.value;
  if (!text.trim()) return;

  ui.messageInput.value = "";
  ui.sendBtn.disabled = true;
  resizeInput();
  sendMessage(text);

  if (!DEMO) ui.messageInput.focus({ preventScroll: true });
}

function handleMediaSelection(input) {
  const files = Array.from(input.files || []);
  input.value = "";
  if (!files.length) return;
  (async () => {
    for (const file of files) {
      await sendMediaFile(file);
    }
  })();
}

/* ------------------------------------------------------------------ *
 *  events
 * ------------------------------------------------------------------ */

function bindChatEvents() {
  ui.composer.addEventListener("submit", handleComposerSubmit);
  ui.messageInput.addEventListener("input", handleComposerInput);
  ui.messageInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    if (!state.sendOnEnter) return;
    event.preventDefault();
    if (ui.messageInput.value.trim()) ui.composer.requestSubmit();
  });

  ui.attachBtn.addEventListener("click", () => ui.mediaInput.click());
  ui.cameraBtn.addEventListener("click", () => ui.cameraInput.click());
  ui.micBtn.addEventListener("click", () => startRecording());

  let selfieTimer = null;
  const startSelfiePress = () => {
    clearTimeout(selfieTimer);
    selfieTimer = setTimeout(() => {
      selfieTimer = null;
      ui.selfieInput.click();
    }, 480);
  };
  const cancelSelfiePress = () => clearTimeout(selfieTimer);
  ui.cameraBtn.addEventListener("pointerdown", startSelfiePress);
  ui.cameraBtn.addEventListener("pointerup", cancelSelfiePress);
  ui.cameraBtn.addEventListener("pointerleave", cancelSelfiePress);
  ui.cameraBtn.addEventListener("pointercancel", cancelSelfiePress);

  ui.mediaInput.addEventListener("change", () => handleMediaSelection(ui.mediaInput));
  ui.cameraInput.addEventListener("change", () => handleMediaSelection(ui.cameraInput));
  ui.selfieInput.addEventListener("change", () => handleMediaSelection(ui.selfieInput));

  ui.recorderCancel.addEventListener("click", () => stopRecording(true));
  ui.recorderSend.addEventListener("click", () => stopRecording(false));

  ui.mediaViewerClose.addEventListener("click", closeMediaViewer);
  ui.mediaViewer.addEventListener("click", (event) => {
    if (event.target === ui.mediaViewer) closeMediaViewer();
  });

  ui.reactionBar.addEventListener("click", (event) => {
    const option = event.target.closest(".reaction-option");
    if (!option) return;
    const message = reactionTarget;
    if (option.dataset.action === "copy") {
      if (message) copyMessage(message);
    } else if (option.dataset.emoji && message) {
      toggleReaction(message, option.dataset.emoji);
    }
    hideReactionBar();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!ui.reactionBar.hidden && !ui.reactionBar.contains(event.target)) hideReactionBar();
  }, true);
  ui.messages.addEventListener("scroll", hideReactionBar, { passive: true });
  window.addEventListener("resize", () => hideReactionBar());

  ui.messages.addEventListener("scroll", () => {
    if (isNearBottom() && unseenMessages) {
      unseenMessages = false;
      updateNewMessagesUI();
    }
  }, { passive: true });

  ui.newMessages.addEventListener("click", () => {
    unseenMessages = false;
    scrollBottom(true);
    updateNewMessagesUI();
  });

  ui.messageList.addEventListener("click", (event) => {
    const retry = event.target.closest("[data-retry]");
    if (retry) {
      retryMessage(retry.dataset.retry);
      return;
    }
    const loadButton = event.target.closest("[data-tap-load]");
    if (loadButton) {
      const row = loadButton.closest(".message");
      const message = row ? findMessageById(row.dataset.id) : null;
      if (message) {
        message.loaded = true;
        renderMessages({ forceScroll: false, animate: false });
      }
      return;
    }
    const voiceButton = event.target.closest("[data-voice-play]");
    if (voiceButton) {
      toggleVoice(voiceButton);
      return;
    }
    const chip = event.target.closest(".reaction-chip");
    if (chip) {
      const row = chip.closest(".message");
      const message = row ? findMessageById(row.dataset.id) : null;
      if (message) toggleReaction(message, chip.dataset.emoji);
      return;
    }
    const media = event.target.closest("[data-open-media]");
    if (media) {
      const row = media.closest(".message");
      const message = row ? findMessageById(row.dataset.id) : null;
      if (message && message.attachment) openMediaViewer(message.attachment);
    }
  });

  let pressTimer = null;
  let pressStart = null;
  let pressRow = null;
  let longPressed = false;

  const cancelPress = () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    pressStart = null;
    pressRow = null;
  };

  ui.messageList.addEventListener("pointerdown", (event) => {
    const target = event.target.closest(".message__bubble");
    if (!target) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const row = target.closest(".message");
    if (!row) return;
    cancelPress();
    pressStart = { x: event.clientX, y: event.clientY };
    pressRow = row;
    longPressed = false;
    pressTimer = setTimeout(() => {
      longPressed = true;
      const message = findMessageById(row.dataset.id);
      if (message) showReactionBar(message, row);
      pressTimer = null;
    }, 480);
  });

  window.addEventListener("pointermove", (event) => {
    if (!pressStart) return;
    if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10) cancelPress();
  }, { passive: true });

  window.addEventListener("pointerup", (event) => {
    if (pressRow && !longPressed) {
      // no-op tap
    }
    cancelPress();
  });
  window.addEventListener("pointercancel", cancelPress);

  ui.messageList.addEventListener("contextmenu", (event) => {
    const bubble = event.target.closest(".message__bubble");
    if (!bubble) return;
    event.preventDefault();
    const row = bubble.closest(".message");
    const message = row ? findMessageById(row.dataset.id) : null;
    if (message) showReactionBar(message, row);
  });

  ui.retryBtn.addEventListener("click", () => {
    reconnectAttempt = 0;
    connect();
  });
  ui.shareBtn.addEventListener("click", shareRoom);

  window.addEventListener("online", () => {
    reconnectAttempt = 0;
    if (hasProfile() && !DEMO) connect();
  });

  window.addEventListener("offline", () => {
    socketToken += 1;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch (error) {
        /* ignore */
      }
      socket = null;
    }
    clearTimeout(reconnectTimer);
    presenceCount = 0;
    clearTyping();
    setConnection("offline");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (hasProfile() && !DEMO && (!socket || socket.readyState > 1)) {
        reconnectAttempt = 0;
        connect();
      }
    } else {
      clearTimeout(reconnectTimer);
    }
  });

  window.addEventListener("beforeunload", () => {
    socketToken += 1;
    if (socket) {
      socket.onclose = null;
      try {
        socket.close();
      } catch (error) {
        /* ignore */
      }
    }
  });

  window.addEventListener("resize", resizeInput);

  document.fonts.ready.then(() => {
    if (isNearBottom()) scrollBottom(false);
  });
}

/* ------------------------------------------------------------------ *
 *  demo
 * ------------------------------------------------------------------ */

const DEMO_ART = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#f6e7df"/><stop offset="1" stop-color="#c4623f"/></linearGradient></defs>' +
  '<rect width="360" height="240" fill="url(#g)"/>' +
  '<circle cx="118" cy="118" r="52" fill="#fffdf9" opacity="0.85"/>' +
  '<text x="118" y="132" font-family="Georgia, serif" font-size="30" fill="#2b2723" text-anchor="middle">mochi</text>' +
  '<text x="250" y="150" font-family="Georgia, serif" font-size="16" fill="#fffdf9" text-anchor="middle">a soft little</text>' +
  '<text x="250" y="172" font-family="Georgia, serif" font-size="16" fill="#fffdf9" text-anchor="middle">corner of the web</text>' +
  "</svg>"
);

function seedDemoMessages() {
  const now = Date.now();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(21, 12, 0, 0);
  const y = yesterday.getTime();

  const raw = [
    { from: "friend", text: "i found us a tiny corner of the internet", ts: y },
    { from: "me", text: "a room just for two?", ts: y + 60000 },
    { from: "friend", text: "mhm. no ads, no noise. just us 🍡", ts: y + 120000 },
    { from: "me", text: "okay but why is it so cute", ts: now - 39 * 60000 },
    { from: "friend", text: "because you're in it ♡", ts: now - 36 * 60000 },
    { from: "me", text: "stop it 🙈", ts: now - 23 * 60000 },
    { from: "friend", text: "look what i made", ts: now - 22 * 60000, image: true },
    { from: "friend", text: "what should we talk about tonight?", ts: now - 7 * 60000 }
  ];

  return raw.map((message, index) => normalizeMessage({
    id: "demo-" + index,
    senderId: message.from === "me" ? state.clientId : "demo-friend",
    name: message.from === "me" ? state.name : "matcha",
    avatar: message.from === "me" ? state.avatar : "🍵",
    text: message.text,
    ts: message.ts,
    attachment: message.image ? {
      url: DEMO_ART, type: "image/svg+xml", name: "little-corner.svg",
      size: 2048, width: 360, height: 240, duration: 0
    } : null
  }, false)).filter(Boolean);
}

function peerName(fallback) {
  return state.peerName || fallback || "them";
}

function handleDemoSend(clientMsgId) {
  setTimeout(() => {
    const message = messages.find((item) => item.clientMsgId === clientMsgId);
    if (!message) return;
    message.state = "sent";
    saveMessageCache();
    updateRowState(message);
  }, 320);

  clearTimeout(demoTypingTimer);
  demoTypingTimer = setTimeout(() => {
    if (!state.showTyping) return;
    typingUsers.set("demo-friend", { name: peerName("matcha"), timer: null });
    updateTypingIndicator();
  }, 650);

  setTimeout(() => {
    typingUsers.delete("demo-friend");
    updateTypingIndicator();
    const reply = DEMO_REPLIES[demoReplyIndex % DEMO_REPLIES.length];
    demoReplyIndex += 1;
    receiveMessage({
      id: "demo-reply-" + uid(),
      senderId: "demo-friend",
      name: "matcha",
      avatar: "🍵",
      text: reply,
      ts: Date.now()
    });
  }, 1750);
}

function handleDemoMedia(clientMsgId) {
  setTimeout(() => {
    const message = messages.find((item) => item.clientMsgId === clientMsgId);
    if (!message) return;
    message.state = "sent";
    saveMessageCache();
    updateRowState(message);
  }, 420);

  setTimeout(() => {
    receiveMessage({
      id: "demo-media-reply-" + uid(),
      senderId: "demo-friend",
      name: "matcha",
      avatar: "🍵",
      text: "ooo that's so pretty 🍓",
      ts: Date.now()
    });
  }, 1400);
}
