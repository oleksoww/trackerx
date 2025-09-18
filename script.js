// TrackerX - detection + zoom + OCR prototype
// Requires opencv.js loaded and Tesseract.js loaded in index.html

const videoUpload = document.getElementById("videoUpload");
const videoPlayer = document.getElementById("videoPlayer");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");

const zoomBox = document.getElementById("zoomBox");
const zoomCanvas = document.getElementById("zoomCanvas");
const zctx = zoomCanvas.getContext("2d");
const plateTextEl = document.getElementById("plateText");
const distanceText = document.getElementById("distanceText");
const closeZoom = document.getElementById("closeZoom");
const pauseOnDetect = document.getElementById("pauseOnDetect");

let interfaceEnabled = false;
let processing = false;
let srcMat = null;
let grayMat = null;
let hierarchy = null;
let contours = null;
let cap = null;

let lastDetected = null; // {rect: [x,y,w,h], score, plateImage}
let ocrWorker = null;

// --- utility: set status ---
function setStatus(s) { statusEl.textContent = s; }

// Load Tesseract worker
async function initOCR(){
  setStatus("Inicjalizacja OCR...");
  ocrWorker = Tesseract.createWorker({
    logger: m => { /* console.log(m) */ }
  });
  await ocrWorker.load();
  await ocrWorker.loadLanguage('eng'); // plate characters often english/latin
  await ocrWorker.initialize('eng');
  await ocrWorker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -',
    preserve_interword_spaces: '1'
  });
  setStatus("OCR gotowy");
}

// Wait for OpenCV to be ready
function waitForOpenCV() {
  return new Promise((resolve) => {
    if (typeof cv !== 'undefined' && cv?.ready) {
      resolve();
    } else {
      // opencv.js sets onRuntimeInitialized
      let check = setInterval(() => {
        if (typeof cv !== 'undefined' && cv?.runtimeInitialized) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      // fallback after some seconds
      setTimeout(() => resolve(), 10000);
    }
  });
}

// Video file load
videoUpload.addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  videoPlayer.src = url;
  videoPlayer.play().catch(()=>{});
  setStatus("Wgrano wideo");
});

// Start / stop interface
startBtn.addEventListener('click', async () => {
  interfaceEnabled = !interfaceEnabled;
  startBtn.textContent = interfaceEnabled ? 'Wyłącz interfejs' : 'Włącz interfejs';
  if (interfaceEnabled) {
    setStatus('Ładowanie bibliotek...');
    await waitForOpenCV();
    try {
      if (!ocrWorker) await initOCR();
    } catch(e){
      console.warn("OCR init failed", e);
    }
    setupProcessing();
    requestAnimationFrame(processFrame);
  } else {
    // stop
    processing = false;
    setStatus('Interfejs wyłączony');
    ctx.clearRect(0,0,overlay.width, overlay.height);
    zoomBox.classList.add('hidden');
  }
});

// Close zoom box
closeZoom.addEventListener('click', () => {
  zoomBox.classList.add('hidden');
});

// Resize overlay to match video
videoPlayer.addEventListener('loadedmetadata', () => {
  overlay.width = videoPlayer.videoWidth;
  overlay.height = videoPlayer.videoHeight;
});

// Prepare OpenCV mats
function setupProcessing(){
  if (processing) return;
  processing = true;

  if (srcMat) srcMat.delete();
  if (grayMat) grayMat.delete();
  if (hierarchy) hierarchy.delete();
  if (contours) contours.delete();

  overlay.width = videoPlayer.videoWidth || 640;
  overlay.height = videoPlayer.videoHeight || 360;
  zoomCanvas.width = 280;
  zoomCanvas.height = 180;

  srcMat = new cv.Mat(overlay.height, overlay.width, cv.CV_8UC4);
  grayMat = new cv.Mat(overlay.height, overlay.width, cv.CV_8UC1);
  hierarchy = new cv.Mat();
  contours = new cv.MatVector();

  setStatus('Interfejs gotowy — analizuję klatki');
}

// Main loop: process frames, detect plate-like rectangles
let frameSkip = 0;
async function processFrame(){
  if (!processing || !interfaceEnabled) return;

  // limit processing frequency to reduce CPU
  frameSkip = (frameSkip + 1) % 2; // process every 2nd frame
  if (frameSkip !== 0) {
    requestAnimationFrame(processFrame);
    return;
  }

  // draw current video frame into srcMat
  try {
    // draw video to hidden canvas via overlay's context to then grab image data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = overlay.width;
    tempCanvas.height = overlay.height;
    const tctx = tempCanvas.getContext('2d');
    tctx.drawImage(videoPlayer, 0, 0, tempCanvas.width, tempCanvas.height);
    const imgData = tctx.getImageData(0,0,tempCanvas.width,tempCanvas.height);
    srcMat.data.set(imgData.data);

    // convert to gray + blur
    cv.cvtColor(srcMat, grayMat, cv.COLOR_RGBA2GRAY);
    cv.bilateralFilter(grayMat, grayMat, 9, 75, 75);
    cv.equalizeHist(grayMat, grayMat);

    // edge detection
    let edges = new cv.Mat();
    cv.Canny(grayMat, edges, 80, 200);

    // find contours
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    // search for rectangle-like contours with plate-like aspect ratio
    let candidates = [];
    for (let i = 0; i < contours.size(); i++){
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        // bounding rect
        const rect = cv.boundingRect(approx);
        const area = rect.width * rect.height;
        if (area < 1500) { approx.delete(); continue; } // too small
        const aspect = rect.width / rect.height;
        // typical plate aspect ratio ~ 4:1 down to 2:1 depending on region
        if (aspect > 2 && aspect < 6) {
          // store candidate with size score (larger preferable)
          candidates.push({rect, area, aspect});
        }
      }
      approx.delete();
      cnt.delete();
    }

    // pick best candidate (largest area)
    if (candidates.length > 0) {
      candidates.sort((a,b)=>b.area - a.area);
      const best = candidates[0];
      lastDetected = best;
      drawOverlayWithDetection(best.rect);
      // extract and show zoom
      showZoomFromRect(best.rect);
    } else {
      // clear overlay
      lastDetected = null;
      ctx.clearRect(0,0,overlay.width, overlay.height);
      zoomBox.classList.add('hidden');
    }

    edges.delete();
  } catch (err){
    console.error("Processing error:", err);
  }

  requestAnimationFrame(processFrame);
}

