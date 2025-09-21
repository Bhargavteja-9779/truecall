# TrustCall — Real-time Deepfake Detection for Video Calls (WIP)
**Status:** Review-2 progress update (work in progress)  
**Goal:** Edge-only, privacy-preserving cues for detecting deepfake/impersonation risk during live video calls (Meet/Zoom/Teams).  
**Scope right now:** A lightweight Chrome Extension that overlays an explainable **risk badge** on each visible `<video>` tile and computes a few **heuristic signals** on-device.
# TrustCall — Real-time Deepfake Detection for Video Calls (WIP)

**Status:** Review-2 progress update (work in progress)  
**Goal:** Edge-only, privacy-preserving cues for detecting deepfake/impersonation risk during live video calls (Meet/Zoom/Teams).  
**Scope right now:** A lightweight Chrome Extension that overlays an explainable **risk badge** on each visible `<video>` tile and computes a few **heuristic signals** on-device.

---

## Problem (why we’re building this)
Deepfakes can manipulate live video streams, which is risky for telemedicine, exams, hiring, and KYC. We want a low-latency, on-device tool that can raise **actionable suspicion cues** without sending video/audio to the cloud.

---

## What’s implemented so far (Review-2)

- **Chrome Extension (MV3)**
  - **Content script** attaches to `<video>` elements and renders a small **badge** (GREEN/AMBER/RED) with **Score %** and per-signal bars.
  - **Popup controls:** Enable/Disable, FPS (processing rate), Red threshold, and a **Demo Mode** to create occasional synthetic spikes (for demo only).
  - **Runs entirely on-device:** Downscales frames (≈128×128) and processes in the browser; **no network calls**.

- **Heuristic signals (prototype)**
  - **Visual (texture)**: Laplacian variance to catch oversmoothed/oversharp artifacts.
  - **Color anomaly (skin R/G correlation)**: Real skin has high R–G correlation; deviations are suspicious.
  - **Frame repeats**: Ratio of near-identical frames to catch freezes/loops.
  - **AV mismatch (if audio accessible)**: Mouth-region motion vs audio energy correlation (poor lip-sync ⇒ suspicious).

- **Explainability**
  - Badge shows **per-signal contributions**, so reviewers can see *why* the score moved (not a black box).

- **Quick tests done**
  - YouTube sanity check (badge attaches and updates).
  - Google Meet self-meeting (badge overlays; AV may be `n/a` depending on platform’s audio exposure).

---

## Not implemented yet (planned next)

- Face landmarks (blink/pose, better mouth ROI).
- rPPG (remote photoplethysmography) liveness checks.
- WebRTC stats anomalies (fps jitter, keyframes, etc.).
- Lightweight **TF.js** model ensemble (replace/augment heuristics).
- Per-participant history, CSV/JSON export, and session reports.
- Broader cross-platform verification (Zoom/Teams variations).

---

## Architecture snapshot (current)

trustcall-extension/
├─ manifest.json # MV3 manifest
├─ content.js # finds <video> tiles, computes signals, shows badge (Shadow DOM)
├─ popup.html / .js # enable, FPS, threshold, demo mode
└─ docs/ # (optional) screenshots, demo GIFs

yaml
Copy code

- **No background service worker required** in current prototype.
- **No cloud**; all processing is local to the browser tab.

---

## How to run (Chrome, local)

1. Go to `chrome://extensions` → enable **Developer mode**.  
2. Click **Load unpacked** → select the `trustcall-extension/` folder.  
3. Pin the extension and open the popup:
   - **Enable** ✅
   - **FPS:** start at 5
   - **Red threshold:** 60
   - **Demo Mode:** OFF (use briefly in stage demos)
4. Open a page with video (YouTube / Google Meet). Badge should appear on each large tile.

---

## Demo checklist (for reviewers)

- **Baseline GREEN:** talk/move normally.
- **Freeze/loop:** cover cam or pause video → **Frame repeats** rises.
- **Texture stress:** low light or translucent sheet → **Texture** bar rises.
- **AV (if available):** play audio while covering lips → **AV mismatch** rises.
- **Explainability:** point to bars and threshold; no network traffic from the extension.

---

## Known limitations (current prototype)

- **Heuristics only** (not a final detector): meant to surface suspicious cues with low latency.  
- **Audio access** may be blocked by some web clients; we redistribute weights when unavailable.  
- **Mouth ROI** is approximated (landmarks will improve this later).

---

## Prior related work (separate, not integrated yet)

**Image-level classifier (MobileNetV2, 128×128, binary REAL/FAKE)**  
- Base frozen; train only final Dense layer.  
- Adam / BinaryCrossentropy / Accuracy.  
- This was a prior experiment (offline). We will explore **TF.js** to bring a small model into the browser while keeping latency low.

---

## Roadmap (near-term)

- Add face landmarks (MediaPipe-Tasks/WASM) for robust ROIs and blink/pose.  
- Add optional rPPG liveness.  
- Integrate a tiny TF.js model as an additional signal.  
- Export last 60–120s signals (CSV) for audits.  
- Hardening on Zoom/Teams variants.

---

## License
TBD (likely MIT).

## Contact
P. N. Bhargav Teja — building privacy-first, edge-AI demos.
