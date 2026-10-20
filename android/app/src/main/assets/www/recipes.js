"use strict";

/* ------------------------------------------------------------------ *
 *  built-in recipes
 *
 *  A recipe is just a small JSON bundle. Drop your own into the app:
 *  settings -> recipes -> paste it, or load a .json file. Same shape:
 *
 *  {
 *    "kind": "mochi-recipe",
 *    "version": 1,
 *    "name": "my look",
 *    "theme": "rose",              // paper|sage|clay|slate|rose|mono|ink|night
 *    "accent": "#ff5c8a",
 *    "customTheme": { "bg": "#...", "bg2": "#...", "surface": "#...",
 *                     "surface2": "#...", "ink": "#...", "ink2": "#...",
 *                     "ink3": "#...", "line": "#...", "accent": "#..." },
 *    "fontChoice": "friendly",     // editorial|friendly|modern
 *    "shape": "round",             // soft|round|pillowy|sharp
 *    "pattern": "stars",           // hearts|dots|stars|none
 *    "textSize": "m",              // s|m|l
 *    "avatarShape": "circle",      // squircle|circle
 *    "noteTexture": true,
 *    "gradient": "linear-gradient(...)",
 *    "image": "data:image/...",    // optional background photo
 *    "bgOpacity": 0.2,
 *    "bgBlur": 2,
 *    "avatar": "🌸",
 *    "css": "extra css here"
 *  }
 * ------------------------------------------------------------------ */

const RECIPES = [
  {
    id: "anime",
    name: "anime dusk",
    description: "pink twilight, manga sparkle",
    theme: "rose",
    accent: "#ff5c8a",
    fontChoice: "friendly",
    shape: "round",
    pattern: "stars",
    textSize: "m",
    avatarShape: "circle",
    noteTexture: true,
    avatar: "🌸",
    customTheme: {
      bg: "#fdf2f8",
      bg2: "#ffe4f1",
      surface: "#ffffff",
      surface2: "#fff7fb",
      ink: "#2a1b2e",
      ink2: "#6b4a68",
      ink3: "#a084a0",
      line: "#f3d3e6",
      accent: "#ff5c8a"
    },
    gradient: "linear-gradient(155deg, #fdf2f8 0%, #ffe4f1 45%, #e9e4ff 100%)",
    css: `.topbar__title::after,
.empty-state__title::after {
  content: " ✧";
  color: var(--accent);
}
.message__bubble {
  border-width: 1.5px;
}
.day-divider {
  letter-spacing: .14em;
  text-transform: lowercase;
}`
  },
  {
    id: "girly",
    name: "strawberry milk",
    description: "strawberries, hearts, soft pink",
    theme: "rose",
    accent: "#e75a8c",
    fontChoice: "friendly",
    shape: "pillowy",
    pattern: "hearts",
    textSize: "m",
    avatarShape: "squircle",
    noteTexture: true,
    avatar: "🍓",
    customTheme: {
      bg: "#fff5f8",
      bg2: "#ffe9f1",
      surface: "#ffffff",
      surface2: "#fff7fa",
      ink: "#3a2230",
      ink2: "#7a5768",
      ink3: "#b08fa0",
      line: "#f7d9e6",
      accent: "#e75a8c"
    },
    gradient: "linear-gradient(155deg, #fff5f8 0%, #ffe9f1 55%, #ffeef5 100%)",
    css: `.topbar__title::after {
  content: " ♡";
  color: var(--accent);
}
.message__bubble {
  border-width: 1.5px;
}
.day-divider {
  background: var(--accent-soft);
  border-color: transparent;
}`
  },
  {
    id: "islamic",
    name: "noor",
    description: "emerald, cream, a quiet gold light",
    theme: "sage",
    accent: "#2f8f7a",
    fontChoice: "editorial",
    shape: "soft",
    pattern: "stars",
    textSize: "m",
    avatarShape: "circle",
    noteTexture: true,
    avatar: "🌙",
    customTheme: {
      bg: "#f3f6f2",
      bg2: "#e7efe8",
      surface: "#ffffff",
      surface2: "#f6faf6",
      ink: "#1f2f2a",
      ink2: "#4f665c",
      ink3: "#83998e",
      line: "#d7e4da",
      accent: "#2f8f7a"
    },
    gradient: "linear-gradient(155deg, #f3f6f2 0%, #e7efe8 60%, #f6f1e4 100%)",
    css: `.topbar {
  box-shadow: inset 0 -2px 0 rgba(201, 162, 39, .35), var(--shadow-1);
}
.day-divider {
  letter-spacing: .16em;
}
.message__bubble {
  border-radius: 16px;
}`
  },
  {
    id: "love",
    name: "rosy love",
    description: "warm roses and a heartbeat",
    theme: "rose",
    accent: "#d6455d",
    fontChoice: "editorial",
    shape: "pillowy",
    pattern: "hearts",
    textSize: "m",
    avatarShape: "circle",
    noteTexture: true,
    avatar: "🌹",
    customTheme: {
      bg: "#fff4f4",
      bg2: "#ffe4e6",
      surface: "#ffffff",
      surface2: "#fff7f7",
      ink: "#331d22",
      ink2: "#7a4c55",
      ink3: "#b48a91",
      line: "#f6d2d6",
      accent: "#d6455d"
    },
    gradient: "radial-gradient(120% 120% at 50% 0%, #fff4f4 0%, #ffe4e6 55%, #ffe9ef 100%)",
    css: `.topbar__title::after {
  content: " ♥";
  color: var(--accent);
}
.message--mine .message__bubble {
  box-shadow: 0 12px 26px -20px rgba(214, 69, 93, .75);
}`
  },
  {
    id: "friendship",
    name: "best friends",
    description: "mint, sunshine, inside jokes",
    theme: "slate",
    accent: "#3f8c8a",
    fontChoice: "friendly",
    shape: "round",
    pattern: "dots",
    textSize: "m",
    avatarShape: "squircle",
    noteTexture: true,
    avatar: "🌟",
    customTheme: {
      bg: "#f2f8f7",
      bg2: "#e3f1ef",
      surface: "#ffffff",
      surface2: "#f4faf9",
      ink: "#1e2e2d",
      ink2: "#4f6462",
      ink3: "#849795",
      line: "#d3e5e2",
      accent: "#3f8c8a"
    },
    gradient: "linear-gradient(155deg, #f2f8f7 0%, #e3f1ef 50%, #fff6dd 100%)",
    css: `.topbar__title::after,
.empty-state__title::after {
  content: " ✦";
  color: var(--accent);
}
.message__bubble {
  border-width: 1.5px;
}`
  }
];
