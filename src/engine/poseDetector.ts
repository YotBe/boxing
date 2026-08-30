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

const MODEL_HOST =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker';

/**
 * The model variants bundled in `public/models`. Swapping between them at
 * runtime is the whole point: on an edge device the interesting question is
 * never "which model is most accurate" but "which model clears the accuracy bar
 * *inside the frame budget of this device*". Being able to flip the variant
 * live, with the frame rate and latency readout next to it, turns that
 * trade-off from an assertion into a measurement.
 *
 * `inputResolution` is the landmark model's input tensor size as published in
 * the MediaPipe Pose Landmarker model card. It is a property of the model file,
 * not something the task API reports back at runtime, so it is declared here.
 * Every incoming camera frame is letterboxed down to this before inference —
 * which is why a 1080p camera and a 720p camera cost the same to run.
 */
export interface ModelVariantInfo {
  id: ModelVariantId;
  /** Short label for the UI. */
  label: string;
  /** Path of the bundled model file. */
  path: string;
  /** Google-hosted copy, used only if the bundled file is missing. */
  fallback: string;
  /** Approximate on-disk size in megabytes, for the UI. */
  sizeMb: number;
  /** Landmark-model input tensor, per the MediaPipe model card. */
  inputResolution: string;
  /** One-line characterisation of the trade-off. */
  note: string;
}

export type ModelVariantId = 'lite' | 'full';

export const MODEL_VARIANTS: Record<ModelVariantId, ModelVariantInfo> = {
  lite: {
    id: 'lite',
    label: 'Lite',
    path: '/models/pose_landmarker_lite.task',
    fallback: `${MODEL_HOST}/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
    sizeMb: 5.5,
    inputResolution: '256×256',
    note: 'Fastest — the one you would actually ship to a low-power device.',
  },
  full: {
    id: 'full',
    label: 'Full',
    path: '/models/pose_landmarker_full.task',
    fallback: `${MODEL_HOST}/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
    sizeMb: 9.0,
    inputResolution: '256×256',
    note: 'Steadier keypoints under occlusion, at a higher cost per frame.',
  },
};

export const MODEL_VARIANT_IDS = Object.keys(MODEL_VARIANTS) as ModelVariantId[];

/** Where the compute actually happens. Worth being able to flip live. */
export type DelegateId = 'GPU' | 'CPU';

export interface PoseDetectorOptions {
  variant?: ModelVariantId;
  delegate?: DelegateId;
  /** Score the person detector must clear before landmarks are emitted. */
  minPoseDetectionConfidence?: number;
  /** Score required to keep tracking an already-detected person. */
  minTrackingConfidence?: number;
}

export interface PoseDetectorInfo {
  variant: ModelVariantInfo;
  delegate: DelegateId;
  /** True when the model was served from the bundle rather than the CDN. */
  bundled: boolean;
  minPoseDetectionConfidence: number;
  minTrackingConfidence: number;
}

export interface PoseDetector {
  detect(video: HTMLVideoElement, timestampMs: number): PoseLandmarkerResult;
  info(): PoseDetectorInfo;
  close(): void;
}

export const DEFAULT_DETECTION_CONFIDENCE = 0.4;
export const DEFAULT_TRACKING_CONFIDENCE = 0.4;

async function build(
  wasmPath: string,
  modelAssetPath: string,
  delegate: DelegateId,
  minPoseDetectionConfidence: number,
  minTrackingConfidence: number,
): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence,
    minPosePresenceConfidence: minTrackingConfidence,
    minTrackingConfidence,
  });
}

/**
 * Initialize a MediaPipe PoseLandmarker for realtime video.
 * Domain-agnostic: it only knows how to turn a video frame into landmarks.
 *
 * The detection/tracking confidence floors default lower than MediaPipe's own
 * 0.5. That default is tuned for clean, well-lit, full-body footage; in a
 * cluttered room, at a few metres, in ordinary clothes, 0.5 drops tracking on
 * frames a human would call perfectly usable. They are parameters rather than
 * constants so they can be moved while the thing is running.
 *
 * The bundled runtime and model are loaded directly, with the hosted copies
 * tried only if that genuinely fails. An earlier version probed the local paths
 * with a HEAD request first and used the result to choose — but a probe is
 * itself a request that can fail for reasons unrelated to the file being there
 * (a host answering 405 to HEAD, a proxy, a cancelled preflight), and every
 * such false negative would have quietly sent a demo that is supposed to run
 * offline out to a CDN instead. Failing over on a real failure is both more
 * robust and two round trips cheaper on a cold start.
 */
export async function createPoseDetector(
  options: PoseDetectorOptions = {},
): Promise<PoseDetector> {
  const variant = MODEL_VARIANTS[options.variant ?? 'lite'];
  const delegate = options.delegate ?? 'GPU';
  const minPoseDetectionConfidence =
    options.minPoseDetectionConfidence ?? DEFAULT_DETECTION_CONFIDENCE;
  const minTrackingConfidence =
    options.minTrackingConfidence ?? DEFAULT_TRACKING_CONFIDENCE;

  let bundled = true;
  let landmarker: PoseLandmarker;
  try {
    landmarker = await build(
      WASM_PATH,
      variant.path,
      delegate,
      minPoseDetectionConfidence,
      minTrackingConfidence,
    );
  } catch (err) {
    console.warn(
      'Bundled runtime/model unavailable, falling back to hosted copies:',
      err,
    );
    bundled = false;
    landmarker = await build(
      WASM_FALLBACK,
      variant.fallback,
      delegate,
      minPoseDetectionConfidence,
      minTrackingConfidence,
    );
  }

  return {
    detect(video, timestampMs) {
      return landmarker.detectForVideo(video, timestampMs);
    },
    info() {
      return {
        variant,
        delegate,
        bundled,
        minPoseDetectionConfidence,
        minTrackingConfidence,
      };
    },
    close() {
      landmarker.close();
    },
  };
}
