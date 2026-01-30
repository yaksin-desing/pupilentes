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

let eyeColor = 'rgba(42,168,255,0.6)';
let smoothLandmarks = null;
const SMOOTH = 0.6;

// ===============================
// LANDMARKS MEDIAPIPE
// ===============================

// IRIS
const LEFT_IRIS = [474, 475, 476, 477];
const RIGHT_IRIS = [469, 470, 471, 472];

// CONTORNO COMPLETO DE PÁRPADOS
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
// RESET VIDEO (ANTI BUG)
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
    locateFile: file =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
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
// DRAW EYES
// ===============================
function drawEyes(landmarks) {
  // DEBUG CONTORNOS
  drawContour(landmarks, LEFT_EYE, '#00ff88');
  drawContour(landmarks, RIGHT_EYE, '#00ff88');

  drawContour(landmarks, LEFT_IRIS, '#ff0044');
  drawContour(landmarks, RIGHT_IRIS, '#ff0044');

  drawPoints(landmarks, LEFT_EYE, '#00ff88');
  drawPoints(landmarks, RIGHT_EYE, '#00ff88');
  drawPoints(landmarks, LEFT_IRIS, '#ff0044');
  drawPoints(landmarks, RIGHT_IRIS, '#ff0044');

  // FILTRO
  drawIrisClipped(landmarks, LEFT_IRIS, LEFT_EYE);
  drawIrisClipped(landmarks, RIGHT_IRIS, RIGHT_EYE);
}

function drawIrisClipped(landmarks, irisIdx, eyeIdx) {
  ctx.save();

  // CLIP POR PÁRPADOS
  ctx.beginPath();
  eyeIdx.forEach((i, idx) => {
    const x = landmarks[i].x * canvas.width;
    const y = landmarks[i].y * canvas.height;
    idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();

  // CENTRO IRIS
  const pts = irisIdx.map(i => ({
    x: landmarks[i].x * canvas.width,
    y: landmarks[i].y * canvas.height
  }));

  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

  const r =
    Math.hypot(pts[0].x - pts[2].x, pts[0].y - pts[2].y) * 0.55;

  ctx.globalCompositeOperation = 'color';
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = eyeColor;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ===============================
// DEBUG HELPERS
// ===============================
function drawContour(landmarks, idxs, color) {
  ctx.beginPath();
  idxs.forEach((i, n) => {
    const x = landmarks[i].x * canvas.width;
    const y = landmarks[i].y * canvas.height;
    n === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawPoints(landmarks, idxs, color) {
  idxs.forEach(i => {
    const x = landmarks[i].x * canvas.width;
    const y = landmarks[i].y * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

// ===============================
// COLORS UI
// ===============================
document.querySelectorAll('.color').forEach(el => {
  el.addEventListener('click', () => {
    eyeColor = `rgba(${el.dataset.color},0.6)`;
  });
});

// ===============================
// RESIZE
// ===============================
function resizeCanvas() {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
}
window.addEventListener('resize', resizeCanvas);
