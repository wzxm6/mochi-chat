# recipes

A recipe is a tiny JSON file that dresses the whole app in one tap: colors, font,
shape, doodles, background gradient, avatar and a little extra CSS.

## try the built-in ones

Open **settings → recipes** and tap a card. Built in: `anime`, `girly`,
`islamic`, `love`, `friendship`.

## drop one in

Either:

1. **Load file** in the recipes section and pick a `.json` (or `.mochi`) file, or
2. open the file, copy everything, paste it into **paste a recipe or css**, tap **apply**.

You can also paste plain CSS there — it becomes a quick custom look without JSON.

## make your own

Tweak the app until it feels right, then tap **save my look**. That downloads
`mochi-recipe.json` from your phone; send it to the other phone and load it there.

Minimal recipe:

```json
{
  "kind": "mochi-recipe",
  "version": 1,
  "name": "my look",
  "theme": "rose",
  "accent": "#ff5c8a",
  "customTheme": {
    "bg": "#fdf2f8",
    "bg2": "#ffe4f1",
    "surface": "#ffffff",
    "surface2": "#fff7fb",
    "ink": "#2a1b2e",
    "ink2": "#6b4a68",
    "ink3": "#a084a0",
    "line": "#f3d3e6",
    "accent": "#ff5c8a"
  },
  "fontChoice": "friendly",
  "shape": "round",
  "pattern": "stars",
  "textSize": "m",
  "avatarShape": "circle",
  "noteTexture": true,
  "gradient": "linear-gradient(155deg, #fdf2f8 0%, #ffe4f1 45%, #e9e4ff 100%)",
  "avatar": "🌸",
  "css": ".topbar__title::after { content: \" ✧\"; color: var(--accent); }"
}
```

| field | values |
| --- | --- |
| `theme` | `paper`, `sage`, `clay`, `slate`, `rose`, `mono`, `ink`, `night` |
| `accent` | any `#rrggbb` hex |
| `customTheme` | any of `bg`, `bg2`, `surface`, `surface2`, `ink`, `ink2`, `ink3`, `line`, `accent` |
| `fontChoice` | `editorial`, `friendly`, `modern` |
| `shape` | `soft`, `round`, `pillowy`, `sharp` |
| `pattern` | `hearts`, `dots`, `stars`, `none` |
| `textSize` | `s`, `m`, `l` |
| `avatarShape` | `squircle`, `circle` |
| `noteTexture` | `true` / `false` |
| `gradient` | a `linear-gradient(...)` / `radial-gradient(...)` / `conic-gradient(...)` |
| `image` | optional `data:image/...` background photo |
| `bgOpacity` | `0`–`1` |
| `bgBlur` | `0`–`20` |
| `avatar` | short emoji |
| `css` | extra CSS, up to 8000 characters |

Unknown keys are ignored, so a recipe from a newer version still loads.
