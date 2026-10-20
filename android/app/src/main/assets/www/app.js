"use strict";

let sheetOpen = false;
let resetArmed = false;
let resetTimer = null;

function updateHeader() {
  ui.roomTitle.textContent = state.room || "our room";
  ui.headerAvatar.title = state.name ? state.name + "’s little face" : "your little face";
  if (typeof refreshAvatarPreview === "function") refreshAvatarPreview();
  if (!ui.chat.hidden) {
    document.title = (state.room || "our room") + " · Mochi";
  }
}

function syncSetupFields() {
  ui.setupName.value = state.name || "";
  ui.setupRoom.value = state.room || randomRoom();
  ui.setupServer.value = state.server || "";
  ui.setupError.textContent = "";
  syncAvatarButtons();
}

function syncIdentityFields() {
  ui.settingsName.value = state.name || "";
  ui.peerName.value = state.peerName || "";
  ui.settingsRoom.value = state.room || "";
  ui.settingsServer.value = state.server || "";
}

function showWelcome() {
  ui.chat.hidden = true;
  ui.welcome.hidden = false;
  syncSetupFields();
  applyLook();
  document.title = "Mochi";
}

function enterChat() {
  if (!hasProfile()) {
    showWelcome();
    return;
  }

  ui.welcome.hidden = true;
  ui.chat.hidden = false;
  updateHeader();

  messages = DEMO
    ? (DEMO_EMPTY ? [] : seedDemoMessages())
    : loadCachedMessages(state.room);

  unseenMessages = false;
  newMessageIds.clear();
  clearTyping();
  presenceCount = 0;
  ui.messageInput.value = "";
  ui.sendBtn.disabled = true;
  resizeInput();
  renderMessages({ forceScroll: true, animate: false });

  if (DEMO) {
    setConnection("online");
    setPresence(2);
    ui.offlineNotice.hidden = true;
  } else {
    connect();
  }

  refreshConnectionUI();
  requestAnimationFrame(resizeInput);
}

function setSetupError(message, focusTarget) {
  ui.setupError.textContent = message;
  if (focusTarget && typeof focusTarget.focus === "function") {
    focusTarget.focus({ preventScroll: false });
  }
}

function handleSetupSubmit(event) {
  event.preventDefault();
  ui.setupError.textContent = "";

  const name = ui.setupName.value.trim().slice(0, 24);
  const room = normalizeRoom(ui.setupRoom.value);
  const server = normalizeServer(ui.setupServer.value);

  if (!name) {
    setSetupError("give yourself a little name first", ui.setupName);
    return;
  }
  if (room.length < 2) {
    setSetupError("room keys need at least 2 letters or numbers", ui.setupRoom);
    return;
  }
  if (!server) {
    setSetupError("add your server address first", ui.setupServer);
    return;
  }

  state.name = name;
  state.room = room;
  state.server = server;
  ui.setupRoom.value = room;
  ui.setupServer.value = server;
  persistState();
  enterChat();
}

function openSettings() {
  if (sheetOpen) return;
  sheetOpen = true;
  disarmReset();
  syncIdentityFields();
  syncLookControls();

  ui.app.setAttribute("inert", "");
  ui.scrim.hidden = false;
  ui.sheet.hidden = false;
  ui.sheetBody.scrollTop = 0;

  setTimeout(() => {
    ui.closeSettings.focus({ preventScroll: true });
  }, 40);
}

function closeSettings(restoreFocus) {
  if (!sheetOpen) return;
  sheetOpen = false;
  disarmReset();
  ui.sheet.hidden = true;
  ui.scrim.hidden = true;
  ui.app.removeAttribute("inert");
  if (restoreFocus !== false) ui.settingsBtn.focus({ preventScroll: true });
}

function saveSettings() {
  const name = ui.settingsName.value.trim().slice(0, 24);
  const peer = ui.peerName.value.trim().slice(0, 24);
  const room = normalizeRoom(ui.settingsRoom.value);
  const server = normalizeServer(ui.settingsServer.value);

  if (!name) {
    showToast("give yourself a little name");
    ui.settingsName.focus();
    return;
  }
  if (room.length < 2) {
    showToast("that room key is a little too short");
    ui.settingsRoom.focus();
    return;
  }
  if (!server) {
    showToast("that server address doesn't look right");
    ui.settingsServer.focus();
    return;
  }

  const roomChanged = room !== state.room || server !== state.server;
  const peerChanged = peer !== state.peerName;
  state.name = name;
  state.peerName = peer;
  state.room = room;
  state.server = server;
  state.avatarImage = typeof state.avatarImage === "string" ? state.avatarImage : "";
  ui.settingsRoom.value = room;
  ui.settingsServer.value = server;
  persistState();
  updateHeader();

  if (roomChanged) {
    messages = loadCachedMessages(state.room);
    unseenMessages = false;
    newMessageIds.clear();
    clearTyping();
    renderMessages({ forceScroll: true, animate: false });
  } else if (peerChanged) {
    renderMessages({ forceScroll: false, animate: false });
    updateTypingIndicator();
  }

  closeSettings();

  if (DEMO) {
    showToast("saved");
    return;
  }

  if (roomChanged) connect();
  showToast(roomChanged ? "saved — reconnecting" : "saved");
}

