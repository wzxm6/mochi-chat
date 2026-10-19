"use strict";

/* ------------------------------------------------------------------ *
 *  constants
 * ------------------------------------------------------------------ */

const THEMES = [
  {
    id: "paper", name: "warm paper", dark: false,
    bg: "#f4f1ea", bg2: "#ece6db", surface: "#ffffff", surface2: "#f8f5ef",
    ink: "#2b2723", ink2: "#6b6259", ink3: "#9a9187", line: "#e3dccf", accent: "#c4623f"
  },
  {
    id: "sage", name: "soft sage", dark: false,
    bg: "#eef1ea", bg2: "#e2e8de", surface: "#ffffff", surface2: "#f5f8f3",
    ink: "#26302a", ink2: "#5c6a60", ink3: "#8c9a90", line: "#d6dfd3", accent: "#5e8c6a"
  },
  {
    id: "clay", name: "fired clay", dark: false,
    bg: "#f3ede7", bg2: "#ebe0d6", surface: "#ffffff", surface2: "#f8f2ec",
    ink: "#312721", ink2: "#6e5f53", ink3: "#9e8e80", line: "#e2d5c8", accent: "#b07a4e"
  },
  {
    id: "slate", name: "quiet slate", dark: false,
    bg: "#eef1f4", bg2: "#e2e7ec", surface: "#ffffff", surface2: "#f5f8fa",
    ink: "#232a31", ink2: "#5b666f", ink3: "#8b969f", line: "#d7dee4", accent: "#5a7da6"
  },
  {
    id: "rose", name: "dusty rose", dark: false,
    bg: "#f6edee", bg2: "#efe1e3", surface: "#ffffff", surface2: "#faf3f4",
    ink: "#302426", ink2: "#6c5a5d", ink3: "#9c888b", line: "#e6d6d8", accent: "#b5697b"
  },
  {
    id: "mono", name: "graphite", dark: false,
    bg: "#f7f7f5", bg2: "#ededea", surface: "#ffffff", surface2: "#f3f3f0",
    ink: "#1f1f1d", ink2: "#5a5a56", ink3: "#8e8e88", line: "#dededa", accent: "#5b5b57"
  },
  {
    id: "ink", name: "warm ink", dark: true,
    bg: "#1e1b18", bg2: "#26221e", surface: "#292522", surface2: "#201d1a",
    ink: "#f2ede6", ink2: "#b9b0a6", ink3: "#877e74", line: "#3a342e", accent: "#d08a5f"
  },
  {
    id: "night", name: "deep night", dark: true,
    bg: "#171a1e", bg2: "#1e2329", surface: "#20252b", surface2: "#191d22",
    ink: "#e8edf2", ink2: "#a6b0ba", ink3: "#737e88", line: "#2e353d", accent: "#7fa8d6"
  }
];

const ACCENTS = ["#c4623f", "#5e8c6a", "#b07a4e", "#5a7da6", "#8e6fb0", "#b5697b", "#3f8c8a", "#a8912f"];

const AVATARS = ["🍓", "🍡", "🐻", "🐰", "🐱", "🌸", "☁️", "⭐", "🍑", "🍵", "🧸", "🌙", "🐥", "🍒"];

const WORDS = ["peach", "mochi", "cloud", "bunny", "berry", "milk", "puddle", "comet", "petal", "toast", "honey", "sprout", "pillow", "sugar", "mint", "dawn"];

const DEMO_REPLIES = [
  "hehe you're my favourite notification ♡",
  "this is the softest corner of the internet",
  "okay but now i want a snack",
  "i'm sending you a tiny hug",
  "never leaving this little room",
  "can we stay here a while?"
];

const REACTIONS = ["♡", "😂", "😮", "😢", "🔥", "👍"];

const STUDIO_TOKENS = [
  { key: "bg", label: "background" },
  { key: "bg2", label: "background edge" },
  { key: "surface", label: "cards" },
  { key: "surface2", label: "card tint" },
  { key: "ink", label: "text" },
  { key: "ink2", label: "text soft" },
  { key: "ink3", label: "text faint" },
  { key: "line", label: "borders" },
  { key: "accent", label: "accent" }
];

