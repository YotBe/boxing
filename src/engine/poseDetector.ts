import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';

// Self-hosted WASM runtime (copied from node_modules at build time — see the
// mediapipeWasm plugin in vite.config.ts). Falls back to a version-pinned CDN
// path if the local copy is missing.
const WASM_PATH = '/wasm';
const WASM_FALLBACK =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

// Bundled in public/models so the engine doesn't depend on an external model
// host at runtime. Falls back to the Google-hosted model if absent.
const MODEL_PATH = '/models/pose_landmarker_lite.task';
const MODEL_FALLBACK =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export interface PoseDetector {
  detect(video: HTMLVideoElement, timestampMs: number): PoseLandmarkerResult;
  close(): void;
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveWasmPath(): Promise<string> {
  return (await headOk(`${WASM_PATH}/vision_wasm_internal.js`))
    ? WASM_PATH
    : WASM_FALLBACK;
}

async function resolveModelPath(): Promise<string> {
  return (await headOk(MODEL_PATH)) ? MODEL_PATH : MODEL_FALLBACK;
}

/**
 * Initialize a MediaPipe PoseLandmarker for realtime video.
 * Domain-agnostic: it only knows how to turn a video frame into landmarks.
 */
export async function createPoseDetector(): Promise<PoseDetector> {
  const [wasmPath, modelAssetPath] = await Promise.all([
    resolveWasmPath(),
    resolveModelPath(),
  ]);
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);

  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
  });

  return {
    detect(video, timestampMs) {
      return landmarker.detectForVideo(video, timestampMs);
    },
    close() {
      landmarker.close();
    },
  };
}
