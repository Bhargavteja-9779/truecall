'use strict';

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);

/* ---------- ORT (MV3-safe WASM) ---------- */
if (typeof ort === 'undefined') console.error('onnxruntime-web not loaded');

const ORT_BASE = chrome.runtime.getURL('vendor/');
ort.env.wasm.wasmPaths = {
  'ort-wasm.wasm': ORT_BASE + 'ort-wasm.wasm',
  'ort-wasm-simd.wasm': ORT_BASE + 'ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm': ORT_BASE + 'ort-wasm-threaded.wasm',
  'ort-wasm-simd-threaded.wasm': ORT_BASE + 'ort-wasm-simd-threaded.wasm',
};
ort.env.wasm.numThreads = 1;

/* ---------- state ---------- */
let session = null, inputName = null;
let inputSpec = { isNCHW:false, H:128, W:128, initialized:false };
const preds = [];
let runningStream = null;
let lastPreviewURL = null;

/* ---------- preview helpers ---------- */
function setPreviewURL(url){
  const img = $('#preview'), vid = $('#video');
  if (lastPreviewURL && lastPreviewURL.startsWith('blob:')) { try{ URL.revokeObjectURL(lastPreviewURL); }catch(e){} }
  lastPreviewURL = url;
  img.src = url; img.style.display='block';
  if (vid) vid.style.display='none';
}
async function setPreviewFromBitmap(bmp){
  const off = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = off.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const blob = await off.convertToBlob({ type:'image/png' });
  setPreviewURL(URL.createObjectURL(blob));
}

/* ---------- model ---------- */
async function loadModel(){
  const statusEl = $('#modelStatus');
  try{
    const modelURL = chrome.runtime.getURL('onnx_model/deepfake_detector.onnx');
    session = await ort.InferenceSession.create(modelURL, { executionProviders: ['wasm'] });
    inputName = session.inputNames?.[0];
    const meta = session.inputMetadata?.[inputName];
    const dims = Array.isArray(meta?.dimensions) ? meta.dimensions.slice() : null;

    if (dims && dims.length===4){
      for (let i=0;i<4;i++) if (typeof dims[i] !== 'number' || dims[i]<0) dims[i]=0;
      if (dims[1] === 3) inputSpec = { isNCHW:true, H:dims[2]||224, W:dims[3]||224, initialized:true };
      else if (dims[3] === 3) inputSpec = { isNCHW:false, H:dims[1]||128, W:dims[2]||128, initialized:true };
    }
    statusEl.textContent = `Model loaded (${inputSpec.isNCHW?'NCHW':'NHWC'} ${inputSpec.H}×${inputSpec.W})`;
    statusEl.classList.add('pill');

    // consume pending snapshot if any
    const { pendingSnapshot } = await chrome.storage.local.get('pendingSnapshot');
    if (pendingSnapshot) {
      await chrome.storage.local.remove('pendingSnapshot');
      setPreviewURL(pendingSnapshot);
      const bmp = await fetch(pendingSnapshot).then(r=>r.blob()).then(createImageBitmap);
      await predictBitmap(bmp);
    }
  }catch(e){
    statusEl.textContent = 'Model load FAILED';
    console.error('ORT load error:', e);
  }
}

/* ---------- UI ---------- */
function drawSpark(){
  const canvas=$('#spark'); const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (preds.length<2) return;
  const w=canvas.width,h=canvas.height,n=preds.length;
  ctx.lineWidth=2; ctx.strokeStyle='#8de0ff'; ctx.beginPath();
  for (let i=0;i<n;i++){ const x=(i/(n-1))*w, y=(1-preds[i])*(h-8)+4; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }
  ctx.stroke();
}
function updateUI(label, pReal){
  const labelEl=$('#label'), probEl=$('#prob'), barProb=$('#barProb'), hist=$('#history');
  labelEl.textContent=label; labelEl.className='pill ' + (label==='REAL'?'good':'bad');
  probEl.textContent=(pReal*100).toFixed(1)+'%';
  barProb.style.width=(pReal*100).toFixed(1)+'%';
  preds.push(pReal); if (preds.length>120) preds.shift();
  if (hist){
    const row=document.createElement('div'); row.className='hrow';
    const thumb = lastPreviewURL ? `<img class="hthumb" src="${lastPreviewURL}">` : '';
    row.innerHTML = `<div>${thumb}${label}</div><div>${(pReal*100).toFixed(1)}%</div><div class="ts">${new Date().toLocaleTimeString()}</div>`;
    hist.prepend(row);
  }
  drawSpark();
}

/* ---------- preprocessing ---------- */
function toTensor(imgData, spec){
  const {data,width,height}=imgData; const {isNCHW,H,W}=spec;
  const scale = (v)=>v/255.0; // simple [0,1]
  if (isNCHW){
    const out=new Float32Array(3*H*W); let r=0,g=H*W,b=2*H*W;
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const base=(y*W+x)*4;
      out[r++]=scale(data[base]); out[g++]=scale(data[base+1]); out[b++]=scale(data[base+2]); }
    return new ort.Tensor('float32', out, [1,3,H,W]);
  }else{
    const out=new Float32Array(H*W*3); let j=0;
    for (let i=0;i<data.length;i+=4){ out[j++]=scale(data[i]); out[j++]=scale(data[i+1]); out[j++]=scale(data[i+2]); }
    return new ort.Tensor('float32', out, [1,H,W,3]);
  }
}
function adaptSpecFromErrorMessage(msg){
  const re=/index:\s*(\d+)\s+Got:\s*\d+\s+Expected:\s*(\d+)/g; const exp={}; let m;
  while((m=re.exec(msg))!==null){ exp[parseInt(m[1],10)]=parseInt(m[2],10); }
  if (exp[1]===3){ inputSpec={isNCHW:true,H:exp[2]||224,W:exp[3]||224,initialized:true}; return true; }
  if (exp[3]===3){ inputSpec={isNCHW:false,H:exp[1]||224,W:exp[2]||224,initialized:true}; return true; }
  return false;
}

