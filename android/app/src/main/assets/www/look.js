"use strict";

/* ------------------------------------------------------------------ *
 *  apply the whole look to the DOM
 * ------------------------------------------------------------------ */

function applyLook() {
  const palette = resolvePalette();
  const dark = palette.dark;
  const root = document.documentElement;
  const style = root.style;

  const inkBase = dark ? "#ffffff" : "#241f1b";
  const accentStrong = mix(palette.accent, inkBase, dark ? 0.22 : 0.28);
  const accentSoft = dark ? rgba(palette.accent, 0.2) : mix(palette.bg, palette.accent, 0.16);
  const onAccent = bestInk([palette.accent, accentStrong]);

  const mineA = mix(palette.surface, palette.accent, dark ? 0.24 : 0.14);
  const mineB = mix(palette.surface, palette.accent, dark ? 0.38 : 0.26);
  const mineInk = bestInk([mineA, mineB]);
  const mineLine = mix(mineB, inkBase, dark ? 0.2 : 0.14);

  const theirA = palette.surface;
  const theirB = palette.surface2;
  const theirInk = bestInk([theirA, theirB]);
  const theirLine = mix(palette.line, inkBase, dark ? 0.06 : 0.04);

  style.setProperty("--bg", palette.bg);
  style.setProperty("--bg-2", palette.bg2);
  style.setProperty("--surface", palette.surface);
  style.setProperty("--surface-2", palette.surface2);
  style.setProperty("--ink", palette.ink);
  style.setProperty("--ink-2", palette.ink2);
  style.setProperty("--ink-3", palette.ink3);
  style.setProperty("--line", palette.line);
  style.setProperty("--accent", palette.accent);
  style.setProperty("--accent-strong", accentStrong);
  style.setProperty("--accent-soft", accentSoft);
  style.setProperty("--on-accent", onAccent);
  style.setProperty("--mine-a", mineA);
  style.setProperty("--mine-b", mineB);
  style.setProperty("--mine-ink", mineInk);
  style.setProperty("--mine-line", mineLine);
  style.setProperty("--their-a", theirA);
  style.setProperty("--their-b", theirB);
  style.setProperty("--their-ink", theirInk);
  style.setProperty("--their-line", theirLine);
  style.setProperty("--scrim", rgba(dark ? "#000000" : "#241f1b", 0.34));
  style.setProperty("--toast-bg", palette.ink);
  style.setProperty("--toast-ink", palette.bg);
  style.setProperty("--shadow-color", rgba(inkBase, dark ? 0.5 : 0.16));

  const font = FONTS.find((item) => item.id === state.fontChoice) || FONTS[0];
  style.setProperty("--font-display", font.display);
  style.setProperty("--font-text", font.text);
  style.setProperty("--font-ui", font.text);

  root.dataset.theme = palette.id;
  root.dataset.shape = state.shape;
  root.dataset.size = state.textSize;
  root.dataset.avatar = state.avatarShape;
  root.dataset.font = state.fontChoice;
  document.body.dataset.pattern = state.pattern;
  document.body.classList.toggle("is-compact", state.compact);
  document.body.classList.toggle("is-calm", state.calm || prefersReduced.matches);
  document.body.classList.toggle("is-note", state.noteTexture);

  applyBackgroundImage();
  applyCustomCss();

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", palette.bg);
  notifyNative(palette);
}

function applyBackgroundImage() {
  if (!ui.bgPhoto) return;
  if (state.bgImage && state.bgImage.startsWith("data:image")) {
    ui.bgPhoto.style.backgroundImage = "url(" + state.bgImage + ")";
    ui.bgPhoto.style.opacity = String(clamp(state.bgOpacity, 0, 1));
    ui.bgPhoto.style.filter = "blur(" + clamp(state.bgBlur, 0, 20) + "px)";
    ui.bgPhoto.hidden = false;
  } else {
    ui.bgPhoto.style.backgroundImage = "none";
    ui.bgPhoto.hidden = true;
  }
}

