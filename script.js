const videoUpload = document.getElementById("videoUpload");
const videoPlayer = document.getElementById("videoPlayer");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const startBtn = document.getElementById("startBtn");

let interfaceEnabled = false;
let distance = 50; // początkowy dystans w metrach
let decreasing = true; // kierunek zmiany dystansu

// Ładowanie filmu
videoUpload.addEventListener("change", function () {
  const file = this.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    videoPlayer.src = url;
  }
});

// Włączanie / wyłączanie interfejsu
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

// Funkcja do symulacji zmiany odległości
function updateDistance() {
  if (decreasing) {
    distance -= 0.1;
    if (distance <= 10) decreasing = false;
  } else {
    distance += 0.1;
    if (distance >= 50) decreasing = true;
  }
}

// Rysowanie interfejsu
function drawOverlay() {
  if (!interfaceEnabled) return;

  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // 🔹 Symulacja samochodu przed nami
  let carX = overlay.width / 2 - 100;
  let carY = overlay.height / 2;
  let carW = 200;
  let carH = 100;

  // Ramka wokół auta
  ctx.strokeStyle = "rgba(0, 200, 255, 0.9)";
  ctx.lineWidth = 4;
  ctx.strokeRect(carX, carY, carW, carH);

  // Zoom na tablicę rejestracyjną (pudełko u góry)
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(overlay.width / 2 - 140, 40, 280, 70);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(overlay.width / 2 - 140, 40, 280, 70);

  ctx.fillStyle = "white";
  ctx.font = "32px monospace";
  ctx.fillText("WE 8AC01", overlay.width / 2 - 90, 85);

  // Aktualizowany dystans
  updateDistance();
  ctx.fillStyle = "rgba(0, 255, 120, 0.9)";
  ctx.font = "46px Arial";
  ctx.fillText(`${distance.toFixed(1)} m`, overlay.width / 2 - 70, carY + carH + 60);

  requestAnimationFrame(drawOverlay);
}