function disarmReset() {
  resetArmed = false;
  clearTimeout(resetTimer);
  ui.resetBtn.dataset.armed = "false";
  ui.resetBtn.textContent = "forget everything";
}

function handleReset() {
  if (!resetArmed) {
    resetArmed = true;
    ui.resetBtn.dataset.armed = "true";
    ui.resetBtn.textContent = "tap again to forget everything";
    clearTimeout(resetTimer);
    resetTimer = setTimeout(disarmReset, 4500);
    return;
  }

  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.indexOf("mochi.") === 0) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch (error) {
    /* if storage is blocked, a reload still resets the session */
  }
  location.reload();
}

function exportSettings() {
  const bundle = {
    kind: "mochi-settings",
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: {
      name: state.name,
      avatar: state.avatar,
      avatarImage: state.avatarImage,
      peerName: state.peerName,
      room: state.room,
      server: state.server,
      theme: state.theme,
      accent: state.accent,
      customTheme: state.customTheme,
      customCss: state.customCss,
      recipeId: state.recipeId,
      recipeName: state.recipeName,
      recipeCss: state.recipeCss,
      bgGradient: state.bgGradient,
      bgImage: state.bgImage,
      bgOpacity: state.bgOpacity,
      bgBlur: state.bgBlur,
      pattern: state.pattern,
      shape: state.shape,
      textSize: state.textSize,
      fontChoice: state.fontChoice,
      noteTexture: state.noteTexture,
      avatarShape: state.avatarShape,
      timestamps: state.timestamps,
      timeFormat: state.timeFormat,
      groupMessages: state.groupMessages,
      showTyping: state.showTyping,
      readReceipts: state.readReceipts,
      sendOnEnter: state.sendOnEnter,
      sounds: state.sounds,
      soundVolume: state.soundVolume,
      haptics: state.haptics,
      mediaAutoplay: state.mediaAutoplay,
      mediaAutoDownload: state.mediaAutoDownload,
      compact: state.compact,
      calm: state.calm
    }
  };
  downloadText("mochi-settings.json", JSON.stringify(bundle, null, 2));
  showToast("settings exported");
}

async function importSettingsFile(file) {
  try {
    const text = await file.text();
    const bundle = JSON.parse(text);
    const stored = bundle && bundle.settings ? bundle.settings : bundle;
    if (!stored || typeof stored !== "object") throw new Error("bad file");

    if (typeof stored.name === "string") state.name = stored.name.slice(0, 24);
    if (typeof stored.avatar === "string") state.avatar = stored.avatar.slice(0, 400000);
    if (typeof stored.avatarImage === "string" && stored.avatarImage.startsWith("data:image")) {
      state.avatarImage = stored.avatarImage;
    }
    if (typeof stored.peerName === "string") state.peerName = stored.peerName.slice(0, 24);
    if (typeof stored.room === "string" && normalizeRoom(stored.room)) state.room = normalizeRoom(stored.room);
    if (typeof stored.server === "string" && normalizeServer(stored.server)) state.server = normalizeServer(stored.server);

    if (THEMES.some((theme) => theme.id === stored.theme)) state.theme = stored.theme;
    if (safeHex(stored.accent)) state.accent = safeHex(stored.accent);
    if (stored.customTheme) state.customTheme = sanitizeThemeOverrides(stored.customTheme);
    if (typeof stored.customCss === "string") state.customCss = stored.customCss.slice(0, 8000);
    if (typeof stored.recipeId === "string") state.recipeId = stored.recipeId.slice(0, 40);
    if (typeof stored.recipeName === "string") state.recipeName = stored.recipeName.slice(0, 40);
    if (typeof stored.recipeCss === "string") state.recipeCss = stored.recipeCss.slice(0, 8000);
    if (Object.prototype.hasOwnProperty.call(stored, "bgGradient")) {
      state.bgGradient = sanitizeGradient(stored.bgGradient);
    }
    if (typeof stored.bgImage === "string" && stored.bgImage.startsWith("data:image")) state.bgImage = stored.bgImage;
    if (stored.bgOpacity != null) state.bgOpacity = clamp(Number(stored.bgOpacity) || 0, 0, 1);
    if (stored.bgBlur != null) state.bgBlur = clamp(Number(stored.bgBlur) || 0, 0, 20);
    if (["hearts", "dots", "stars", "none"].includes(stored.pattern)) state.pattern = stored.pattern;
    if (["soft", "round", "pillowy", "sharp"].includes(stored.shape)) state.shape = stored.shape;
    if (["s", "m", "l"].includes(stored.textSize)) state.textSize = stored.textSize;
    if (FONTS.some((font) => font.id === stored.fontChoice)) state.fontChoice = stored.fontChoice;
    if (typeof stored.noteTexture === "boolean") state.noteTexture = stored.noteTexture;
    if (["squircle", "circle"].includes(stored.avatarShape)) state.avatarShape = stored.avatarShape;
    if (typeof stored.timestamps === "boolean") state.timestamps = stored.timestamps;
    if (["auto", "12", "24", "off"].includes(stored.timeFormat)) state.timeFormat = stored.timeFormat;
    if (typeof stored.groupMessages === "boolean") state.groupMessages = stored.groupMessages;
    if (typeof stored.showTyping === "boolean") state.showTyping = stored.showTyping;
    if (typeof stored.readReceipts === "boolean") state.readReceipts = stored.readReceipts;
    if (typeof stored.sendOnEnter === "boolean") state.sendOnEnter = stored.sendOnEnter;
    if (typeof stored.sounds === "boolean") state.sounds = stored.sounds;
    if (stored.soundVolume != null) state.soundVolume = clamp(Number(stored.soundVolume) || 0, 0, 1);
    if (typeof stored.haptics === "boolean") state.haptics = stored.haptics;
    if (typeof stored.mediaAutoplay === "boolean") state.mediaAutoplay = stored.mediaAutoplay;
    if (["always", "wifi", "never"].includes(stored.mediaAutoDownload)) state.mediaAutoDownload = stored.mediaAutoDownload;
    if (typeof stored.compact === "boolean") state.compact = stored.compact;
    if (typeof stored.calm === "boolean") state.calm = stored.calm;

    persistState();
    applyLook();
    syncIdentityFields();
    syncLookControls();
    updateHeader();
    showToast("settings loaded");
  } catch (error) {
    showToast("that settings file didn't load");
  }
}