/* ---------- inference ---------- */
async function predictBitmap(bitmap, allowRetry=true){
  if (!session){ alert('Model not loaded yet'); return; }
  const {H,W}=inputSpec; const canvas=$('#frame'); const ctx=canvas.getContext('2d',{willReadFrequently:true});
  canvas.width=W; canvas.height=H; ctx.clearRect(0,0,W,H); ctx.drawImage(bitmap,0,0,W,H);
  const imgData=ctx.getImageData(0,0,W,H); const tensor=toTensor(imgData,inputSpec);
  try{
    const res=await session.run({ [inputName]: tensor });
    const pReal = res[session.outputNames[0]].data[0]; // assume model outputs P(REAL)
    updateUI(pReal>=0.5?'REAL':'FAKE', pReal);
  }catch(e){
    const msg=String(e?.message||e);
    if (allowRetry && /invalid dimensions/i.test(msg) && adaptSpecFromErrorMessage(msg)){ await predictBitmap(bitmap,false); return; }
    console.error('Inference error:', e); alert('Inference failed:\n'+msg);
  }
}

/* ---------- file/webcam ---------- */
async function readFileToBitmap(file){
  const blob = file instanceof Blob ? file : new Blob([file]);
  const url = URL.createObjectURL(blob); setPreviewURL(url);
  return await createImageBitmap(blob);
}
async function captureFromVideo(){
  const v=$('#video'); if (v.readyState<2 && v.play) await v.play();
  const canvas=$('#frame'); const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const w=Math.max(128, v.videoWidth||640), h=Math.max(128, v.videoHeight||360);
  canvas.width=w; canvas.height=h; ctx.drawImage(v,0,0,w,h);
  const blob=await new Promise(res=>canvas.toBlob(res,'image/jpeg',0.9));
  setPreviewURL(URL.createObjectURL(blob));
  return await createImageBitmap(blob);
}

/* ---------- events ---------- */
$('#startCam')?.addEventListener('click', async () => {
  try{
    runningStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    const v=$('#video'); v.srcObject=runningStream; v.style.display='block'; $('#preview').style.display='none'; await v.play();
  }catch(e){ alert('Camera failed: '+e.message); }
});
$('#stopCam')?.addEventListener('click', () => {
  if (runningStream){ runningStream.getTracks().forEach(t=>t.stop()); runningStream=null; }
  $('#video').style.display='none';
});
$('#file')?.addEventListener('change', async (e) => {
  const f=e.target.files?.[0]; if (!f) return;
  const bmp=await readFileToBitmap(f); await predictBitmap(bmp);
});
const dropEl=$('#drop');
if (dropEl){
  dropEl.addEventListener('dragover', e=>{ e.preventDefault(); dropEl.classList.add('drag'); });
  dropEl.addEventListener('dragleave', ()=>dropEl.classList.remove('drag'));
  dropEl.addEventListener('drop', async e=>{
    e.preventDefault(); dropEl.classList.remove('drag');
    const f=e.dataTransfer.files?.[0]; if(!f) return;
    const bmp=await readFileToBitmap(f); await predictBitmap(bmp);
  });
}
$('#predict1')?.addEventListener('click', async () => {
  if (!session){ alert('Model not loaded yet'); return; }
  let bmp=null; if (runningStream) bmp=await captureFromVideo();
  if (!bmp){ alert('Start webcam or upload an image first.'); return; }
  await predictBitmap(bmp);
});
$('#predict5')?.addEventListener('click', async () => {
  if (!session){ alert('Model not loaded yet'); return; }
  if (!runningStream){ alert('Start webcam first.'); return; }
  const pv=await captureFromVideo(); // updates preview
  const {H,W}=inputSpec; const canvas=$('#frame'); const ctx=canvas.getContext('2d',{willReadFrequently:true});
  canvas.width=W; canvas.height=H;
  let sum=0;
  for (let i=0;i<5;i++){
    const v=$('#video'); if (v.readyState<2 && v.play) await v.play();
    ctx.drawImage(v,0,0,W,H); const imgData=ctx.getImageData(0,0,W,H);
    const tensor=toTensor(imgData,inputSpec); const res=await session.run({ [inputName]: tensor });
    sum += res[session.outputNames[0]].data[0];
    await new Promise(r=>setTimeout(r,150));
  }
  const pReal=sum/5; updateUI(pReal>=0.5?'REAL':'FAKE', pReal);
});

/* ---------- snapshot hook from content ---------- */
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg && msg.type==='trustcall:snapshot' && msg.dataUrl){
    try{
      setPreviewURL(msg.dataUrl);
      const bmp=await fetch(msg.dataUrl).then(r=>r.blob()).then(createImageBitmap);
      await predictBitmap(bmp);
    }catch(e){ console.error('Snapshot predict error:', e); }
  }
});

/* ---------- boot ---------- */
loadModel();
