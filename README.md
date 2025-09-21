<div align="center">

# TrustCall — Real-time Deepfake Risk Badges (On-device)

**Chrome extension** that overlays an on-device **deepfake risk badge** on live video tiles (Meet / Zoom / Teams / etc.) and a **Dashboard** that verifies snapshots with a lightweight ML model — all **offline** and **privacy-first** (no cloud).


</div>

---

## Features

- ✅ **Risk badge** on each video tile  
  — Overall: **Green / Amber / Red**  
  — Per-signal bars: **Texture**, **Color anomaly**, **Frame repeats**, **AV mismatch** (if audio available)

- ✅ **One-click “Send Snapshot” → Dashboard**  
  — Shows the **exact frame preview**, **REAL/FAKE probability**, **history** with thumbnails  
  — Also supports **Image Upload** and **Webcam**

- ✅ **On-device ML inference** (no cloud)  
  — Uses **ONNX Runtime Web (WASM)** in the browser

- ✅ **Live enable/disable**  
  — Popup switch toggles protection **without** reloading pages

---

## Architecture (robust text diagram)

```text
┌─────────────────────────────────────────────────────────────────────┐
│                       Chrome Extension (MV3)                        │
│                                                                     │
│  Content Script (content.js)     Background (bg.js)                 │
│  • Finds <video> tiles           • Receives snapshot message        │
│  • Draws risk badge              • Stashes frame in storage.local   │
│  • Heuristics @ ~5 FPS           • Opens dashboard.html tab         │
│  • “Send Snapshot” → message  ───────────────────────────────────┐   │
│                                                    message + tab │   │
└──────────────────────────────────────────────────────────────────┼───┘
                                                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Dashboard (HTML)                            │
│  • Shows exact frame preview                                         │
│  • Runs ONNX model in browser (WASM)                                 │
│  • REAL/FAKE probability, history, sparkline                         │
│  • Webcam / Upload predict                                           │
│                                                                     │
│  ONNX Runtime Web (vendor/ort*.wasm) + Model (onnx_model/*.onnx)    │
│  • 100% on-device; no network calls                                  │
└─────────────────────────────────────────────────────────────────────┘
Privacy: 100% on-device; snapshots are stored only briefly in chrome.storage.local to pass them to the Dashboard tab.
Resilience: content script pings background before messaging to avoid “extension context invalidated” after reloads.
CSP: extension pages allow 'wasm-unsafe-eval' so ONNX Runtime Web can instantiate WASM (web pages remain locked down).

Folder Layout
text
Copy code
trustcall-extension/
├─ manifest.json
├─ bg.js                  # MV3 service worker (opens dashboard, handles messages)
├─ popup.html
├─ popup.js               # Toolbar popup: enable/disable + open dashboard
├─ content.js             # Injected badge + heuristics + snapshot sender
├─ dashboard.html
├─ dashboard.css
├─ dashboard.js           # ONNX Runtime Web + preview + history + inference
├─ vendor/
│  ├─ ort.min.js
│  ├─ ort-wasm.wasm
│  ├─ ort-wasm-simd.wasm
│  ├─ ort-wasm-threaded.wasm
│  └─ ort-wasm-simd-threaded.wasm
└─ onnx_model/
   └─ deepfake_detector.onnx
To use your own model, replace onnx_model/deepfake_detector.onnx.

Install (Developer Mode)
Clone / Download this repo.

Open chrome://extensions → toggle Developer mode.

Click Load unpacked → select the trustcall-extension/ folder.

Click the TrustCall toolbar icon → ensure Protection is Enabled.

How to Demo
Open a video call page (Google Meet / Zoom / Teams) — the TrustCall badge appears on each visible tile.

Click Send Snapshot on a tile → Dashboard opens with:

The exact frame preview

REAL/FAKE probability + sparkline

History with thumbnails

In the Dashboard:

Upload Image → predicts & shows preview

Start Webcam → click Predict for live frames

Toggle Protection in the popup to hide/show badges without reloading the page.

Some sites (DRM/cross-origin videos) block snapshots due to tainted canvas. Use Meet/Zoom/Teams tiles or the Webcam for the demo.

Model Notes
The Dashboard expects a binary classifier outputting P(REAL).

Input layout is auto-detected at runtime:
— NCHW (1, 3, H, W) or NHWC (1, H, W, 3)

Default pixel scaling is [0,1].
If your model expects MobileNetV2 [-1,1] or outputs P(FAKE):

Change scaling in dashboard.js (toTensor()), and/or

Invert probability (pReal = 1 - raw).

Current demo model (from Colab):

Backbone: MobileNetV2 (ImageNet weights, frozen)

Head: GAP → Dense(1, sigmoid)

Input: 128×128×3

Training: Adam(1e-4), Binary Crossentropy, Accuracy/AUC

Test accuracy: ~86% on our dataset (demo-grade)

Heuristic Signals (explainability)
Texture / Detail — Laplacian variance abnormality

Color anomaly (skin) — R↔G correlation drift in skin-like pixels

Frame repeats — very low inter-frame delta

AV mismatch — correlation between mouth-region motion and audio energy (when audio exists)

Risk fusion (0–100): weighted sum of the four signals
Default weights: texture 0.35, color 0.25, repeats 0.20, av 0.20 (redistribute if no audio)
Bands: GREEN < 30, AMBER 30–<60, RED ≥ 60

Troubleshooting
“Extension context invalidated” after reloading extension → Refresh the page.

Snapshot blocked on some sites (CORS/DRM) → Use webcam or a video-call tile.

Model load errors (“no available backend”) → Ensure vendor/ort*.wasm files exist and CSP is set in manifest.json.

Invalid dimensions when running ONNX → Dashboard auto-detects NCHW/NHWC and retries once.

Submission Quick Answers
Idea Name: TrustCall — Real-time Deepfake Risk Badges

Description: Chrome extension that runs on-device deepfake risk signals over live video tiles and verifies snapshots in an offline dashboard using ONNX Runtime Web. Privacy-first, ultra-low-latency UI with a one-click “Send Snapshot” flow.

GitHub: https://github.com/Bhargavteja-9779/truecall

License
MIT © 2025 TrustCall Hackathon Team