function applyCustomCss() {
  if (ui.customCssStyle) ui.customCssStyle.textContent = state.customCss || "";
}

/* ------------------------------------------------------------------ *
 *  renders
 * ------------------------------------------------------------------ */

function renderAvatarGrids() {
  const build = (container) => {
    if (!container) return;
    container.innerHTML = "";
    for (const avatar of AVATARS) {
      const button = makeEl("button", "emoji-button", avatar);
      button.type = "button";
      button.dataset.avatar = avatar;
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", "Choose " + avatar + " as your face");
      container.appendChild(button);
    }
  };
  build(ui.setupAvatars);
  build(ui.settingsAvatars);
  syncAvatarButtons();
  refreshAvatarPreview();
}

function swapAvatar(element, avatar, image, className, id) {
  if (!element || !element.parentNode) return element;
  const replacement = avatarNode(avatar, image, className, id);
  element.parentNode.replaceChild(replacement, element);
  return replacement;
}

function refreshAvatarPreview() {
  if (ui.avatarPhotoPreview) {
    ui.avatarPhotoPreview = swapAvatar(
      ui.avatarPhotoPreview, state.avatar, state.avatarImage, "avatar--preview", "avatarPhotoPreview"
    );
  }
  if (ui.headerAvatar) {
    ui.headerAvatar = swapAvatar(
      ui.headerAvatar, state.avatar, state.avatarImage, "avatar--header", "headerAvatar"
    );
  }
}

function syncAvatarButtons() {
  const hasPhoto = Boolean(state.avatarImage);
  for (const button of document.querySelectorAll(".emoji-button[data-avatar]")) {
    button.setAttribute(
      "aria-pressed",
      !hasPhoto && button.dataset.avatar === state.avatar ? "true" : "false"
    );
  }
}

function renderThemeGrid() {
  if (!ui.themeGrid) return;
  ui.themeGrid.innerHTML = "";
  for (const theme of THEMES) {
    const card = makeEl("button", "theme-card");
    card.type = "button";
    card.dataset.theme = theme.id;
    card.setAttribute("aria-label", "Theme: " + theme.name);

    const swatch = makeEl("span", "theme-card__swatch");
    swatch.style.background = "linear-gradient(140deg, " + theme.bg + " 0%, " + theme.bg2 + " 100%)";
    const bubble = makeEl("span", "theme-card__bubble");
    bubble.style.background = theme.accent;
    swatch.appendChild(bubble);
    card.appendChild(swatch);
    card.appendChild(makeEl("span", "theme-card__name", theme.name));
    ui.themeGrid.appendChild(card);
  }
  syncThemeButtons();
}

function syncThemeButtons() {
  for (const card of document.querySelectorAll(".theme-card[data-theme]")) {
    card.setAttribute("aria-pressed", card.dataset.theme === state.theme ? "true" : "false");
  }
}

function renderAccentRow() {
  if (!ui.accentRow) return;
  ui.accentRow.innerHTML = "";
  for (const color of ACCENTS) {
    const button = makeEl("button", "swatch");
    button.type = "button";
    button.dataset.accent = color;
    button.style.background = color;
    button.setAttribute("aria-label", "Accent color " + color);
    ui.accentRow.appendChild(button);
  }
  syncAccentButtons();
}

function syncAccentButtons() {
  const accent = (safeHex(state.accent) || "").toLowerCase();
  for (const button of document.querySelectorAll(".swatch[data-accent]")) {
    button.setAttribute(
      "aria-pressed",
      button.dataset.accent.toLowerCase() === accent ? "true" : "false"
    );
  }
  if (ui.customAccent) ui.customAccent.value = accent || currentAccent();
}

