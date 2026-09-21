/**
 * Background blur: segments the person from the background each frame and
 * composites them over a blurred copy of their own camera feed.
 *
 * Deliberately plain functions rather than a React hook — it's driven from
 * inside useWebRTC, which owns the peer connection and the camera stream,
 * and it needs to survive re-renders untouched.
 *
 * The heavy parts (≈2.6MB of WASM and model, compressed) are fetched only
 * when blur is first switched on, via a dynamic import, so people who never
 * use it pay nothing. The service worker caches them after the first time.
 */

const MODEL_URL = '/mediapipe/selfie_segmenter.tflite';
const WASM_PATH = '/mediapipe/wasm';
const BLUR_RADIUS_PX = 12;

// Segmentation runs on a downscaled copy — mask precision is what suffers,
// and edge quality matters far less than a smooth call. Stepped down
// automatically when frames take too long.
const QUALITY_STEPS = [
  { width: 512, fps: 30 },
  { width: 384, fps: 24 },
  { width: 256, fps: 15 },
];
// A frame budget generous enough not to trip on one slow frame, tight
// enough to catch a device that genuinely can't keep up.
const SLOW_FRAME_MS = 55;
const SLOW_FRAMES_BEFORE_DEGRADE = 30;

export function blurSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    !!HTMLCanvasElement.prototype.captureStream &&
    typeof WebAssembly === 'object' &&
    // Rules out the very old browsers that would need the non-SIMD build,
    // which isn't shipped.
    typeof OffscreenCanvas !== 'undefined'
  );
}

let segmenterPromise = null;

// Loaded once per page, reused across toggles — creating a segmenter is the
// expensive part, so keep it even while blur is off.
async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      // Loaded from our own origin at runtime, NOT bundled.
      //
      // webpackIgnore keeps the bundler out of it entirely, which matters
      // for two reasons: the library uses a dynamic require that webpack
      // can't statically resolve ("Critical dependency: the request of a
      // dependency is an expression"), and CRA treats that warning as an
      // error under CI — which is how Vercel builds, so it would fail the
      // deploy. It also keeps ~150KB out of the app bundle.
      const { FilesetResolver, ImageSegmenter } = await import(
        /* webpackIgnore: true */ '/mediapipe/vision_bundle.mjs'
      );
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    })().catch((err) => {
      // Let the next attempt retry rather than caching a failure forever.
      segmenterPromise = null;
      throw err;
    });
  }
  return segmenterPromise;
}

/**
 * Starts the blur pipeline for a camera track.
 *
 * Returns a controller. `stream` is created ONCE here and must be reused for
 * the lifetime of the pipeline: the srcObject assignment in useWebRTC guards
 * on object identity, and handing it a new stream blanks the video element
 * for a frame (the black-flash-per-second bug).
 */
export async function startBlur(sourceTrack) {
  const segmenter = await getSegmenter();

  const settings = sourceTrack.getSettings();
  const width = settings.width || 640;
  const height = settings.height || 480;

  // Plays the camera track so frames can be read from it. Not attached to
  // the DOM — this is purely a frame source.
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([sourceTrack]);
  await video.play().catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Segmentation input, downscaled. Separate canvas so the output stays at
  // full camera resolution.
  const maskInput = document.createElement('canvas');
  const maskCtx = maskInput.getContext('2d', { willReadFrequently: true });

  let quality = 0;
  let slowFrames = 0;
  let rafId = null;
  let stopped = false;
  let paused = false;
  let lastFrameAt = 0;

  // Allocated once per quality step, not per frame — a fresh canvas and
  // ImageData every frame at 30fps is exactly the GC churn that would hurt
  // the phones this feature is meant to stay smooth on.
  const maskCanvas = document.createElement('canvas');
  const maskCanvasCtx = maskCanvas.getContext('2d');
  let maskImage = null;

  const applyQuality = () => {
    const step = QUALITY_STEPS[quality];
    maskInput.width = step.width;
    maskInput.height = Math.round((step.width * height) / width);
    maskCanvas.width = maskInput.width;
    maskCanvas.height = maskInput.height;
    maskImage = maskCanvasCtx.createImageData(maskCanvas.width, maskCanvas.height);
  };
  applyQuality();

  const drawFrame = (now) => {
    if (stopped) return;
    rafId = requestAnimationFrame(drawFrame);

    const step = QUALITY_STEPS[quality];
    const minGap = 1000 / step.fps;
    if (now - lastFrameAt < minGap) return;
    lastFrameAt = now;

    if (paused || !video.videoWidth) return;

    const started = performance.now();
    try {
      maskCtx.drawImage(video, 0, 0, maskInput.width, maskInput.height);
      const result = segmenter.segmentForVideo(maskInput, now);
      const mask = result.categoryMask;

      // Person sharp, everything else blurred. Built by drawing the sharp
      // frame, keeping only the person via the mask, then dropping a
      // blurred copy in behind.
      const maskData = mask.getAsUint8Array();
      const alpha = maskImage.data;
      for (let i = 0; i < maskData.length; i++) {
        // Category 0 is background in the selfie segmenter; anything else
        // is the person. Alpha carries the cutout.
        alpha[i * 4 + 3] = maskData[i] === 0 ? 0 : 255;
      }
      maskCanvasCtx.putImageData(maskImage, 0, 0);

      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.filter = 'none';
      ctx.drawImage(video, 0, 0, width, height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskCanvas, 0, 0, width, height);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.filter = `blur(${BLUR_RADIUS_PX}px)`;
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();

      mask.close();
    } catch (err) {
      // A dropped frame is survivable; keep the last good one on screen.
      return;
    }

    // Auto-degrade: consistently slow frames step the mask down rather than
    // letting the call stutter.
    if (performance.now() - started > SLOW_FRAME_MS) {
      slowFrames += 1;
      if (slowFrames >= SLOW_FRAMES_BEFORE_DEGRADE && quality < QUALITY_STEPS.length - 1) {
        quality += 1;
        slowFrames = 0;
        applyQuality();
        console.log(`Background blur: reduced quality to ${QUALITY_STEPS[quality].width}px @ ${QUALITY_STEPS[quality].fps}fps`);
      }
    } else if (slowFrames > 0) {
      slowFrames -= 1;
    }
  };

  rafId = requestAnimationFrame(drawFrame);

  // Created once; the track inside it is what gets sent and previewed.
  const stream = canvas.captureStream(QUALITY_STEPS[0].fps);

  return {
    stream,
    track: stream.getVideoTracks()[0],
    /** Swap the camera behind the blur (used after the app is backgrounded). */
    setSource(nextTrack) {
      video.srcObject = new MediaStream([nextTrack]);
      video.play().catch(() => {});
    },
    /** Stop processing without tearing the pipeline down. */
    setPaused(next) {
      paused = next;
    },
    stop() {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