function bindAppEvents() {
  ui.setupForm.addEventListener("submit", handleSetupSubmit);
  ui.setupName.addEventListener("input", () => {
    if (ui.setupError.textContent) ui.setupError.textContent = "";
  });
  ui.setupRoom.addEventListener("input", () => {
    if (ui.setupError.textContent) ui.setupError.textContent = "";
  });
  ui.setupServer.addEventListener("input", () => {
    if (ui.setupError.textContent) ui.setupError.textContent = "";
  });
  ui.rollRoom.addEventListener("click", () => {
    ui.setupRoom.value = randomRoom();
    ui.setupError.textContent = "";
  });

  ui.settingsBtn.addEventListener("click", openSettings);
  ui.closeSettings.addEventListener("click", () => closeSettings());
  ui.scrim.addEventListener("click", () => closeSettings());
  ui.saveSettings.addEventListener("click", saveSettings);
  ui.shareRoomBtn.addEventListener("click", shareRoom);
  ui.resetBtn.addEventListener("click", handleReset);

  ui.settingsExport.addEventListener("click", exportSettings);
  ui.settingsImportFile.addEventListener("change", () => {
    const file = ui.settingsImportFile.files && ui.settingsImportFile.files[0];
    ui.settingsImportFile.value = "";
    if (file) importSettingsFile(file);
  });

  const saveOnEnter = (element) => {
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveSettings();
      }
    });
  };
  saveOnEnter(ui.settingsName);
  saveOnEnter(ui.peerName);
  saveOnEnter(ui.settingsRoom);
  saveOnEnter(ui.settingsServer);

  ui.sheet.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(ui.sheet.querySelectorAll(
      "button, input, textarea, select, a[href], [tabindex]:not([tabindex='-1'])"
    )).filter((element) => !element.disabled && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!ui.mediaViewer.hidden) {
      event.preventDefault();
      closeMediaViewer();
      return;
    }
    if (!ui.reactionBar.hidden) {
      event.preventDefault();
      hideReactionBar();
      return;
    }
    if (sheetOpen) {
      event.preventDefault();
      closeSettings();
    }
  });

  window.mochiHandleBack = function () {
    if (!ui.mediaViewer.hidden) {
      closeMediaViewer();
      return true;
    }
    if (!ui.reactionBar.hidden) {
      hideReactionBar();
      return true;
    }
    if (sheetOpen) {
      closeSettings();
      return true;
    }
    return false;
  };
}

function init() {
  bindAppEvents();
  bindLookEvents();
  bindChatEvents();

  renderAvatarGrids();
  renderThemeGrid();
  renderAccentRow();
  renderStudioTokens();
  renderRecipes();
  syncLookControls();
  applyLook();
  updateHeader();

  if (DEMO || hasProfile()) {
    enterChat();
  } else {
    showWelcome();
  }
}

init();