function renderStudioTokens() {
  if (!ui.studioTokens) return;
  ui.studioTokens.innerHTML = "";
  const palette = resolvePalette();
  for (const token of STUDIO_TOKENS) {
    const label = makeEl("label", "token");
    const text = makeEl("span", "token__label", token.label);
    const input = document.createElement("input");
    input.type = "color";
    input.value = safeHex(state.customTheme[token.key]) || palette[token.key] || "#000000";
    input.dataset.token = token.key;
    input.setAttribute("aria-label", token.label + " color");
    label.appendChild(input);
    label.appendChild(text);
    ui.studioTokens.appendChild(label);
  }
}

function syncStudioTokens() {
  if (!ui.studioTokens) return;
  const palette = resolvePalette();
  for (const input of ui.studioTokens.querySelectorAll("input[data-token]")) {
    input.value = safeHex(state.customTheme[input.dataset.token]) || palette[input.dataset.token] || "#000000";
  }
}

function syncSegment(container, value) {
  if (!container) return;
  for (const button of container.querySelectorAll("[data-value]")) {
    button.setAttribute("aria-pressed", button.dataset.value === value ? "true" : "false");
  }
}

function syncLookControls() {
  syncThemeButtons();
  syncAccentButtons();
  syncAvatarButtons();
  syncStudioTokens();
  syncSegment(ui.shapeControl, state.shape);
  syncSegment(ui.patternControl, state.pattern);
  syncSegment(ui.sizeControl, state.textSize);
  syncSegment(ui.fontControl, state.fontChoice);
  syncSegment(ui.avatarShapeControl, state.avatarShape);
  syncSegment(ui.timeFormatControl, state.timeFormat);
  syncSegment(ui.mediaAutoControl, state.mediaAutoDownload);

  const checks = [
    [ui.toggleTimestamps, state.timestamps],
    [ui.toggleSounds, state.sounds],
    [ui.toggleHaptics, state.haptics],
    [ui.toggleCompact, state.compact],
    [ui.toggleCalm, state.calm],
    [ui.toggleTyping, state.showTyping],
    [ui.toggleReceipts, state.readReceipts],
    [ui.toggleEnter, state.sendOnEnter],
    [ui.toggleGroup, state.groupMessages],
    [ui.toggleAutoplay, state.mediaAutoplay],
    [ui.toggleNote, state.noteTexture]
  ];
  for (const [element, value] of checks) {
    if (element) element.checked = Boolean(value);
  }
  if (ui.soundVolume) ui.soundVolume.value = String(state.soundVolume);
  if (ui.bgOpacity) ui.bgOpacity.value = String(state.bgOpacity);
  if (ui.bgBlur) ui.bgBlur.value = String(state.bgBlur);
  syncSliderOutputs();
  if (ui.customCss) ui.customCss.value = state.customCss || "";
}

function syncSliderOutputs() {
  if (ui.bgOpacityValue) ui.bgOpacityValue.textContent = Math.round(state.bgOpacity * 100) + "%";
  if (ui.bgBlurValue) ui.bgBlurValue.textContent = Math.round(state.bgBlur) + "px";
}

/* ------------------------------------------------------------------ *
 *  bindings
 * ------------------------------------------------------------------ */

function bindSegment(container, key, afterChange) {
  if (!container) return;
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-value]");
    if (!button) return;
    state[key] = button.dataset.value;
    persistState();
    applyLook();
    syncSegment(container, state[key]);
    haptic(4);
    if (typeof afterChange === "function") afterChange();
  });
}

function bindToggle(element, key, afterChange) {
  if (!element) return;
  element.addEventListener("change", () => {
    state[key] = element.checked;
    persistState();
    if (typeof afterChange === "function") afterChange();
  });
}

function rerenderMessages() {
  if (typeof renderMessages === "function") {
    renderMessages({ forceScroll: false, animate: false });
  }
}