const FONTS = [
  { id: "editorial", name: "editorial", display: '"Fraunces","Iowan Old Style",Georgia,serif', text: '"Nunito","Segoe UI",sans-serif' },
  { id: "friendly", name: "friendly", display: '"Fredoka","Trebuchet MS",sans-serif', text: '"Nunito","Segoe UI",sans-serif' },
  { id: "modern", name: "modern", display: '"Segoe UI",system-ui,sans-serif', text: '"Segoe UI",system-ui,sans-serif' }
];

const SETTINGS_KEY = "mochi.settings.v2";
const LEGACY_SETTINGS_KEY = "mochi.settings.v1";
const CACHE_PREFIX = "mochi.history.v1.";
const MAX_CACHED = 300;

const DEMO_PARAM = new URLSearchParams(location.search).get("demo");
const DEMO = DEMO_PARAM !== null;
const DEMO_EMPTY = DEMO_PARAM === "empty";
const prefersReduced = window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false, addEventListener() {} };

/* ------------------------------------------------------------------ *
 *  dom map
 * ------------------------------------------------------------------ */

const ui = {
  app: document.getElementById("app"),
  welcome: document.getElementById("welcomeScreen"),
  chat: document.getElementById("chatScreen"),

  setupForm: document.getElementById("setupForm"),
  setupName: document.getElementById("setupName"),
  setupAvatars: document.getElementById("setupAvatars"),
  setupRoom: document.getElementById("setupRoom"),
  rollRoom: document.getElementById("rollRoom"),
  setupServer: document.getElementById("setupServer"),
  setupError: document.getElementById("setupError"),

  headerAvatar: document.getElementById("headerAvatar"),
  roomTitle: document.getElementById("roomTitle"),
  connectionText: document.getElementById("connectionText"),
  connectionLabel: document.getElementById("connectionLabel"),
  shareBtn: document.getElementById("shareBtn"),
  settingsBtn: document.getElementById("settingsBtn"),

  offlineNotice: document.getElementById("offlineNotice"),
  offlineNoticeText: document.getElementById("offlineNoticeText"),
  retryBtn: document.getElementById("retryBtn"),

  messages: document.getElementById("messages"),
  emptyState: document.getElementById("emptyState"),
  messageList: document.getElementById("messageList"),
  newMessages: document.getElementById("newMessages"),
  typing: document.getElementById("typing"),

  composer: document.getElementById("composer"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  attachBtn: document.getElementById("attachBtn"),
  cameraBtn: document.getElementById("cameraBtn"),
  micBtn: document.getElementById("micBtn"),

  mediaInput: document.getElementById("mediaInput"),
  cameraInput: document.getElementById("cameraInput"),
  selfieInput: document.getElementById("selfieInput"),

  recorderBar: document.getElementById("recorderBar"),
  recorderTime: document.getElementById("recorderTime"),
  recorderCancel: document.getElementById("recorderCancel"),
  recorderSend: document.getElementById("recorderSend"),

  scrim: document.getElementById("scrim"),
  sheet: document.getElementById("settingsSheet"),
  sheetBody: document.querySelector(".sheet__body"),
  closeSettings: document.getElementById("closeSettings"),

  settingsName: document.getElementById("settingsName"),
  settingsAvatars: document.getElementById("settingsAvatars"),
  peerName: document.getElementById("settingsPeerName"),
  avatarUpload: document.getElementById("avatarUpload"),
  avatarClear: document.getElementById("avatarClear"),
  avatarPhotoPreview: document.getElementById("avatarPhotoPreview"),

  settingsRoom: document.getElementById("settingsRoom"),
  settingsServer: document.getElementById("settingsServer"),
  shareRoomBtn: document.getElementById("shareRoomBtn"),

  themeGrid: document.getElementById("themeGrid"),
  accentRow: document.getElementById("accentRow"),
  customAccent: document.getElementById("customAccent"),

  studioTokens: document.getElementById("studioTokens"),
  studioReset: document.getElementById("studioReset"),
  themeExport: document.getElementById("themeExport"),
  themeImportFile: document.getElementById("themeImportFile"),
  customCss: document.getElementById("customCss"),
  cssApply: document.getElementById("cssApply"),
  fontControl: document.getElementById("fontControl"),
  avatarShapeControl: document.getElementById("avatarShapeControl"),

  bgUpload: document.getElementById("bgUpload"),
  bgClear: document.getElementById("bgClear"),
  bgOpacity: document.getElementById("bgOpacity"),
  bgBlur: document.getElementById("bgBlur"),
  bgOpacityValue: document.getElementById("bgOpacityValue"),
  bgBlurValue: document.getElementById("bgBlurValue"),

  shapeControl: document.getElementById("shapeControl"),
  patternControl: document.getElementById("patternControl"),
  sizeControl: document.getElementById("sizeControl"),

  toggleTimestamps: document.getElementById("toggleTimestamps"),
  toggleSounds: document.getElementById("toggleSounds"),
  toggleHaptics: document.getElementById("toggleHaptics"),
  toggleCompact: document.getElementById("toggleCompact"),
  toggleCalm: document.getElementById("toggleCalm"),
  toggleTyping: document.getElementById("toggleTyping"),
  toggleReceipts: document.getElementById("toggleReceipts"),
  toggleEnter: document.getElementById("toggleEnter"),
  toggleGroup: document.getElementById("toggleGroup"),
  toggleAutoplay: document.getElementById("toggleAutoplay"),
  toggleNote: document.getElementById("toggleNote"),

  timeFormatControl: document.getElementById("timeFormatControl"),
  mediaAutoControl: document.getElementById("mediaAutoControl"),
  soundVolume: document.getElementById("soundVolume"),

  settingsExport: document.getElementById("settingsExport"),
  settingsImportFile: document.getElementById("settingsImportFile"),

  resetBtn: document.getElementById("resetBtn"),
  saveSettings: document.getElementById("saveSettings"),

  toast: document.getElementById("toast"),
  heartLayer: document.getElementById("heartLayer"),
  bgPhoto: document.getElementById("bgPhoto"),
  customCssStyle: document.getElementById("customCssStyle"),
  mediaViewer: document.getElementById("mediaViewer"),
  mediaViewerStage: document.getElementById("mediaViewerStage"),
  mediaViewerClose: document.getElementById("mediaViewerClose"),
  reactionBar: document.getElementById("reactionBar")
};

/* ------------------------------------------------------------------ *
 *  small helpers
 * ------------------------------------------------------------------ */

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "c-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeHex(value) {
  if (typeof value !== "string") return "";
  let hex = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : "";
}

