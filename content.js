(() => {
  'use strict';

  // --------- config ----------
  const CFG = { enabled: true, demoMode: false, fps: 5, redThreshold: 60 };
  try {
    chrome.storage?.sync?.get(CFG).then(v => Object.assign(CFG, v || {}));
    chrome.storage?.onChanged?.addListener((c, area) => {
      if (area !== 'sync') return;
      if (c.enabled) {
        CFG.enabled = c.enabled.newValue;
        for (const tile of Tiles.values()) tile.setEnabled(CFG.enabled);
      }
      for (const k in c) if (k !== 'enabled') CFG[k] = c[k].newValue;
      // Rescan if re-enabled
      if (CFG.enabled) setTimeout(scan, 50);
    });
  } catch (_) {}

  // --------- utils ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  class Ring {
    constructor(n){ this.n=n; this.a=new Array(n); this.i=0; this.size=0; }
    push(v){ this.a[this.i]=v; this.i=(this.i+1)%this.n; this.size=Math.min(this.size+1,this.n); }
    toArray(){ if(this.size<this.n) return this.a.slice(0,this.size);
      const out = new Array(this.n); for(let k=0;k<this.n;k++) out[k]=this.a[(this.i+k)%this.n]; return out; }
  }
  function pearson(x,y){ const n=Math.min(x.length,y.length); if(n<6) return 0;
    let sx=0,sy=0,sxx=0,syy=0,sxy=0;
    for(let i=0;i<n;i++){ const a=x[i]||0,b=y[i]||0; sx+=a; sy+=b; sxx+=a*a; syy+=b*b; sxy+=a*b; }
    const mx=sx/n,my=sy/n, cov=sxy/n-mx*my, vx=sxx/n-mx*mx, vy=syy/n-my*my;
    return clamp( cov / ((Math.sqrt(vx*vy)) || 1e-6), -1, 1);
  }

  // --------- badge UI ----------
  function createBadge(){
    const host = document.createElement('div');
    host.style.position = 'fixed'; host.style.zIndex = '2147483647'; host.style.pointerEvents = 'auto';
    const root = host.attachShadow({mode:'open'});

    const style = document.createElement('style');
    style.textContent = `
      .card{ font:12px/1.25 system-ui, -apple-system, Segoe UI, Roboto;
        background: rgba(14,18,32,0.84); color:#e7ecff;
        border:1px solid rgba(255,255,255,0.14); border-radius:14px;
        box-shadow:0 12px 28px rgba(0,0,0,0.38); backdrop-filter: blur(10px);
        padding:12px 14px; min-width:190px; max-width:280px;
      }
      .row{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin:4px 0; }
      .title{ font-weight:900; letter-spacing:.2px; display:flex; align-items:center; gap:6px; }
      .title i{ font-style:normal; font-size:14px }
      .pill{ padding:2px 8px; border-radius:999px; border:1px solid rgba(255,255,255,0.2); font-size:10px; }
      .pill.green{ background:#10b981; } .pill.amber{ background:#f59e0b; } .pill.red{ background:#ef4444; }
      .bar{ height:6px; background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.18); border-radius:999px; overflow:hidden; flex:1; }
      .bar > i{ display:block; height:100%; width:0%; background: linear-gradient(90deg,#2af598,#009efd); }
      .mini{ font-size:11px; color:#c6ceff; }
      .actions{ display:flex; gap:8px; margin-top:8px; }
      button{ cursor:pointer; border-radius:10px; border:1px solid rgba(255,255,255,0.20);
        background: radial-gradient(120px 60px at 20% -40%, rgba(255,255,255,0.28), transparent),
                    linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06));
        color:#0b1326; font-weight:800; padding:7px 10px; }
      .toast{ position:fixed; left:8px; top:-9999px; opacity:0; transition:all .3s ease; z-index:2147483647;
        font:12px system-ui; background:#0f172a; color:#dbeafe; border:1px solid #334155; padding:8px 10px; border-radius:10px; }
      .toast.show{ top:8px; opacity:1; }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `
      <div class="row">
        <div class="title"><i>🛡️</i>TrustCall</div>
        <div id="level" class="pill green">GREEN</div>
      </div>

      <div class="row mini"><div>Score</div><div id="score">0%</div></div>
      <div class="bar"><i id="scoreb"></i></div>

      <div class="row mini"><div>Visual (texture)</div><div id="vtex">0%</div></div>
      <div class="bar"><i id="vtexb"></i></div>

      <div class="row mini"><div>Color anomaly</div><div id="vcol">0%</div></div>
      <div class="bar"><i id="vcolb"></i></div>

      <div class="row mini"><div>Frame repeats</div><div id="vrep">0%</</div></div>
      <div class="bar"><i id="vrepb"></i></div>

      <div class="row mini"><div>AV mismatch</div><div id="avmx">n/a</div></div>
      <div class="bar"><i id="avmxb"></i></div>

      <div class="actions">
        <button id="send">Send Snapshot</button>
      </div>
    `;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = 'Snapshot sent to Dashboard';

    root.appendChild(style); root.appendChild(wrap); root.appendChild(toast);
    document.body.appendChild(host);

    return {
      host,
      level:  wrap.querySelector('#level'),
      score:  wrap.querySelector('#score'),
      scoreb: wrap.querySelector('#scoreb'),
      vtex:   wrap.querySelector('#vtex'),
      vtexb:  wrap.querySelector('#vtexb'),
      vcol:   wrap.querySelector('#vcol'),
      vcolb:  wrap.querySelector('#vcolb'),
      vrep:   wrap.querySelector('#vrep'),
      vrepb:  wrap.querySelector('#vrepb'),
      avmx:   wrap.querySelector('#avmx'),
      avmxb:  wrap.querySelector('#avmxb'),
      send:   wrap.querySelector('#send'),
      toast
    };
  }

  function flashToast(el, msg){
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
  }

  function updateBadgeUI(els, s){
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
    if (s.hasAudio){ els.avmx.textContent = (s.av*100).toFixed(0) + '%'; els.avmxb.style.width = (s.av*100).toFixed(0) + '%'; }
    else { els.avmx.textContent = 'n/a'; els.avmxb.style.width = '0%'; }
  }

  // --------- analyzer ----------
  class Analyzer {
    constructor(video){
      this.video = video;
      this.canvas = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(128, 128)
        : Object.assign(document.createElement('canvas'), { width:128, height:128 });
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.prevGray = null; this.repeatCount=0; this.totalFrames=0;
      this.motionSeries = new Ring(64); this.audioSeries = new Ring(64);
      this.hasAudio=false; this._roiPrev=null;
      this.initAudio();
    }
    initAudio(){
      try{
        const s = this.video.captureStream?.(); if (!s) return;
        const aTracks = s.getAudioTracks(); if (!aTracks?.length) return;
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const src = actx.createMediaStreamSource(s);
        const analyser = actx.createAnalyser(); analyser.fftSize=512; src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        this.audioPoll = () => {
          analyser.getByteTimeDomainData(buf);
          let sum=0; for (let i=0;i<buf.length;i++){ const v=(buf[i]-128)/128; sum+=v*v; }
          this.audioSeries.push(Math.sqrt(sum/buf.length));
        };
        this.hasAudio = true;
      } catch(e){ this.hasAudio=false; }
    }
    laplacianVar(g,W,H){
      let s=0,s2=0,n=0; const idx=(x,y)=>y*W+x;
      for(let y=1;y<H-1;y++){ for(let x=1;x<W-1;x++){
        const v=(g[idx(x,y-1)]+g[idx(x-1,y)]-4*g[idx(x,y)]+g[idx(x+1,y)]+g[idx(x,y+1)]);
        s+=v; s2+=v*v; n++;
      }}
      const m=s/n; return s2/n - m*m;
    }
    lowerFaceMotion(gray,W,H){
      const x0=(W*.35)|0,x1=(W*.65)|0,y0=(H*.55)|0,y1=(H*.85)|0; let sum=0,cnt=0;
      if (!this._roiPrev) this._roiPrev = new Uint8Array(W*H);
      for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++){
        const i=y*W+x; sum+=Math.abs(gray[i]-this._roiPrev[i]); this._roiPrev[i]=gray[i]; cnt++;
      }
      return clamp((sum/(cnt*255))*4, 0, 1);
    }
    sample(){
      const v=this.video; if (v.readyState<2) return null;
      const W=128,H=128; this.ctx.drawImage(v,0,0,W,H);
      const {data}=this.ctx.getImageData(0,0,W,H);
      const gray = new Uint8Array(W*H);
      let sumR=0,sumG=0,sumB=0,nSkin=0,sumRG=0,sumR2=0,sumG2=0;
      for (let i=0,j=0;i<data.length;i+=4,j++){
        const r=data[i],g=data[i+1],b=data[i+2];
        gray[j]=(r*299 + g*587 + b*114 + 500)/1000|0;
        const maxc=Math.max(r,g,b), minc=Math.min(r,g,b);
        if(r>95 && g>40 && b>20 && (maxc-minc)>15 && Math.abs(r-g)>15 && r>g && r>b){
          sumR+=r; sumG+=g; sumB+=b; sumRG+=r*g; sumR2+=r*r; sumG2+=g*g; nSkin++;
        }
      }
      let motion=0; if (this.prevGray){ let diff=0; for(let k=0;k<gray.length;k++) diff+=Math.abs(gray[k]-this.prevGray[k]); motion=diff/(gray.length*255); }
      this.prevGray = gray; if(motion<0.005) this.repeatCount++; this.totalFrames++;

      const lapVar = this.laplacianVar(gray,W,H);
      let colorSusp=0.1;
      if (nSkin>50){
        const n=nSkin, meanR=sumR/n, meanG=sumG/n, covRG=sumRG/n-meanR*meanG, varR=sumR2/n-meanR*meanR, varG=sumG2/n-meanG*meanG;
        const corrRG = covRG / (Math.sqrt(varR*varG) + 1e-6);
        if (corrRG < 0.75) colorSusp = clamp((0.75-corrRG)/0.35, 0, 1);
        else if (corrRG > 0.995) colorSusp = 0.2; else colorSusp=0.0;
      }
      let texSusp=0; if (lapVar<10) texSusp=clamp((10-lapVar)/10,0,1); else if (lapVar>80) texSusp=clamp((lapVar-80)/40,0,1);
      const vrep = clamp(this.repeatCount / Math.max(this.totalFrames,1), 0, 1);

      const mouthMotion = this.lowerFaceMotion(gray,W,H); this.motionSeries.push(mouthMotion);
      if (this.audioPoll) this.audioPoll();
      let avMismatch=0; if (this.hasAudio){ const c=Math.abs(pearson(this.motionSeries.toArray(), this.audioSeries.toArray())); avMismatch=1-c; }

      return { texSusp, colorSusp, vrep, avMismatch, hasAudio:this.hasAudio };
    }
    async getJPEGDataURL(q=0.92){
      try{
        this.ctx.drawImage(this.video,0,0,128,128);
        if (this.canvas.convertToBlob){
          const blob = await this.canvas.convertToBlob({ type:'image/jpeg', quality:q });
          const dataUrl = await new Promise(res => { const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(blob); });
          return dataUrl;
        }
        return this.canvas.toDataURL('image/jpeg', q);
      } catch (e){
        throw new Error('Snapshot blocked by site (CORS/tainted canvas). Try webcam/Meet tiles.');
      }
    }
  }

  class Tile {
    constructor(video){
      this.video=video; this.badge=createBadge(); this.an=new Analyzer(video);
      this._raf=null; this._last=0; this._box={x:0,y:0,w:0,h:0}; this._enabled = CFG.enabled;
      this.badge.send.addEventListener('click', () => this.sendSnapshot());
      this.loop();
    }
    setEnabled(on){
      this._enabled = on;
      this.badge.host.style.display = on ? 'block' : 'none';
      // If turned on and no loop running, restart
      if (on && !this._raf) this.loop();
      // If turned off, we keep the rAF loop but bail early inside tick (cheap).
    }
    loop(){
      const tick = () => {
        this.position();
        if (this._enabled){
          const stepMs=Math.max(1000/CFG.fps, 80);
          if (!this._last || (performance.now()-this._last)>=stepMs){
            this._last=performance.now();
            const m=this.an.sample();
            if (m){
              let wT=.35,wC=.25,wR=.20,wA=.20;
              if (!m.hasAudio){ const k=wA/3; wT+=k; wC+=k; wR+=k; wA=0; }
              let tex=m.texSusp,col=m.colorSusp,rep=m.vrep,av=m.avMismatch;
              if (CFG.demoMode && Math.random()<.02){ const b=Math.random()*.5; tex=clamp(tex+b,0,1); col=clamp(col+b,0,1); rep=clamp(rep+b,0,1); }
              const score01 = clamp(wT*tex + wC*col + wR*rep + wA*av, 0, 1);
              updateBadgeUI(this.badge, { score:score01*100, vtex:tex, vcol:col, vrep:rep, av:av, hasAudio:m.hasAudio });
            }
          }
        }
        this._raf=requestAnimationFrame(tick);
      }; this._raf=requestAnimationFrame(tick);
      // Initial visibility
      this.badge.host.style.display = this._enabled ? 'block' : 'none';
    }
    rect(){ const r=this.video.getBoundingClientRect(); return { x:Math.max(0,r.left+6)+window.scrollX, y:Math.max(0,r.top+6)+window.scrollY, w:r.width, h:r.height }; }
    position(){
      const r=this.rect();
      if (Math.abs(r.x-this._box.x)+Math.abs(r.y-this._box.y)+Math.abs(r.w-this._box.w)+Math.abs(r.h-this._box.h)>1){
        this.badge.host.style.left = `${r.x + 8}px`;
        this.badge.host.style.top  = `${r.y + 8}px`;
        this._box=r;
      }
    }
    async sendSnapshot(){
      const toast = this.badge.toast;

      // 0) If disabled, do nothing but hint to user
      if (!this._enabled){ flashToast(toast, 'Enable in popup to send'); return; }

      // 1) Grab frame (handles tainted canvas)
      let dataUrl;
      try { dataUrl = await this.an.getJPEGDataURL(0.92); }
      catch (e) { console.error('Snapshot grab failed', e); flashToast(toast, e.message || 'Snapshot blocked by site'); return; }

      // 2) Ping background to ensure messaging is alive
      const ping = () => new Promise((resolve, reject) => {
        try { chrome.runtime.sendMessage({ type: 'trustcall:ping' }, () => {
          const err = chrome.runtime.lastError; if (err) reject(err); else resolve(true);
        }); } catch (e) { reject(e); }
      });
      try { await ping(); } catch (e) { flashToast(toast, 'Extension updated — refresh page'); return; }

      try {
        await chrome.storage.local.set({ pendingSnapshot: dataUrl });
        await new Promise((resolve, reject) => {
          try {
            chrome.runtime.sendMessage(
              { type:'trustcall:openDashboardWithSnapshot', dataUrl },
              (resp) => { const err = chrome.runtime.lastError; if (err) reject(err); else resolve(resp); }
            );
          } catch (e) { reject(e); }
        });
        try { chrome.runtime.sendMessage({ type:'trustcall:snapshot', dataUrl }); } catch(_) {}
        flashToast(toast, 'Snapshot sent to Dashboard');
      } catch (e) {
        console.error('Send snapshot failed', e);
        const msg = (e && e.message && e.message.includes('Extension context invalidated'))
          ? 'Extension updated — refresh page'
          : (e.message || 'Snapshot failed');
        flashToast(toast, msg);
      }
    }
  }

  const Tiles = new Map();
  function attach(v){
    if (!CFG.enabled) return;
    if (Tiles.has(v)) return;
    const r=v.getBoundingClientRect(); if (r.width<120 || r.height<90) return;
    const tile = new Tile(v);
    tile.setEnabled(CFG.enabled);
    Tiles.set(v, tile);
  }
  function scan(){ document.querySelectorAll('video').forEach(attach); }

  const mo = new MutationObserver(() => scan());
  mo.observe(document.documentElement||document.body, { childList:true, subtree:true });
  setTimeout(scan, 500);
})();
