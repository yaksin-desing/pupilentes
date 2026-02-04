const irisTexture = new Image();
irisTexture.src = 'pupila.png'; // o .svg
let irisTextureReady = false;

irisTexture.onload = () => {
  irisTextureReady = true;
};


// ===============================
// ELEMENTOS DOM
// ===============================
const openBtn = document.getElementById('open-btn');
const popup = document.getElementById('camera-popup');
const closeBtn = document.getElementById('close-btn');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const loader = document.getElementById('loader');

// ===============================
// ESTADO
// ===============================
let faceMesh = null;
let camera = null;
let running = false;
let selectedIrisColor = 'rgb(49, 30, 0)';


// ===============================
// LANDMARKS
// ===============================
const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

const LEFT_EYE = [
  33, 7, 163, 144, 145, 153, 154, 155,
  133, 173, 157, 158, 159, 160, 161, 246
];

const RIGHT_EYE = [
  362, 382, 381, 380, 374, 373, 390, 249,
  263, 466, 388, 387, 386, 385, 384, 398
];

// ===============================
// OPEN CAMERA
// ===============================
openBtn.onclick = async () => {
  popup.classList.add('active');
  openBtn.style.display = 'none';
  loader.style.display = 'flex';
  running = true;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false
  });

  video.srcObject = stream;
  await video.play();

  resizeCanvas();
  initFaceMesh();
};

// ===============================
// CLOSE CAMERA
// ===============================
closeBtn.onclick = () => {
  running = false;
  popup.classList.remove('active');
  openBtn.style.display = 'block';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  camera?.stop();
  faceMesh?.close();
};

// ===============================
// MEDIAPIPE
// ===============================
function initFaceMesh() {
  faceMesh = new FaceMesh({
    locateFile: f =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0,
    minTrackingConfidence: 0,
  });

  faceMesh.onResults(onResults);

  camera = new Camera(video, {
    onFrame: async () => {
      if (running) {
        await faceMesh.send({ image: video });
      }
    }
  });

  camera.start();
}

// ===============================
// RESULTS
// ===============================
function onResults(results) {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks?.length) {
    loader.style.display = 'flex';
    return;
  }

  loader.style.display = 'none';
  const lm = results.multiFaceLandmarks[0];

drawIrisClipped(lm, LEFT_IRIS, LEFT_EYE, selectedIrisColor, 'L');
drawIrisClipped(lm, RIGHT_IRIS, RIGHT_EYE, selectedIrisColor, 'R');


}

let prevIrisL = null;
let prevIrisR = null;

function smoothIris(current, prev, factor = 0.5) {
  if (!prev) return current;
  return {
    cx: prev.cx * factor + current.cx * (1 - factor),
    cy: prev.cy * factor + current.cy * (1 - factor),
    r:  prev.r  * factor + current.r  * (1 - factor)
  };
}

// ===============================
// IRIS CIRCULAR + CLIP CON PÁRPADOS
// ===============================
function drawIrisClipped(lm, irisIdx, eyeIdx, color, side = 'L') {
  if (!irisTextureReady) return;

  let iris = getIrisData(lm, irisIdx);

  // ===== SMOOTH =====
  if (side === 'L') {
    iris = smoothIris(iris, prevIrisL, 0.1);
    prevIrisL = iris;
  } else {
    iris = smoothIris(iris, prevIrisR, 0.1);
    prevIrisR = iris;
  }

  ctx.save();

  // ===== CLIP DEL OJO (PÁRPADOS) =====
  ctx.beginPath();
  eyeIdx.forEach((i, idx) => {
    const p = lm[i];
    const x = p.x * canvas.width;
    const y = p.y * canvas.height;
    idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();

  // ===== DIBUJAR TEXTURA DEL IRIS =====
  const size = iris.r * 2.5;

  ctx.beginPath();
  ctx.arc(iris.cx, iris.cy, iris.r*2, 0, Math.PI * 2);
  ctx.clip();

  ctx.drawImage(
    irisTexture,
    iris.cx - size / 2,
    iris.cy - size / 2,
    size,
    size
  );
  
  // ===== BRILLO DE PUPILA =====
  ctx.beginPath();
  ctx.arc(
  iris.cx - iris.r * 0.2,
  iris.cy - iris.r * 0.2,
  iris.r * 0.05,
  0,
  Math.PI * 2
);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();

  // ===== COLOR OPCIONAL ENCIMA =====
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.5;

  ctx.beginPath();
  ctx.arc(iris.cx, iris.cy, iris.r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();
  
}



// ===============================
// CÁLCULO DE IRIS
// ===============================
function getIrisData(lm, idxs) {
  let cx = 0;
  let cy = 0;

  idxs.forEach(i => {
    cx += lm[i].x * canvas.width;
    cy += lm[i].y * canvas.height;
  });

  cx /= idxs.length;
  cy /= idxs.length;

  let r = 0;
  idxs.forEach(i => {
    const x = lm[i].x * canvas.width;
    const y = lm[i].y * canvas.height;
    r += Math.hypot(x - cx, y - cy);
  });

  r /= idxs.length;

  return { cx, cy, r };
}




// ===============================
// RESIZE
// ===============================
function resizeCanvas() {
  if (!video.videoWidth) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

window.addEventListener('resize', resizeCanvas);


window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.color').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedIrisColor = btn.dataset.color;
    });
  });
});