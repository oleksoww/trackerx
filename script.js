const videoUpload = document.getElementById("videoUpload");
const videoPlayer = document.getElementById("videoPlayer");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

const zoomBox = document.getElementById("zoomBox");
const zoomCanvas = document.getElementById("zoomCanvas");
const zctx = zoomCanvas.getContext("2d");
const distanceText = document.getElementById("distanceText");

const resetFrame = document.getElementById("resetFrame");
const toggleFrameBtn = document.getElementById("toggleFrame");

let rect = {x:100, y:100, w:200, h:80};
let dragging = false;
let resizing = false;
let dragOffset = {x:0,y:0};
let resizeHandleSize = 12;
let frameVisible = true;

// Realna wysokość tablicy (dla metryki)
const PLATE_REAL_HEIGHT_M = 0.14;

// --- upload video ---
videoUpload.addEventListener("change", (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  videoPlayer.src = url;
  videoPlayer.play().catch(()=>{});
});

// --- dopasuj overlay ---
videoPlayer.addEventListener("loadedmetadata", () => {
  overlay.width = videoPlayer.videoWidth;
  overlay.height = videoPlayer.videoHeight;
  drawOverlay();
  zoomBox.classList.remove("hidden");
});

// --- reset ramki ---
resetFrame.addEventListener("click", () => {
  rect = {x:100, y:100, w:200, h:80};
  drawOverlay();
});

// --- toggle ramki ---
toggleFrameBtn.addEventListener("click", () => {
  frameVisible = !frameVisible;
  toggleFrameBtn.textContent = frameVisible ? "Ukryj ramkę" : "Pokaż ramkę";
  if (!frameVisible) {
    ctx.clearRect(0,0,overlay.width,overlay.height);
    zoomBox.classList.add("hidden");
  } else {
    drawOverlay();
    zoomBox.classList.remove("hidden");
  }
});

// --- rysowanie ramki ---
function drawOverlay() {
  ctx.clearRect(0,0,overlay.width,overlay.height);
  if (!frameVisible) return;
  ctx.strokeStyle = "rgba(0,200,255,0.95)";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  // uchwyt do resize
  ctx.fillStyle = "rgba(0,200,255,0.95)";
  ctx.fillRect(rect.x+rect.w-resizeHandleSize/2, rect.y+rect.h-resizeHandleSize/2, resizeHandleSize, resizeHandleSize);
}

// --- obsługa myszki ---
overlay.addEventListener("mousedown", (e) => {
  if (!frameVisible) return;
  const mx = e.offsetX, my = e.offsetY;
  if (insideResizeHandle(mx,my)) {
    resizing = true;
  } else if (mx>rect.x && mx<rect.x+rect.w && my>rect.y && my<rect.y+rect.h) {
    dragging = true;
    dragOffset.x = mx - rect.x;
    dragOffset.y = my - rect.y;
  }
});

overlay.addEventListener("mousemove", (e) => {
  if (!frameVisible) return;
  const mx = e.offsetX, my = e.offsetY;
  if (dragging) {
    rect.x = mx - dragOffset.x;
    rect.y = my - dragOffset.y;
    drawOverlay();
  } else if (resizing) {
    rect.w = Math.max(30, mx - rect.x);
    rect.h = Math.max(20, my - rect.y);
    drawOverlay();
  }
});

overlay.addEventListener("mouseup", () => {
  dragging = false;
  resizing = false;
});

function insideResizeHandle(mx,my){
  return (mx > rect.x+rect.w-resizeHandleSize &&
          mx < rect.x+rect.w+resizeHandleSize &&
          my > rect.y+rect.h-resizeHandleSize &&
          my < rect.y+rect.h+resizeHandleSize);
}

// --- aktualizacja zooma ---
function updateZoom() {
  if (!frameVisible) {
    requestAnimationFrame(updateZoom);
    return;
  }
  if (!videoPlayer.paused && !videoPlayer.ended) {
    renderZoom();
  }
  requestAnimationFrame(updateZoom);
}

function renderZoom(){
  if (!rect.w || !rect.h) return;
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = overlay.width;
  tempCanvas.height = overlay.height;
  const tctx = tempCanvas.getContext("2d");
  tctx.drawImage(videoPlayer, 0,0,overlay.width,overlay.height);
  const crop = tctx.getImageData(rect.x, rect.y, rect.w, rect.h);

  // rysuj w zoomCanvas
  zoomCanvas.width = 280;
  zoomCanvas.height = 180;
  zctx.clearRect(0,0,zoomCanvas.width,zoomCanvas.height);
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = rect.w;
  cropCanvas.height = rect.h;
  cropCanvas.getContext("2d").putImageData(crop,0,0);

  const scale = Math.min(zoomCanvas.width/rect.w, zoomCanvas.height/rect.h);
  const dw = rect.w*scale, dh = rect.h*scale;
  zctx.drawImage(cropCanvas, 0,0, rect.w, rect.h,
    (zoomCanvas.width-dw)/2,(zoomCanvas.height-dh)/2,dw,dh);

  // oblicz metry
  const focalApprox = overlay.height*0.8;
  const estimatedDistance = (PLATE_REAL_
