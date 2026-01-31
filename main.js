// ===============================
// ELEMENTOS DOM
// ===============================
const openBtn = document.getElementById('open-btn');
const popup = document.getElementById('camera-popup');
const closeBtn = document.getElementById('close-btn');

let video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const loader = document.getElementById('loader');

// ===============================
// ESTADO
// ===============================
let faceMesh = null;
let camera = null;
let stream = null;
let running = false;

let eyeColor = 'rgba(42,168,255,1)';

let smoothLandmarks = null;
const SMOOTH = 0.3;

// ===============================
// LANDMARKS
// ===============================
const LEFT_IRIS = [474, 475, 476, 477];
const RIGHT_IRIS = [469, 470, 471, 472];

const LEFT_EYE = [
  33, 7, 163, 144, 145, 153,
  154, 155, 133, 173,
  157, 158, 159, 160, 161, 246
];

const RIGHT_EYE = [
  362, 382, 381, 380, 374, 373,
  390, 249, 263, 466,
  388, 387, 386, 385, 384, 398
];

// ===============================
// RESET VIDEO
// ===============================
function resetVideoElement() {
  const oldVideo = document.getElementById('video');
  const newVideo = oldVideo.cloneNode(true);
  newVideo.srcObject = null;
  newVideo.removeAttribute('src');
  newVideo.load();
  oldVideo.parentNode.replaceChild(newVideo, oldVideo);
  return newVideo;
}

// ===============================
// OPEN CAMERA
// ===============================
openBtn.addEventListener('click', async () => {
  if (running) return;
  running = true;

  popup.classList.add('active');
  openBtn.style.display = 'none';
  loader.style.display = 'flex';

  video = resetVideoElement();

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false
  });

  video.srcObject = stream;
  await video.play();

  resizeCanvas();
  initFaceMesh();
});

// ===============================
// CLOSE CAMERA
// ===============================
closeBtn.addEventListener('click', closeCamera);

function closeCamera() {
  running = false;
  popup.classList.remove('active');
  openBtn.style.display = 'block';
  loader.style.display = 'flex';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  smoothLandmarks = null;

  try {
    camera?.stop();
    faceMesh?.close();
  } catch {}

  camera = null;
  faceMesh = null;

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

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
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });

  faceMesh.onResults(onResults);

  camera = new Camera(video, {
    onFrame: async () => {
      if (running && faceMesh) {
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
   resizeCanvas(); // 👈 FIX FUNDAMENTAL
  ctx.globalCompositeOperation = 'source-over'; // 👈 FIX CRÍTICO
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks?.length) {
    loader.style.display = 'flex';
    return;
  }

  loader.style.display = 'none';

  const raw = results.multiFaceLandmarks[0];

  if (!smoothLandmarks) {
    smoothLandmarks = raw.map(p => ({ ...p }));
  } else {
    raw.forEach((p, i) => {
      smoothLandmarks[i].x += (p.x - smoothLandmarks[i].x) * (1 - SMOOTH);
      smoothLandmarks[i].y += (p.y - smoothLandmarks[i].y) * (1 - SMOOTH);
    });
  }

  drawEyes(smoothLandmarks);
}


// ===============================
// DRAW
// ===============================
function drawEyes(lm) {

  ctx.fillStyle = 'red';
ctx.fillRect(10, 10, 20, 20);

  // DEBUG (opcional)
  drawContour(lm, LEFT_EYE, '#00ff88');
  drawContour(lm, RIGHT_EYE, '#00ff88');

  drawContour(lm, LEFT_IRIS, '#ff0044');
drawContour(lm, RIGHT_IRIS, '#ff0044');

  // IRIS DINÁMICO
  drawDynamicIris(lm, LEFT_IRIS, LEFT_EYE, eyeColor);
  drawDynamicIris(lm, RIGHT_IRIS, RIGHT_EYE, eyeColor);
}


// ===============================
// IRIS RELLENO + RECORTE CORRECTO
// ===============================
function drawDynamicIris(lm, irisIdx, eyeIdx, color) {
  ctx.save();

  // === CLIP DEL OJO ===
  ctx.beginPath();
  eyeIdx.forEach((i, n) => {
    const x = lm[i].x * canvas.width;
    const y = lm[i].y * canvas.height;
    n === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip('evenodd'); // 🔥 FIX REAL


  // === CENTRO DEL IRIS ===
  let cx = 0, cy = 0;
  irisIdx.forEach(i => {
    cx += lm[i].x * canvas.width;
    cy += lm[i].y * canvas.height;
  });
  cx /= irisIdx.length;
  cy /= irisIdx.length;

  // === RADIO DINÁMICO (FIX CLAVE) ===
  let r = 0;
  irisIdx.forEach(i => {
    const x = lm[i].x * canvas.width;
    const y = lm[i].y * canvas.height;
    r += Math.hypot(x - cx, y - cy);
  });

  r = (r / irisIdx.length) * 1.15;
  r = Math.max(r, canvas.width * 0.015); // 👈 FIX REAL

  // === DIBUJO ===
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

// ===============================
// DEBUG
// ===============================
function drawContour(lm, idxs, color) {
  ctx.beginPath();
  idxs.forEach((i, n) => {
    const x = lm[i].x * canvas.width;
    const y = lm[i].y * canvas.height;
    n === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ===============================
// RESIZE
// ===============================
function resizeCanvas() {
  const w = video.videoWidth;
  const h = video.videoHeight;

  if (!w || !h) return;

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

window.addEventListener('resize', resizeCanvas);