function parseHex(hex) {
  const clean = safeHex(hex) || "#000000";
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  const part = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return "#" + part(r) + part(g) + part(b);
}

function mix(colorA, colorB, amount) {
  const a = parseHex(colorA);
  const b = parseHex(colorB);
  const t = clamp(amount, 0, 1);
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  );
}

function rgba(hex, alpha) {
  const c = parseHex(hex);
  return "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + alpha + ")";
}

function relativeLuminance(hex) {
  const c = parseHex(hex);
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function bestInk(backgrounds) {
  const candidates = ["#241F1B", "#FFFDF9"];
  let best = candidates[0];
  let bestScore = -1;
  for (const candidate of candidates) {
    let score = Infinity;
    for (const background of backgrounds) {
      score = Math.min(score, contrastRatio(candidate, background));
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function themeById(id) {
  return THEMES.find((theme) => theme.id === id) || THEMES[0];
}

function currentAccent() {
  return safeHex(state.accent) || themeById(state.theme).accent;
}

function resolvePalette() {
  const theme = themeById(state.theme);
  const overrides = state.customTheme && typeof state.customTheme === "object" ? state.customTheme : {};
  const pick = (key, fallback) => safeHex(overrides[key]) || fallback;
  return {
    id: theme.id,
    dark: theme.dark,
    bg: pick("bg", theme.bg),
    bg2: pick("bg2", theme.bg2),
    surface: pick("surface", theme.surface),
    surface2: pick("surface2", theme.surface2),
    ink: pick("ink", theme.ink),
    ink2: pick("ink2", theme.ink2),
    ink3: pick("ink3", theme.ink3),
    line: pick("line", theme.line),
    accent: pick("accent", currentAccent())
  };
}

/* ------------------------------------------------------------------ *
 *  state
 * ------------------------------------------------------------------ */

function defaultState() {
  return {
    name: "",
    avatar: "🍓",
    avatarImage: "",
    room: "",
    server: "",
    clientId: uid(),
    peerName: "",
    theme: "paper",
    accent: "",
    customTheme: {},
    customCss: "",
    bgImage: "",
    bgOpacity: 0.16,
    bgBlur: 2,
    pattern: "none",
    shape: "soft",
    textSize: "m",
    fontChoice: "editorial",
    noteTexture: true,
    avatarShape: "squircle",
    timestamps: true,
    timeFormat: "auto",
    groupMessages: true,
    showTyping: true,
    readReceipts: true,
    sendOnEnter: true,
    sounds: true,
    soundVolume: 0.5,
    haptics: true,
    mediaAutoplay: true,
    mediaAutoDownload: "wifi",
    compact: false,
    calm: false
  };
}

function demoState() {
  const base = defaultState();
  base.name = "strawberry";
  base.avatar = "🍓";
  base.room = "peach-4821";
  base.server = "ws://demo.local:8787";
  base.clientId = "demo-me";
  base.peerName = "matcha";

  const params = new URLSearchParams(location.search);
  const theme = params.get("theme");
  if (THEMES.some((item) => item.id === theme)) base.theme = theme;
  const accent = safeHex(params.get("accent"));
  if (accent) base.accent = accent;
  return base;
}

function loadState() {
  const base = defaultState();
  let stored = null;
  try {
    stored = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || localStorage.getItem(LEGACY_SETTINGS_KEY) || "null"
    );
  } catch (error) {
    stored = null;
  }
  if (!stored || typeof stored !== "object") return base;

  const merged = { ...base, ...stored };
  merged.name = String(merged.name || "").slice(0, 24);
  merged.avatar = String(merged.avatar || "🍓").slice(0, 400000);
  merged.avatarImage = typeof merged.avatarImage === "string" && merged.avatarImage.startsWith("data:image") ? merged.avatarImage : "";
  merged.room = normalizeRoom(merged.room);
  merged.server = normalizeServer(merged.server);
  merged.clientId = String(merged.clientId || base.clientId);
  merged.peerName = String(merged.peerName || "").slice(0, 24);
  merged.theme = THEMES.some((theme) => theme.id === merged.theme) ? merged.theme : base.theme;
  merged.accent = safeHex(merged.accent);
  merged.customTheme = sanitizeThemeOverrides(merged.customTheme);
  merged.customCss = typeof merged.customCss === "string" ? merged.customCss.slice(0, 8000) : "";
  merged.bgImage = typeof merged.bgImage === "string" && merged.bgImage.startsWith("data:image") ? merged.bgImage : "";
  merged.bgOpacity = clamp(Number(merged.bgOpacity) || 0, 0, 1);
  merged.bgBlur = clamp(Number(merged.bgBlur) || 0, 0, 20);
  merged.pattern = ["hearts", "dots", "stars", "none"].includes(merged.pattern) ? merged.pattern : "none";
  merged.shape = ["soft", "round", "pillowy", "sharp"].includes(merged.shape) ? merged.shape : "soft";
  merged.textSize = ["s", "m", "l"].includes(merged.textSize) ? merged.textSize : "m";
  merged.fontChoice = FONTS.some((font) => font.id === merged.fontChoice) ? merged.fontChoice : "editorial";
  merged.noteTexture = typeof stored.noteTexture === "boolean" ? stored.noteTexture : true;
  merged.avatarShape = ["squircle", "circle"].includes(merged.avatarShape) ? merged.avatarShape : "squircle";
  merged.timestamps = typeof stored.timestamps === "boolean" ? stored.timestamps : true;
  merged.timeFormat = ["auto", "12", "24", "off"].includes(merged.timeFormat) ? merged.timeFormat : "auto";
  merged.groupMessages = typeof stored.groupMessages === "boolean" ? stored.groupMessages : true;
  merged.showTyping = typeof stored.showTyping === "boolean" ? stored.showTyping : true;
  merged.readReceipts = typeof stored.readReceipts === "boolean" ? stored.readReceipts : true;
  merged.sendOnEnter = typeof stored.sendOnEnter === "boolean" ? stored.sendOnEnter : true;
  merged.sounds = typeof stored.sounds === "boolean" ? stored.sounds : true;
  merged.soundVolume = clamp(Number(stored.soundVolume == null ? 0.5 : stored.soundVolume), 0, 1);
  merged.haptics = typeof stored.haptics === "boolean" ? stored.haptics : true;
  merged.mediaAutoplay = typeof stored.mediaAutoplay === "boolean" ? stored.mediaAutoplay : true;
  merged.mediaAutoDownload = ["always", "wifi", "never"].includes(merged.mediaAutoDownload) ? merged.mediaAutoDownload : "wifi";
  merged.compact = typeof stored.compact === "boolean" ? stored.compact : false;
  merged.calm = typeof stored.calm === "boolean" ? stored.calm : false;
  return merged;
}

function sanitizeThemeOverrides(raw) {
  const result = {};
  if (!raw || typeof raw !== "object") return result;
  for (const token of STUDIO_TOKENS) {
    const value = safeHex(raw[token.key]);
    if (value) result[token.key] = value;
  }
  return result;
}

let state = DEMO ? demoState() : loadState();

function persistState() {
  if (DEMO) return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
  } catch (error) {
    /* storage can be unavailable; the app still works for this session */
  }
}

function hasProfile() {
  return Boolean(state.name && state.room && state.server);
}

function normalizeRoom(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 32);
}

function normalizeServer(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = "ws://" + raw;
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    return "";
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") return "";
  if (!url.hostname) return "";
  url.hash = "";
  if (url.pathname === "/" && !url.search) return url.origin;
  return url.toString().replace(/\/$/, "");
}

function randomRoom() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const number = 1000 + Math.floor(Math.random() * 9000);
  return word + "-" + number;
}

