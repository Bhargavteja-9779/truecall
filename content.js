(() => {
  "use strict";

  // --- Config (updated live from storage) ---
  const CFG = {
    enabled: true,
    demoMode: false,
    fps: 5,                 // processing rate
    redThreshold: 60        // % score for Red
  };

  // Storage sync -> live update
  chrome.storage?.sync?.get(CFG).then((v) => Object.assign(CFG, v));
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const k in changes) CFG[k] = changes[k].newValue;
  });

  // --- Utilities ---
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mean = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const std = arr => {
    if (!arr.length) return 0;
    const m = mean(arr);
    return Math.sqrt(mean(arr.map(x => (x - m) ** 2)));
  };

  class Ring {
    constructor(n) { this.n = n; this.a = new Array(n); this.i = 0; this.size = 0; }
    push(v){ this.a[this.i] = v; this.i = (this.i+1)%this.n; this.size = Math.min(this.size+1, this.n); }
    toArray(){
      if (this.size < this.n) return this.a.slice(0,this.size);
      const out = new Array(this.n);
      for (let k=0;k<this.n;k++) out[k] = this.a[(this.i+k)%this.n];
      return out;
    }
  }

  function pearson(x, y){
    const n = Math.min(x.length, y.length);
    if (n < 6) return 0;
    let sx=0, sy=0, sxx=0, syy=0, sxy=0;
    for (let i=0;i<n;i++){
      const a = x[i], b = y[i];
      sx+=a; sy+=b; sxx+=a*a; syy+=b*b; sxy+=a*b;
    }
    const cov = sxy/n - (sx/n)*(sy/n);
    const vx  = sxx/n - (sx/n)**2;
    const vy  = syy/n - (sy/n)**2;
    const denom = Math.sqrt(vx*vy) || 1e-6;
    return clamp(cov/denom, -1, 1);
  }

  // --- Badge UI (Shadow DOM to avoid site CSS conflicts) ---
  function createBadge(){
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '2147483647'; // top-most
    const root = host.attachShadow({mode:'open'});
    const style = document.createElement('style');
    style.textContent = `
      .card {
        font: 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell;
        background: rgba(18,18,20,0.80);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 10px;
        box-shadow: 0 6px 18px rgba(0,0,0,0.35);
        padding: 8px 10px;
        min-width: 140px;
        max-width: 220px;
        backdrop-filter: blur(6px);
      }
      .row { display:flex; align-items:center; justify-content:space-between; gap:8px; margin: 2px 0; }
      .risk { font-weight: 700; }
      .pill { padding: 2px 6px; border-radius: 999px; font-size: 10px; border: 1px solid rgba(255,255,255,0.2);}
      .pill.green { background:#0b3; }
      .pill.amber { background:#e8a500; }
      .pill.red   { background:#d22; }
      .bar { height: 6px; background: rgba(255,255,255,0.15); border-radius: 6px; overflow:hidden; flex:1; }
      .bar > i { display:block; height:100%; width:0%; background: linear-gradient(90deg,#3af,#8ff); }
      .mini { font-size:10px; opacity:0.85; }
    `;
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `
      <div class="row">
        <div class="risk">TrustCall</div>
        <div id="level" class="pill green">GREEN</div>
      </div>
      <div class="row"><div>Score</div><div id="score" class="mini">0%</div></div>
      <div class="bar"><i id="scorebar" style="width:0%"></i></div>
      <div class="row mini"><div>Visual (texture)</div><div id="vtex">0%</div></div>
      <div class="bar"><i id="vtexbar" style="width:0%"></i></div>
      <div class="row mini"><div>Color anomaly</div><div id="vcol">0%</div></div>
      <div class="bar"><i id="vcolbar" style="width:0%"></i></div>
      <div class="row mini"><div>Frame repeats</div><div id="vrep">0%</div></div>
      <div class="bar"><i id="vrepbar" style="width:0%"></i></div>
      <div class="row mini"><div>AV mismatch</div><div id="avmx">n/a</div></div>
      <div class="bar"><i id="avmxbar" style="width:0%"></i></div>
    `;
    root.appendChild(style); root.appendChild(wrap);
    document.body.appendChild(host);
    const els = {
      host,
      level:  root.getElementById('level'),
      score:  root.getElementById('score'),
      scoreb: root.getElementById('scorebar'),
      vtex:   root.getElementById('vtex'),
      vtexb:  root.getElementById('vtexbar'),
      vcol:   root.getElementById('vcol'),
      vcolb:  root.getElementById('vcolbar'),
      vrep:   root.getElementById('vrep'),
      vrepb:  root.getElementById('vrepbar'),
      avmx:   root.getElementById('avmx'),
      avmxb:  root.getElementById('avmxbar')
    };
    return els;
  }

  function setBadge(els, s){
    // s: {score, vtex, vcol, vrep, av, hasAudio}
    const lvl = s.score >= CFG.redThreshold ? 'red' : (s.score >= 30 ? 'amber' : 'green');
    els.level.textContent = lvl.toUpperCase();
    els.level.className = 'pill ' + lvl;
    els.score.textContent = s.score.toFixed(0) + '%';
    els.scoreb.style.width = s.score.toFixed(0) + '%';
    els.vtex.textContent = (s.vtex*100).toFixed(0) + '%';
    els.vtexb.style.width = (s.vtex*100).toFixed(0) + '%';
    els.vcol.textContent = (s.vcol*100).toFixed(0) + '%';
    els.vcolb.style.width = (s.vcol*100).toFixed(0) + '%';
    els.vrep.textContent = (s.vrep*100).toFixed(0) + '%';
    els.vrepb.style.width = (s.vrep*100).toFixed(0) + '%';
    if (s.hasAudio){
      els.avmx.textContent = (s.av*100).toFixed(0) + '%';
      els.avmxb.style.width = (s.av*100).toFixed(0) + '%';
    } else {
      els.avmx.textContent = 'n/a';
      els.avmxb.style.width = '0%';
    }
  }

  // --- Video Analyzer (heuristic, model-free, realtime) ---
  class Analyzer {
    constructor(video){
      this.video = video;
      this.canvas = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(128, 128)
        : Object.assign(document.createElement('canvas'), {width:128, height:128});
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.prevGray = null;
      this.repeatCount = 0;
      this.totalFrames = 0;
      this.motionSeries = new Ring(64);
      this.audioSeries  = new Ring(64);
      this.hasAudio = false;
      this.audioInit();
    }

    audioInit(){
      try {
        const s = this.video.captureStream?.();
        if (!s) return;
        const aTracks = s.getAudioTracks();
        if (!aTracks || aTracks.length === 0) return;

        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const source = actx.createMediaStreamSource(s);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        this.audioPoll = () => {
          analyser.getByteTimeDomainData(buf);
          // RMS amplitude 0..1
          let sum=0;
          for (let i=0;i<buf.length;i++){ const v=(buf[i]-128)/128; sum+=v*v; }
          const rms = Math.sqrt(sum/buf.length);
          this.audioSeries.push(rms);
        };
        this.hasAudio = true;
      } catch (e) {
        this.hasAudio = false;
      }
    }

    sampleFrame(){
      const v = this.video;
      if (v.readyState < 2) return null;
      const W = 128, H = 128;
      this.ctx.drawImage(v, 0, 0, W, H);
      const {data} = this.ctx.getImageData(0,0,W,H);

      // Compute grayscale + some stats
      const gray = new Uint8Array(W*H);
      let sumR=0,sumG=0,sumB=0, nSkin=0, sumRG=0, sumR2=0, sumG2=0;
      for (let i=0, j=0; i<data.length; i+=4, j++){
        const r=data[i], g=data[i+1], b=data[i+2];
        const y = (r*299 + g*587 + b*114 + 500)/1000|0;
        gray[j] = y;

        // simple skin filter (not perfect, good enough for stats)
        const maxc = Math.max(r,g,b), minc = Math.min(r,g,b);
        if (r>95 && g>40 && b>20 && (maxc-minc)>15 && Math.abs(r-g)>15 && r>g && r>b){
          sumR += r; sumG += g; sumB += b;
          sumRG += r*g; sumR2 += r*r; sumG2 += g*g;
          nSkin++;
        }
      }

      // Motion energy
      let motion = 0;
      if (this.prevGray){
        let diffSum = 0;
        for (let k=0;k<gray.length;k++){
          diffSum += Math.abs(gray[k] - this.prevGray[k]);
        }
        motion = diffSum / (gray.length * 255); // ~0..1
      }
      this.prevGray = gray;

      // Frame repeat (near-identical)
      if (motion < 0.005) this.repeatCount++;
      this.totalFrames++;

      // Laplacian variance (texture sharpness / inconsistency)
      const lapVar = this.laplacianVar(gray, W, H);

      // Color correlation on skin pixels
      let colorSusp = 0.0;
      if (nSkin > 50){ // compute Pearson corr for R,G across skin
        const n = nSkin;
        const meanR = sumR/n, meanG = sumG/n;
        const covRG = sumRG/n - meanR*meanG;
        const varR  = sumR2/n - meanR*meanR;
        const varG  = sumG2/n - meanG*meanG;
        const corrRG = covRG / (Math.sqrt(varR*varG) + 1e-6);
        // Suspicious if RG correlation too low (skin usually high ~0.8-0.95)
        if (corrRG < 0.75) colorSusp = clamp((0.75 - corrRG)/0.35, 0, 1);
        else if (corrRG > 0.995) colorSusp = 0.2; // unnatural near-constant
        else colorSusp = 0.0;
      } else {
        // Not enough skin pixels: neutral
        colorSusp = 0.1;
      }

      // Map lapVar into [0..1] suspicion: too smooth or too odd
      // Typical 128x128 lapVar for face ~ [12..60]; outside => suspicious
      let texSusp = 0.0;
      if (lapVar < 10) texSusp = clamp((10 - lapVar)/10, 0, 1);        // oversmoothed
      else if (lapVar > 80) texSusp = clamp((lapVar - 80)/40, 0, 1);   // artifacty/oversharp
      else texSusp = 0.0;

      // Frame repeat rate over short window (kept as running ratio)
      const vrep = clamp(this.repeatCount / Math.max(this.totalFrames,1), 0, 1);

      // Mouth-motion proxy (lower-middle region motion) vs audio RMS correlation
      // Without landmarks, approximate region box:
      const mouthMotion = this.lowerFaceMotion(gray, W, H); // 0..1
      this.motionSeries.push(mouthMotion);
      if (this.audioPoll) this.audioPoll();

      let avMismatch = 0.0;
      if (this.hasAudio){
        const x = this.motionSeries.toArray();
        const y = this.audioSeries.toArray();
        const c = Math.abs(pearson(x, y)); // 0..1
        avMismatch = 1 - c; // higher => worse sync
      }

      return {
        texSusp,    // 0..1
        colorSusp,  // 0..1
        vrep,       // 0..1
        avMismatch, // 0..1
        hasAudio: this.hasAudio
      };
    }

    laplacianVar(gray, W, H){
      // 3x3 Laplacian kernel [0,1,0;1,-4,1;0,1,0], return variance of response
      let s=0, s2=0, n=0;
      const idx = (x,y)=>y*W+x;
      for (let y=1;y<H-1;y++){
        for (let x=1;x<W-1;x++){
          const v = (
            gray[idx(x,y-1)] + gray[idx(x-1,y)] - 4*gray[idx(x,y)] + gray[idx(x+1,y)] + gray[idx(x,y+1)]
          );
          s += v; s2 += v*v; n++;
        }
      }
      const mean = s/n;
      return s2/n - mean*mean; // variance
    }

    lowerFaceMotion(gray, W, H){
      // box: x in [0.35..0.65], y in [0.55..0.85]
      const x0 = (W*0.35)|0, x1=(W*0.65)|0, y0=(H*0.55)|0, y1=(H*0.85)|0;
      let sum=0, cnt=0;
      for (let y=y0;y<y1;y++){
        for (let x=x0;x<x1;x++){
          const i = y*W+x;
          const curr = gray[i];
          const prev = this._prevROIPixel?.[i] ?? curr;
          sum += Math.abs(curr - prev);
          cnt++;
        }
      }
      if (!this._prevROIPixel) this._prevROIPixel = new Uint8Array(W*H);
      // store only ROI
      for (let y=y0;y<y1;y++){
        for (let x=x0;x<x1;x++){
          const i = y*W+x;
          this._prevROIPixel[i] = gray[i];
        }
      }
      return clamp((sum / (cnt*255))*4, 0, 1); // scaled
    }
  }

  // --- Tracker for each <video> ---
  class Tile {
    constructor(video){
      this.video = video;
      this.badge = createBadge();
      this.an = new Analyzer(video);
      this._raf = null;
      this._tick = 0;
      this._lastBox = {x:0,y:0,w:0,h:0};
      this.start();
    }
    start(){
      const stepMs = Math.max(1000/CFG.fps, 60);
      const loop = (t) => {
        if (!CFG.enabled) { this.hide(); this._raf = requestAnimationFrame(loop); return; }
        this.show();
        // position badge near top-left of the video tile
        this.position();
        // sample & compute
        if (!this._lastSample || (performance.now() - this._lastSample) >= stepMs){
          this._lastSample = performance.now();
          const m = this.an.sampleFrame();
          if (m){
            // weights; if no audio, redistribute its weight
            let wTex=0.35, wCol=0.25, wRep=0.20, wAv=0.20;
            if (!m.hasAudio){
              const k = wAv/3;
              wTex += k; wCol += k; wRep += k; wAv = 0;
            }
            // Optional Demo Mode: inject stress spikes (clearly marked by randomness)
            let tex = m.texSusp, col = m.colorSusp, rep = m.vrep, av = m.avMismatch;
            if (CFG.demoMode && (Math.random() < 0.02)) {
              tex = clamp(tex + Math.random()*0.5, 0, 1);
              col = clamp(col + Math.random()*0.5, 0, 1);
              rep = clamp(rep + Math.random()*0.5, 0, 1);
            }
            let score01 = clamp(wTex*tex + wCol*col + wRep*rep + wAv*av, 0, 1);
            const score = score01 * 100;

            setBadge(this.badge, {
              score, vtex: tex, vcol: col, vrep: rep, av: av, hasAudio: m.hasAudio
            });
          }
        }
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    stop(){ if (this._raf) cancelAnimationFrame(this._raf); }
    rect(){
      const r = this.video.getBoundingClientRect();
      return { x: Math.max(0, r.left+6), y: Math.max(0, r.top+6), w: r.width, h: r.height };
    }
    position(){
      const r = this.rect();
      if (Math.abs(r.x - this._lastBox.x) + Math.abs(r.y - this._lastBox.y) > 1 ||
          Math.abs(r.w - this._lastBox.w) + Math.abs(r.h - this._lastBox.h) > 1) {
        this.badge.host.style.left = `${r.x + 8 + window.scrollX}px`;
        this.badge.host.style.top  = `${r.y + 8 + window.scrollY}px`;
        this._lastBox = r;
      }
    }
    show(){ this.badge.host.style.display = 'block'; }
    hide(){ this.badge.host.style.display = 'none'; }
  }

  // --- Discover <video> tiles and attach analyzers ---
  const Tiles = new Map();
  function attachToVideo(v){
    if (Tiles.has(v)) return;
    // Skip tiny thumbnails
    const r = v.getBoundingClientRect();
    if (r.width < 120 || r.height < 90) return;
    const t = new Tile(v);
    Tiles.set(v, t);
    const onRemove = () => { t.stop(); Tiles.delete(v); v.removeEventListener('remove', onRemove); };
    v.addEventListener('remove', onRemove);
  }

  function scan(){
    if (!CFG.enabled) return;
    document.querySelectorAll('video').forEach(attachToVideo);
  }

  // Observe DOM changes (Meet/Zoom dynamically attach tiles)
  const mo = new MutationObserver(() => scan());
  mo.observe(document.documentElement || document.body, { childList:true, subtree:true });
  // initial
  setTimeout(scan, 1200);

})();
