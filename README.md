# TrustCall — Real-time Deepfake Risk Badges (Hackathon Demo)

**TrustCall** is a Chrome extension that adds an on-device **deepfake risk badge** to every video tile (Meet/Zoom/Teams/etc.) and a **Dashboard** to verify snapshots with a lightweight ML model — all **offline** and **privacy-first** (no cloud).



---

## ✨ Features

- **Risk badge on tiles**  
  Overlays a glossy badge on each `<video>` with:
  - Overall risk level (Green/Amber/Red)
  - Per-signal bars: texture sharpness, color anomaly, frame repeats, and (if available) audio-visual mismatch

- **One-click “Send Snapshot” → Dashboard**  
  Captures the current frame and opens the Dashboard with:
  - Large **preview** of the exact image analyzed
  - **REAL/FAKE probability**
  - **History** with thumbnails + timestamps
  - Webcam input and image upload supported

- **On-device ML inference**  
  Runs entirely in the browser using **ONNX Runtime Web (WASM)**. No data leaves your machine.

- **Live toggle (no page refresh)**  
  Use the popup switch to enable/disable protection in real time.

---

## 🧱 Architecture (high level)

┌──────────────────────────┐ send snapshot ┌─────────────────────────┐
│ Content Script (badge) │ ───────────────────▶ │ Dashboard (onnx/web) │
│ • scans <video> tiles │ │ • preview & predict │
│ • fast heuristics │ ◀── broadcast frame │ • history & sparkline │
│ • “Send Snapshot” btn │ │ • ONNX Runtime (WASM) │
└───────────┬──────────────┘ └──────────┬─────────────┘
│ open tab + stash frame (storage.local) │
└─────────────── Background Service Worker ──────┘

markdown
Copy code

**Heuristic signals (cheap + real-time):**
- **Texture/Detail:** Laplacian variance  
- **Color anomaly (skin):** R↔G correlation drift  
- **Frame repeats:** low inter-frame delta  
- **AV mismatch:** mouth-region motion vs audio energy (when audio exists)

**Model path:**  
Dashboard loads a small binary classifier (e.g., MobileNetV2 variant) exported to **ONNX** and outputs **P(REAL)**.  
Input layout (NCHW vs NHWC) and size are auto-detected on first inference.

---

## 📦 Folder layout

trustcall-extension/
├─ manifest.json
├─ bg.js # MV3 service worker (opens dashboard, handles messages)
├─ popup.html / popup.js # Toolbar popup: enable/disable + open dashboard
├─ content.js # Injected badge + heuristics + snapshot sender
├─ dashboard.html
├─ dashboard.css
├─ dashboard.js # ONNX Runtime Web + preview + history
├─ vendor/ # onnxruntime-web build (JS + WASM)
│ ├─ ort.min.js
│ ├─ ort-wasm.wasm
│ ├─ ort-wasm-simd.wasm
│ ├─ ort-wasm-threaded.wasm
│ └─ ort-wasm-simd-threaded.wasm
└─ onnx_model/
└─ deepfake_detector.onnx

yaml
Copy code

> Swapping your own model? Replace `onnx_model/deepfake_detector.onnx` with your ONNX file.

---

## 🚀 Install (Developer Mode)

1. Clone/download this repo.
2. Open `chrome://extensions` → toggle **Developer mode** (top right).
3. Click **Load unpacked** → select the `trustcall-extension/` folder.
4. Click the toolbar icon → ensure **Protection** is **Enabled**.

---

## 🧪 How to demo

1. Open a video call page (Google Meet/Zoom/Teams) — you’ll see the **TrustCall** badge on each tile.
2. Click **Send Snapshot** on a tile → the **Dashboard** opens with:
   - The **exact frame preview**
   - A **REAL/FAKE** probability + sparkline
3. In the Dashboard, you can also:
   - **Upload Image** → predicts & shows preview
   - **Start Webcam** → click **Predict** for live frames

---

## ⚙️ Defaults (kept simple for demo)

- **Decision threshold:** `0.50`  
- **Input scaling:** `[0, 1]` floats  

> If your model expects MobileNetV2 `[-1,1]` scaling or outputs `P(FAKE)`, adjust `dashboard.js`:
> - scaling in `toTensor()`  
> - post-processing before `updateUI()` (invert or change threshold)

---

## 🔒 Privacy

- 100% **on-device**: frames, audio, and metadata **never** leave the browser.
- Snapshots are only persisted in `chrome.storage.local` briefly to pass to the Dashboard.

---

## ⚠️ Known limitations

- **Cross-origin/DRM video** (e.g., many YouTube embeds) can **taint** canvases → snapshots are blocked by the browser.  
  For the demo, use **Meet/Zoom/Teams** tiles or **webcam**.
- Heuristics are **not** definitive deepfake detection — they surface inconsistencies to guide human judgment.
- The included demo model is **lightweight**; bring a stronger ONNX model for higher accuracy.

---

## 🔧 Troubleshooting

- **“Extension context invalidated”** after reloading the extension:  
  Refresh the page (content script & background must match versions).
- **Snapshot blocked** on some sites:  
  Browser security blocks reading cross-origin video pixels. Try webcam or a video-call tile.

---

## 🛠️ Tech

- Chrome Extension **MV3** (service worker)
- **ONNX Runtime Web** (WASM)
- Vanilla JS/HTML/CSS (no frameworks) for speed + portability

---

## 📝 Submission quick answers (for review forms)

- **Idea Name:** TrustCall — Real-time Deepfake Risk Badges  
- **Description:** Chrome extension that runs on-device deepfake risk signals over live video tiles and verifies snapshots in an offline dashboard using ONNX Runtime Web. Privacy-first, ultra-low latency UI with a one-click “Send Snapshot” flow.  
- **GitHub:** `https://github.com/Bhargavteja-9779/truecall`

---

## 📜 License

MIT © 2025 TrustCall Hackathon Team