/* ------------------------------------------------------------------ *
 *  formatting
 * ------------------------------------------------------------------ */

function formatClock(timestamp) {
  if (!state.timestamps || state.timeFormat === "off") return "";
  const date = new Date(timestamp);
  try {
    if (state.timeFormat === "24") {
      return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    if (state.timeFormat === "12") {
      return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
    }
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch (error) {
    return "";
  }
}

function formatTime(timestamp) {
  return formatClock(timestamp);
}

function dateKey(timestamp) {
  const date = new Date(timestamp);
  return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
}

function dayLabel(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const difference = Math.round((startToday - startDay) / 86400000);
  if (difference === 0) return "today";
  if (difference === 1) return "yesterday";
  try {
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch (error) {
    return "";
  }
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(0) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins + ":" + String(secs).padStart(2, "0");
}

/* ------------------------------------------------------------------ *
 *  dom helpers
 * ------------------------------------------------------------------ */

function makeEl(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (typeof text === "string") element.textContent = text;
  return element;
}

function showToast(message, duration) {
  ui.toast.textContent = message;
  ui.toast.dataset.visible = "true";
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    ui.toast.dataset.visible = "false";
  }, duration || 2200);
}

function notifyNative(theme) {
  try {
    if (window.MochiAndroid && typeof window.MochiAndroid.setSystemBars === "function") {
      window.MochiAndroid.setSystemBars(theme.bg, !theme.dark);
    }
  } catch (error) {
    /* not running inside the Android shell */
  }
}

function copyToClipboard(text) {
  try {
    if (window.MochiAndroid && typeof window.MochiAndroid.copy === "function") {
      window.MochiAndroid.copy(text);
      return true;
    }
  } catch (error) {
    /* fall through */
  }
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return true;
  }
  return fallbackCopy(text);
}

