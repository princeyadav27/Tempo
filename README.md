# ⏱ TEMPO — Mechanical Pomodoro Timer

> A beautifully crafted **skeuomorphic Pomodoro timer** that feels like a real mechanical clock on your screen — satisfying to start, satisfying to watch tick down.

TEMPO combines the proven Pomodoro technique with tactile, nostalgic design to make focus sessions feel deliberate and rewarding rather than sterile. Built as a single-page web app with **zero dependencies, zero build step, and zero network calls** — everything runs and stays on your device.


---

## ✨ Features

### 🕰 Skeuomorphic mechanical clock
- Machined metal bezel with knurled edge and realistic conic lighting
- Classic **red wedge** countdown (Time Timer style) that drains counter-clockwise
- Smooth **sweeping seconds needle** — one revolution per minute, like a real movement
- Glass-dome reflection, recessed cream dial, counter-clockwise minute numerals
- Tactile **crown start button** that physically depresses on click

### 🍅 Pomodoro engine
- Focus / Short Break / Long Break modes on a machined segmented switch
- Auto-advance: focus → break, and after 4 pomodoros → long break
- Glowing cycle dots track progress through each 4-session cycle
- Drift-free timing via `requestAnimationFrame` deltas
- Fully customizable intervals (5–90 min focus, 1–30 min short, 5–60 min long)

### 🔊 Synthesized audio — no asset files
All sound is generated live with the **Web Audio API**:
- Alternating *tick-tock* every second (toggleable)
- Mechanical *click* feedback on every button
- Warm 4-note bell chime on session completion

### 🎨 Five clock face themes
Classic · Brass · Walnut · Steel · Glass — all free, switchable instantly from the swatch tray.

### 🧠 On-device focus intelligence
No accounts, no servers — your data never leaves the browser

| Feature | What it does |
|---|---|
| **Focus Purity Gauge** | Tracks time-on-tab during focus sessions via the Page Visibility API, displayed on a live skeuomorphic pressure gauge |
| **Focus Insights** | Tap the brass plaque → completion rate, peak focus hour, 7-day purity average, 14-day session chart |
| **Adaptive Session Length** | A lightweight bandit analyzes your last 8 sessions — suggests shorter sessions if you keep abandoning, longer ones if you're crushing it |
| **Streaks & history** | Day streak 🔥, sessions today, and a full session log (completions *and* abandons) persisted in `localStorage` |

---

## 📁 Project structure

```
tempo/
├── index.html              # Markup: clock SVG, controls, modals
├── assets/
│   ├── css/
│   │   └── style.css       # All styling: themes, bezel, gauge, modals
│   └── js/
│       └── app.js          # Timer engine, Web Audio synth, intelligence layer
├── README.md
├── LICENSE
├── CONTRIBUTING.md
└── .gitignore
```