function bindLookEvents() {
  const avatarHandler = (event) => {
    const button = event.target.closest("[data-avatar]");
    if (!button) return;
    state.avatar = button.dataset.avatar;
    state.avatarImage = "";
    persistState();
    syncAvatarButtons();
    refreshAvatarPreview();
    if (typeof updateHeader === "function") updateHeader();
    haptic(5);
  };
  if (ui.setupAvatars) ui.setupAvatars.addEventListener("click", avatarHandler);
  if (ui.settingsAvatars) ui.settingsAvatars.addEventListener("click", avatarHandler);

  if (ui.themeGrid) {
    ui.themeGrid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-theme]");
      if (!card) return;
      state.theme = card.dataset.theme;
      state.accent = "";
      persistState();
      applyLook();
      syncLookControls();
      haptic(4);
    });
  }

  if (ui.accentRow) {
    ui.accentRow.addEventListener("click", (event) => {
      const swatch = event.target.closest("[data-accent]");
      if (!swatch) return;
      state.accent = safeHex(swatch.dataset.accent);
      delete state.customTheme.accent;
      persistState();
      applyLook();
      syncLookControls();
      haptic(4);
    });
  }

  if (ui.customAccent) {
    ui.customAccent.addEventListener("input", () => {
      state.accent = safeHex(ui.customAccent.value);
      delete state.customTheme.accent;
      applyLook();
    });
    ui.customAccent.addEventListener("change", () => {
      persistState();
      syncLookControls();
    });
  }

  bindSegment(ui.shapeControl, "shape", () => {});
  bindSegment(ui.patternControl, "pattern", () => {});
  bindSegment(ui.sizeControl, "textSize", () => {
    if (typeof resizeInput === "function") resizeInput();
  });
  bindSegment(ui.fontControl, "fontChoice", () => {});
  bindSegment(ui.avatarShapeControl, "avatarShape", () => {});
  bindSegment(ui.timeFormatControl, "timeFormat", rerenderMessages);
  bindSegment(ui.mediaAutoControl, "mediaAutoDownload", () => {
    if (typeof refreshMediaVisibility === "function") refreshMediaVisibility();
  });

  bindToggle(ui.toggleTimestamps, "timestamps", rerenderMessages);
  bindToggle(ui.toggleSounds, "sounds");
  bindToggle(ui.toggleHaptics, "haptics");
  bindToggle(ui.toggleCompact, "compact", applyLook);
  bindToggle(ui.toggleCalm, "calm", applyLook);
  bindToggle(ui.toggleTyping, "showTyping", () => {
    if (typeof updateTypingIndicator === "function") updateTypingIndicator();
  });
  bindToggle(ui.toggleReceipts, "readReceipts");
  bindToggle(ui.toggleEnter, "sendOnEnter");
  bindToggle(ui.toggleGroup, "groupMessages", rerenderMessages);
  bindToggle(ui.toggleAutoplay, "mediaAutoplay");
  bindToggle(ui.toggleNote, "noteTexture", applyLook);

  if (ui.soundVolume) {
    ui.soundVolume.addEventListener("input", () => {
      state.soundVolume = clamp(Number(ui.soundVolume.value) || 0, 0, 1);
    });
    ui.soundVolume.addEventListener("change", persistState);
  }

  if (ui.bgOpacity) {
    ui.bgOpacity.addEventListener("input", () => {
      state.bgOpacity = clamp(Number(ui.bgOpacity.value) || 0, 0, 1);
      syncSliderOutputs();
      applyBackgroundImage();
    });
    ui.bgOpacity.addEventListener("change", persistState);
  }
  if (ui.bgBlur) {
    ui.bgBlur.addEventListener("input", () => {
      state.bgBlur = clamp(Number(ui.bgBlur.value) || 0, 0, 20);
      syncSliderOutputs();
      applyBackgroundImage();
    });
    ui.bgBlur.addEventListener("change", persistState);
  }

  if (ui.studioTokens) {
    ui.studioTokens.addEventListener("input", (event) => {
      const input = event.target.closest("input[data-token]");
      if (!input) return;
      state.customTheme[input.dataset.token] = safeHex(input.value);
      applyLook();
      syncAccentButtons();
    });
    ui.studioTokens.addEventListener("change", persistState);
  }

  if (ui.studioReset) {
    ui.studioReset.addEventListener("click", () => {
      state.customTheme = {};
      persistState();
      applyLook();
      syncLookControls();
      showToast("colors reset");
      haptic(4);
    });
  }

  if (ui.bgUpload) {
    ui.bgUpload.addEventListener("change", async () => {
      const file = ui.bgUpload.files && ui.bgUpload.files[0];
      ui.bgUpload.value = "";
      if (!file) return;
      if (file.size > 6 * 1024 * 1024) {
        showToast("that image is a bit big");
        return;
      }
      try {
        state.bgImage = await readFileAsDataUrl(file);
        persistState();
        applyBackgroundImage();
        showToast("background set");
      } catch (error) {
        showToast("could not read that image");
      }
    });
  }
  if (ui.bgClear) {
    ui.bgClear.addEventListener("click", () => {
      state.bgImage = "";
      persistState();
      applyBackgroundImage();
    });
  }

  if (ui.avatarUpload) {
    ui.avatarUpload.addEventListener("change", async () => {
      const file = ui.avatarUpload.files && ui.avatarUpload.files[0];
      ui.avatarUpload.value = "";
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        showToast("that image is a bit big");
        return;
      }
      try {
        state.avatarImage = await readFileAsDataUrl(file);
        persistState();
        syncAvatarButtons();
        refreshAvatarPreview();
        if (typeof updateHeader === "function") updateHeader();
        showToast("looking good");
      } catch (error) {
        showToast("could not read that image");
      }
    });
  }
  if (ui.avatarClear) {
    ui.avatarClear.addEventListener("click", () => {
      state.avatarImage = "";
      persistState();
      syncAvatarButtons();
      refreshAvatarPreview();
      if (typeof updateHeader === "function") updateHeader();
    });
  }

  if (ui.cssApply && ui.customCss) {
    ui.cssApply.addEventListener("click", () => {
      state.customCss = String(ui.customCss.value || "").slice(0, 8000);
      persistState();
      applyCustomCss();
      showToast("css applied");
    });
  }

  if (ui.themeExport) {
    ui.themeExport.addEventListener("click", () => {
      const bundle = {
        kind: "mochi-theme",
        version: 2,
        theme: state.theme,
        accent: state.accent,
        customTheme: state.customTheme,
        customCss: state.customCss,
        fontChoice: state.fontChoice,
        shape: state.shape,
        pattern: state.pattern,
        textSize: state.textSize,
        noteTexture: state.noteTexture
      };
      downloadText("mochi-theme.json", JSON.stringify(bundle, null, 2));
      showToast("theme exported");
    });
  }

  if (ui.themeImportFile) {
    ui.themeImportFile.addEventListener("change", async () => {
      const file = ui.themeImportFile.files && ui.themeImportFile.files[0];
      ui.themeImportFile.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        const bundle = JSON.parse(text);
        if (bundle.customTheme) state.customTheme = sanitizeThemeOverrides(bundle.customTheme);
        if (THEMES.some((theme) => theme.id === bundle.theme)) state.theme = bundle.theme;
        if (safeHex(bundle.accent)) state.accent = safeHex(bundle.accent);
        if (typeof bundle.customCss === "string") state.customCss = bundle.customCss.slice(0, 8000);
        if (FONTS.some((font) => font.id === bundle.fontChoice)) state.fontChoice = bundle.fontChoice;
        if (["soft", "round", "pillowy", "sharp"].includes(bundle.shape)) state.shape = bundle.shape;
        if (["hearts", "dots", "stars", "none"].includes(bundle.pattern)) state.pattern = bundle.pattern;
        if (["s", "m", "l"].includes(bundle.textSize)) state.textSize = bundle.textSize;
        if (typeof bundle.noteTexture === "boolean") state.noteTexture = bundle.noteTexture;
        persistState();
        applyLook();
        syncLookControls();
        showToast("theme loaded");
      } catch (error) {
        showToast("that theme file didn't load");
      }
    });
  }

  if (prefersReduced && prefersReduced.addEventListener) {
    prefersReduced.addEventListener("change", applyLook);
  }
}
