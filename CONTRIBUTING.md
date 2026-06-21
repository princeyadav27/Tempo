# Contributing to TEMPO

Thanks for your interest in contributing! TEMPO is intentionally simple: **vanilla HTML, CSS, and JavaScript with zero dependencies and no build step.** Please keep it that way.

## Ground rules

1. **No frameworks, no bundlers, no npm dependencies.** The whole app must run by opening `index.html`.
2. **No network calls.** All features must work fully offline; user data never leaves the device.
3. **Stay skeuomorphic.** New UI should feel mechanical and tactile — gauges, plaques, machined buttons — not flat dashboards.
4. **No external assets.** Sounds are synthesized with the Web Audio API; graphics are CSS/SVG. llm

## Project layout

| File | Responsibility |
|---|---|
| `index.html` | Markup only — clock SVG, controls, modals |
| `assets/css/style.css` | All styling; themes are CSS custom properties under `[data-theme="..."]` |
| `assets/js/app.js` | One IIFE containing the timer engine, audio synth, theming, and intelligence layer |

## How to contribute

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Make your changes. Test by serving locally:
   ```bash
   python3 -m http.server 8000
   ```
3. Verify in at least Chrome and Firefox.
4. Open a pull request with a clear description and, for UI changes, a screenshot or GIF.

## Adding a theme

Add a `[data-theme="yourname"]` block in `style.css` overriding the CSS variables, a `.sw-yourname` swatch gradient, and a swatch button in `index.html`. That's it — the dial, bezel, and gauge inherit everything.

## Reporting bugs

Open an issue with browser/version, steps to reproduce, and what you expected vs. saw.

## Code style

- ES5-compatible JavaScript (the codebase deliberately avoids transpilation)
- 2-space indentation //
- Descriptive section comments (`/* ---------- section ---------- */`)
