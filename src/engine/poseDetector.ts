import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';

const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';

// Bundled in public/models so the engine doesn't depend on an external model
// host at runtime. Falls back to the Google-hosted model if absent.
const MODEL_PATH = '/models/pose_landmarker_lite.task';
const MODEL_FALLBACK =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export interface PoseDetector {
  detect(video: HTMLVideoElement, timestampMs: number): PoseLandmarkerResult;
  close(): void;
}

async function resolveModelPath(): Promise<string> {
  try {
    const res = await fetch(MODEL_PATH, { method: 'HEAD' });
    return res.ok ? MODEL_PATH : MODEL_FALLBACK;
  } catch {
    return MODEL_FALLBACK;
  }
}

/**
 * Initialize a MediaPipe PoseLandmarker for realtime video.
 * Domain-agnostic: it only knows how to turn a video frame into landmarks.
 */
export async function createPoseDetector(): Promise<PoseDetector> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const modelAssetPath = await resolveModelPath();

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
