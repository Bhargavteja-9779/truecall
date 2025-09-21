# TrustCall — Real-time Deepfake Risk Badges (Hackathon Demo)

**TrustCall** is a Chrome Extension that adds an on-device **deepfake risk badge** to every participant tile in video calls (Meet/Zoom/Teams, etc.) and a **dashboard** to verify snapshots with a lightweight ML model — all **offline** and **privacy-first** (no cloud).

> ⚠️ Hackathon note: This is a demo prototype built for rapid iteration. It showcases UI/UX, real-time multi-signal heuristics, and an ONNX-Runtime-Web model path. It is **not** a forensic tool.

---

## ✨ What it does

- **Risk badge on tiles**  
  Overlays a glossy, unobtrusive badge on each `<video>` element with:
  - Overall risk score (Green / Amber / Red)
  - Per-signal bars: texture sharpness, color anomaly, frame repeat, and (when available) audio-visual sync.

- **Send Snapshot → Dashboard**  
  One click on a tile captures the current frame and opens the **Dashboard** showing:
  - Big **preview** of the exact image analyzed
  - **REAL/FAKE probability** (from your on-device model)
  - **History** with thumbnails & timestamps
  - Webcam input and image upload supported

- **On-device ML inference**  
  Uses **ONNX Runtime Web (WASM)**. No data leaves the browser.

- **Live toggle (no refresh)**  
  Use the popup’s switch to **enable/disable** protection in real time without reloading pages.

---

## 🧱 Architecture (high level)

┌──────────────────────────┐ send snapshot ┌─────────────────────────┐
│ Content Script (badge) │ ───────────────────▶ │ Dashboard (onnx/web) │
│ • scans <video> tiles │ │ • preview & predict │
│ • lightweight signals │ ◀── broadcast frame │ • history & sparkline │
│ • “Send Snapshot” btn │ │ • ONNX Runtime (WASM) │
└───────────┬──────────────┘ └──────────┬─────────────┘
│ open tab + stash frame (storage.local) │
└─────────────── Background Service Worker ──────┘

markdown
Copy code

**Signals (fast heuristics on each tile):**
- **Texture/Detail** (Laplacian variance)
- **Color anomaly** in detected skin-like pixels (R↔G correlation drift)
- **Frame repeats** (low inter-frame delta)
- **AV mismatch** (correlation between mouth-region motion & audio energy; when audio available)

**Model path:**  
Dashboard runs a small binary classifier (e.g., MobileNetV2 variant) exported to **ONNX**.  
We auto-detect input layout (**NCHW 3×H×W** vs **NHWC H×W×3**) and size; defaults to `P(REAL)`.

---

## 📦 Folder layout

trustcall-extension/
├─ manifest.json
├─ bg.js # MV3 service worker (opens dashboard, handles messages)
├─ popup.html / popup.js # Toolbar popup with Enable/Disable toggle + Open Dashboard
├─ content.js # Injected on pages; draws badge; sends snapshots
├─ dashboard.html
├─ dashboard.css
├─ dashboard.js # ONNX Runtime Web + UI/gloss + preview + history
├─ vendor/
│ ├─ ort.min.js
│ ├─ ort-wasm.wasm
│ ├─ ort-wasm-simd.wasm
│ ├─ ort-wasm-threaded.wasm
│ └─ ort-wasm-simd-threaded.wasm
└─ onnx_model/
└─ deepfake_detector.onnx

yaml
Copy code

> If you’re swapping in your own model, replace  
> `onnx_model/deepfake_detector.onnx` with your ONNX file.

---

## 🚀 Install (Developer Mode)

1. **Clone or download** this repo.
2. Open `chrome://extensions` → **Enable Developer mode** (top-right).
3. Click **Load unpacked** → select the `trustcall-extension/` folder.
4. Click the toolbar icon → make sure **Protection** is **Enabled**.

---

## 🧪 How to demo

1. Open **Google Meet/Zoom/Teams** (or any page with visible `<video>` tiles).  
   You’ll see the **TrustCall** badge appear on each tile.
2. Hit **Send Snapshot** on a tile → a **Dashboard** tab opens with:
   - The **exact frame preview**
   - A **REAL/FAKE** probability & sparkline
3. Alternatively, in the Dashboard:
   - **Upload Image** → predicts & shows preview
   - **Start Webcam** → click Predict for live frames

---

## ⚙️ Settings removed (simplified)
To keep the UX crisp for judges, the earlier Settings panel was removed. Defaults:
- **Decision threshold:** `0.50`
- **Input scaling:** `[0,1]`  
  (If your model expects MobileNetV2 `[-1,1]` scaling or outputs `P(FAKE)`, adjust the lines in `dashboard.js` where noted: `toTensor()` and post-processing.)

---

## 🔒 Privacy

- 100% **on-device**. No frames, audio, or metadata are sent to any server.
- Snapshots are **kept in memory** only long enough to deliver them to the dashboard tab.

---

## ⚠️ Known limitations

- **Cross-origin/DRM video** (e.g., many YouTube embeds) can **taint canvases**; snapshots are blocked by the browser.  
  Use **Meet/Zoom/Teams** tiles or **webcam** for the demo.
- Heuristics are **not** a definitive deepfake detector. They surface inconsistencies to guide a human decision.
- The small demo model is **not production-grade**; bring your own ONNX model for higher accuracy.

---

## 🔧 Dev tips

- Change sampling FPS or thresholds in `content.js` (`CFG.fps`, `CFG.redThreshold`).
- Model input shape auto-adapts on first inference; check the banner in Dashboard for detected layout.

---

## 📜 License

MIT © 2025 TrustCall Hackathon Team