// Draw overlay: draw box around detected rectangle + small UI
function drawOverlayWithDetection(rect) {
  ctx.clearRect(0,0,overlay.width, overlay.height);
  // semi-transparent dim
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(0,0,overlay.width, overlay.height);

  // draw detection rectangle (translate coordinates)
  ctx.strokeStyle = "rgba(0,200,255,0.95)";
  ctx.lineWidth = Math.max(2, Math.floor(overlay.width / 200));
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

  // small label
  ctx.fillStyle = "rgba(0,200,255,0.95)";
  ctx.font = "18px monospace";
  ctx.fillText("Tablica", rect.x, Math.max(20, rect.y - 8));
}

// Extract crop, draw to zoom canvas, run OCR and compute distance
let ocrCooldown = 0;
async function showZoomFromRect(rect) {
  // crop from current video frame
  const w = overlay.width, h = overlay.height;
  const temp = document.createElement('canvas');
  temp.width = w; temp.height = h;
  const tctx = temp.getContext('2d');
  tctx.drawImage(videoPlayer, 0, 0, w, h);
  const cropX = Math.max(0, rect.x - Math.floor(rect.width * 0.08));
  const cropY = Math.max(0, rect.y - Math.floor(rect.height * 0.2));
  const cropW = Math.min(w - cropX, Math.floor(rect.width * 1.16));
  const cropH = Math.min(h - cropY, Math.floor(rect.height * 1.6));

  const imgData = tctx.getImageData(cropX, cropY, cropW, cropH);

  // draw scaled into zoomCanvas
  zctx.clearRect(0,0,zoomCanvas.width, zoomCanvas.height);
  // create temporary canvas to hold crop and upscale for clarity
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cctx = cropCanvas.getContext('2d');
  cctx.putImageData(imgData, 0, 0);

  // upscale preserving aspect to fit zoomCanvas
  const scale = Math.min(zoomCanvas.width / cropW, zoomCanvas.height / cropH);
  const dw = Math.floor(cropW * scale);
  const dh = Math.floor(cropH * scale);
  zctx.drawImage(cropCanvas, 0, 0, cropW, cropH, Math.floor((zoomCanvas.width - dw)/2), Math.floor((zoomCanvas.height - dh)/2), dw, dh);

  // show zoom box
  zoomBox.classList.remove('hidden');

  // compute simple distance estimate:
  // Assume average license plate height ~ 0.14 m (14 cm) — adjust per region
  const PLATE_REAL_HEIGHT_M = 0.14;
  // focal length approx (in px) = (image_height_px * assumed_fov_factor). This is a rough heuristic.
  // A more robust approach requires camera calibration. We use proportional estimate:
  const observedHeightPx = rect.height;
  const imageHeightPx = overlay.height;
  // focalApprox = imageHeightPx * 0.8 (heuristic)
  const focalApprox = imageHeightPx * 0.8;
  const estimatedDistance = (PLATE_REAL_HEIGHT_M * focalApprox) / observedHeightPx;
  // convert to meters and format
  const meters = Math.max(0.5, estimatedDistance).toFixed(1);

  distanceText.textContent = `${meters} m`;

  // Run OCR only occasionally to save CPU
  if (ocrWorker && ocrCooldown <= 0) {
    ocrCooldown = 30; // cooldown frames
    plateTextEl.textContent = '...rozpoznawanie';
    // get a blob/png from cropCanvas scaled up a bit for OCR
    const up = document.createElement('canvas');
    up.width = cropW * 2;
    up.height = cropH * 2;
    up.getContext('2d').drawImage(cropCanvas, 0, 0, up.width, up.height);
    up.toBlob(async (blob) => {
      try {
        const { data: { text } } = await ocrWorker.recognize(blob);
        const cleaned = (text || '').replace(/[^A-Z0-9\- ]/gi,'').trim();
        plateTextEl.textContent = cleaned.length ? cleaned : '—';
        // optionally pause video on detection
        if (pauseOnDetect.checked) {
          videoPlayer.pause();
          setStatus('Wideo zatrzymane — wykryto tablicę');
        } else {
          setStatus('Wykryto tablicę');
        }
      } catch (e){
        console.warn("OCR failed", e);
        plateTextEl.textContent = '—';
      }
    }, 'image/png');
  } else {
    // update plate text cooldown and show previous or placeholder
    ocrCooldown = Math.max(0, ocrCooldown - 1);
    if (plateTextEl.textContent === '—') plateTextEl.textContent = '—';
  }
}

// tick OCR cooldown when not running detection
setInterval(()=>{ if (ocrCooldown>0) ocrCooldown--; }, 200);

// On unload clean mats
window.addEventListener('beforeunload', () => {
  try {
    if (srcMat) srcMat.delete();
    if (grayMat) grayMat.delete();
    if (hierarchy) hierarchy.delete();
    if (contours) contours.delete();
    if (ocrWorker) ocrWorker.terminate();
  } catch(e){}
});

// initial message (until OpenCV ready)
setStatus('Czekam na OpenCV... (może chwilę potrwać przy pierwszym ładowaniu)');
