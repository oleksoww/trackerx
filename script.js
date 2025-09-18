const videoUpload = document.getElementById("videoUpload");
const videoPlayer = document.getElementById("videoPlayer");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const startBtn = document.getElementById("startBtn");

let interfaceEnabled = false;

// Ładowanie filmu
videoUpload.addEventListener("change", function () {
  const file = this.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    videoPlayer.src = url;
  }
});

// Włączenie interfejsu
startBtn.addEventListener("click", () => {
  interfaceEnabled = !interfaceEnabled;
  startBtn.textContent = interfaceEnabled ? "Wyłącz interfejs" : "Włącz interfejs";
  
  if (interfaceEnabled) {
    drawOverlay();
  } else {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }
});

// Dopasowanie canvasa do wymiarów filmu
videoPlayer.addEventListener("loadedmetadata", () => {
  overlay.width = videoPlayer.videoWidth;
  overlay.height = videoPlayer.videoHeight;
});

// Mock danych
function drawOverlay() {
  if (!interfaceEnabled) return;

  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // 🚗 symulacja danych
  ctx.fillStyle = "rgba(0, 200, 255, 0.8)";
  ctx.font = "28px Arial";
  ctx.fillText("Rejestracja: WE8AC01", 60, 60);

  ctx.fillStyle = "rgba(0, 255, 120, 0.8)";
  ctx.font = "42px Arial";
  ctx.fillText("13 m", overlay.width / 2, overlay.height - 70);

  requestAnimationFrame(drawOverlay);
}