function fallbackCopy(text) {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch (error) {
    return false;
  }
}

function shareRoom() {
  const text = "come chat with me on mochi 🍡\nroom: " + state.room + "\nserver: " + state.server;
  try {
    if (window.MochiAndroid && typeof window.MochiAndroid.share === "function" && state.room) {
      window.MochiAndroid.share(text);
      return;
    }
  } catch (error) {
    /* fall through */
  }
  copyToClipboard(text);
  showToast("room details copied");
}

function haptic(millis) {
  if (!state.haptics) return;
  try {
    if (window.MochiAndroid && typeof window.MochiAndroid.vibrate === "function") {
      window.MochiAndroid.vibrate(millis || 6);
      return;
    }
  } catch (error) {
    /* fall through */
  }
  if (navigator.vibrate) navigator.vibrate(millis || 6);
}

let audioContext = null;

function playSound(kind) {
  if (!state.sounds || state.soundVolume <= 0) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioContext) audioContext = new Ctx();
    if (audioContext.state === "suspended") audioContext.resume();
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    const base = kind === "receive" ? 660 : 520;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * (kind === "receive" ? 1.5 : 0.7), now + 0.09);
    const peak = 0.09 * state.soundVolume;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch (error) {
    /* audio is a nice-to-have */
  }
}

