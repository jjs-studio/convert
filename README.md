# JJS Studio

Studio-style browser app that converts Roblox `ParticleEmitter`s from `.rbxl` / `.rbxm` / `.rbxlx` into JJS skill JSON + compact `KLUv` import codes.

Works on phone as a PWA (Chrome → Add to Home Screen). Parsing runs locally — the place file never uploads.

## Publish on GitHub Pages

1. Create a GitHub repo (example: `jjs-studio`).
2. Upload every file in this folder to the **repo root** (not inside another folder).
3. Repo **Settings → Pages**.
4. Source: **Deploy from a branch**.
5. Branch: `main`, folder: `/ (root)`.
6. Open `https://YOURUSER.github.io/jjs-studio/`.
7. On Android Chrome: **⋮ → Add to Home Screen**.

## Use

- **Open place** or drop an `.rbxl` / `.rbxm`.
- Explorer works like Workspace. Folders open; parts/models select.
- Set **Duration** and **Position** (not stored in the Roblox file).
- Optional **Recolor**: detected Main / Accent / Other map onto the three colors you pick (hex or the color picker).
- **Export selection** → copy JSON or compact `KLUv` code.

CDN scripts (pako, fzstd, zstd-codec) need network the first time. After that the service worker caches the app shell.
