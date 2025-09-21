# TrustCall — Real-time Deepfake Risk Badges (Hackathon Demo)

A Chrome extension that overlays an on-device **deepfake risk badge** on video tiles (Meet / Zoom / Teams / etc.) and a **Dashboard** to verify snapshots with a lightweight ML model — all **offline** and **privacy-first** (no cloud).

> **Note**: This is a hackathon prototype focused on UX + speed. It is **not** a forensic tool.

---

## ✨ Features

- **Risk badge on every `<video>` tile**
  - Overall risk level: **Green / Amber / Red**
  - Per-signal contributions:
    - **Texture** (detail via Laplacian variance)
    - **Color anomaly** (skin-region R↔G correlation drift)
    - **Frame repeats** (low inter-frame delta)
    - **AV mismatch** (mouth-motion vs. audio energy, when audio is available)

- **One-click “Send Snapshot” → Dashboard**
  - Captures the current frame from a tile
  - Opens the **Dashboard** with a large **preview**, **REAL/FAKE** probability, and a **history** (thumbnails + timestamps)
  - Also supports **Image Upload** and **Webcam** capture

- **On-device ML inference**
  - Uses **ONNX Runtime Web (WASM)** in the browser
  - No frames or metadata leave the machine

- **Live enable/disable (no page refresh)**
  - Toggle protection from the popup; badges react instantly

---

## 🎥 Quick Demo (how to show judges)

1. Load the extension (Developer Mode) and **Enable** it in the popup.  
2. Open a video call (Google Meet or Zoom).  
3. Watch the **badge** render on each participant tile.  
4. Click **Send Snapshot** on any tile → **Dashboard** opens:
   - Sees exact **frame preview**
   - Shows **REAL/FAKE** probability
   - Adds an entry to **History** with a thumbnail
5. (Optional) In the Dashboard, try **Upload Image** or **Start Webcam** → **Predict**.

> Tip: Some sites (YouTube/DRM) block snapshotting because of **tainted canvas**. Use Meet/Zoom/Teams or the webcam for the demo.

---

## 🧱 Architecture

```mermaid
flowchart LR
  subgraph Browser["Chrome (MV3)"]
    CS["Content Script<br/><small>badge + heuristics on each &lt;video&gt;</small>"]
    BG["Background Service Worker<br/><small>opens dashboard, routes messages</small>"]
    POP["Popup (UI)<br/><small>enable/disable, open dashboard</small>"]
    DASH["Dashboard Page<br/><small>preview + ONNX inference</small>"]
  end

  subgraph ORT["ONNX Runtime Web (WASM)"]
    WASM["ort-wasm*.wasm<br/><small>SIMD/threads as available</small>"]
    MODEL["deepfake_detector.onnx<br/><small>P(REAL) binary classifier</small>"]
  end

  CS -- "Send Snapshot" (dataURL) --> BG
  BG -- "create tab + stash frame in storage.local" --> DASH
  CS -- "(broadcast) snapshot" --> DASH
  DASH -- "load" --> ORT
  ORT <-- "run()" --> DASH
Privacy: 100% on-device; snapshots only persist long enough to hand off to the Dashboard via chrome.storage.local.

Resilience: content script pings background before messaging to avoid “extension context invalidated” after reloads.

CSP: extension pages allow 'wasm-unsafe-eval' so ORT-Web can instantiate WASM.

📦 Folder Layout
pgsql
Copy code
trustcall-extension/
├─ manifest.json
├─ bg.js                  # MV3 service worker (opens dashboard, handles messages)
├─ popup.html / popup.js  # Toolbar popup: enable/disable + open dashboard
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
⚙️ Install (Developer Mode)
Clone / Download this repo.

Go to chrome://extensions → Enable Developer mode (top-right).

Click Load unpacked → select the trustcall-extension/ folder.

Click the TrustCall toolbar icon → ensure Protection is Enabled.

🔬 Model Notes
The Dashboard expects a binary classifier that outputs P(REAL).

Input layout is auto-detected on the first run:

NCHW (3×H×W) or NHWC (H×W×3)

Default preprocessing is [0,1] scaling.
If your model expects MobileNetV2 [-1,1] or outputs P(FAKE):

Edit dashboard.js to adjust toTensor() scaling

Invert post-processing before calling updateUI(...)

🧪 Signals (real-time heuristics)
Texture / Detail: Laplacian variance abnormality

Color anomaly (skin): correlation drift between R & G in skin-like pixels

Frame repeats: repeated frames / very low delta

AV mismatch: correlation (mouth motion vs. audio energy), when audio exists

These are heuristics meant to guide a human, not a ground truth detector.

🧰 Troubleshooting
“Extension context invalidated” after reloading the extension
→ Just refresh the page (content script & background must be the same version).

Snapshot fails on certain sites (CORS/tainted canvas)
→ Use webcam or a proper video call tile (Meet/Zoom/Teams) for the demo.

No badges appear
→ Make sure the popup toggle shows Enabled. Some tiny/hidden videos (<120×90) are skipped.

🛣️ Roadmap (nice-to-haves)
Face ROI detection & alignment before model inference

Temporal model (short clip) instead of single frame

Training pipeline & dataset notes in repo

Export settings panel (threshold, scale, invert) for power users

📄 License
MIT © 2025 TrustCall Hackathon Team