function floatHearts(intensity) {
  if (state.calm || prefersReduced.matches) return;
  const glyphs = ["♡", "✦", "❀"];
  const count = intensity || 4;
  for (let index = 0; index < count; index += 1) {
    const heart = makeEl("span", "heart", glyphs[index % glyphs.length]);
    heart.style.left = 24 + Math.random() * 52 + "%";
    heart.style.animationDelay = (index * 70) + "ms";
    heart.style.fontSize = (14 + Math.random() * 12) + "px";
    ui.heartLayer.appendChild(heart);
    setTimeout(() => heart.remove(), 1900);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}

function downloadText(filename, text) {
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (error) {
    showToast("could not export");
  }
}

/* ------------------------------------------------------------------ *
 *  server / media helpers
 * ------------------------------------------------------------------ */

function serverHttpBase() {
  const ws = normalizeServer(state.server);
  if (!ws) return "";
  try {
    const url = new URL(ws);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    return url.origin;
  } catch (error) {
    return "";
  }
}

function mediaUrl(path) {
  if (!path) return "";
  const value = String(path);
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  const base = serverHttpBase();
  return base ? base + (value.startsWith("/") ? value : "/" + value) : value;
}

function avatarNode(avatar, image, className, id) {
  const span = document.createElement("span");
  span.className = "avatar " + (className || "");
  if (id) span.id = id;
  const source = image && String(image).startsWith("data:image")
    ? image
    : avatar && String(avatar).startsWith("data:image")
      ? avatar
      : "";
  if (source) {
    span.classList.add("avatar--photo");
    const img = document.createElement("img");
    img.alt = "";
    img.src = source;
    span.appendChild(img);
  } else {
    span.textContent = avatar || "☁️";
  }
  return span;
}

function avatarMarkup(avatar, image, className) {
  const cls = "avatar " + (className || "");
  if (image && String(image).startsWith("data:image")) {
    return '<span class="' + cls + ' avatar--photo"><img alt="" src="' + image.replace(/"/g, "&quot;") + '"></span>';
  }
  if (avatar && String(avatar).startsWith("data:image")) {
    return '<span class="' + cls + ' avatar--photo"><img alt="" src="' + avatar.replace(/"/g, "&quot;") + '"></span>';
  }
  return '<span class="' + cls + '">' + escapeHtml(avatar || "☁️") + "</span>";
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------------------------------------------ *
 *  boot hook
 * ------------------------------------------------------------------ */

window.MochiNativeReady = function MochiNativeReady() {
  if (typeof applyLook === "function") applyLook();
};
