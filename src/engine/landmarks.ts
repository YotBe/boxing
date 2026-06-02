/**
 * Named constants for the MediaPipe BlazePose 33-landmark model.
 *
 * These are the only domain-agnostic "vocabulary" the engine exposes: movement
 * definitions in `src/movements/*.json` reference joints by these indices. The
 * engine itself never hard-codes which landmarks a given movement cares about.
 *
 * Full index reference:
 * https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */
export const NOSE = 0;
export const LEFT_EYE_INNER = 1;
export const LEFT_EYE = 2;
export const LEFT_EYE_OUTER = 3;
export const RIGHT_EYE_INNER = 4;
export const RIGHT_EYE = 5;
export const RIGHT_EYE_OUTER = 6;
export const LEFT_EAR = 7;
export const RIGHT_EAR = 8;
export const MOUTH_LEFT = 9;
export const MOUTH_RIGHT = 10;
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;
export const LEFT_ELBOW = 13;
export const RIGHT_ELBOW = 14;
export const LEFT_WRIST = 15;
export const RIGHT_WRIST = 16;
export const LEFT_PINKY = 17;
export const RIGHT_PINKY = 18;
export const LEFT_INDEX = 19;
export const RIGHT_INDEX = 20;
export const LEFT_THUMB = 21;
export const RIGHT_THUMB = 22;
export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;
export const LEFT_KNEE = 25;
export const RIGHT_KNEE = 26;
export const LEFT_ANKLE = 27;
export const RIGHT_ANKLE = 28;
export const LEFT_HEEL = 29;
export const RIGHT_HEEL = 30;
export const LEFT_FOOT_INDEX = 31;
export const RIGHT_FOOT_INDEX = 32;

/**
 * Ordered, human-readable list of the 33 landmarks for authoring UIs (e.g. the
 * movement builder's joint dropdowns). This is still just vocabulary — naming
 * the indices — so it stays domain-agnostic: nothing here is movement-specific.
 */
export const LANDMARK_OPTIONS: { index: number; label: string }[] = [
  { index: NOSE, label: 'Nose' },
  { index: LEFT_EYE_INNER, label: 'Left eye (inner)' },
  { index: LEFT_EYE, label: 'Left eye' },
  { index: LEFT_EYE_OUTER, label: 'Left eye (outer)' },
  { index: RIGHT_EYE_INNER, label: 'Right eye (inner)' },
  { index: RIGHT_EYE, label: 'Right eye' },
  { index: RIGHT_EYE_OUTER, label: 'Right eye (outer)' },
  { index: LEFT_EAR, label: 'Left ear' },
  { index: RIGHT_EAR, label: 'Right ear' },
  { index: MOUTH_LEFT, label: 'Mouth (left)' },
  { index: MOUTH_RIGHT, label: 'Mouth (right)' },
  { index: LEFT_SHOULDER, label: 'Left shoulder' },
  { index: RIGHT_SHOULDER, label: 'Right shoulder' },
  { index: LEFT_ELBOW, label: 'Left elbow' },
  { index: RIGHT_ELBOW, label: 'Right elbow' },
  { index: LEFT_WRIST, label: 'Left wrist' },
  { index: RIGHT_WRIST, label: 'Right wrist' },
  { index: LEFT_PINKY, label: 'Left pinky' },
  { index: RIGHT_PINKY, label: 'Right pinky' },
  { index: LEFT_INDEX, label: 'Left index' },
  { index: RIGHT_INDEX, label: 'Right index' },
  { index: LEFT_THUMB, label: 'Left thumb' },
  { index: RIGHT_THUMB, label: 'Right thumb' },
  { index: LEFT_HIP, label: 'Left hip' },
  { index: RIGHT_HIP, label: 'Right hip' },
  { index: LEFT_KNEE, label: 'Left knee' },
  { index: RIGHT_KNEE, label: 'Right knee' },
  { index: LEFT_ANKLE, label: 'Left ankle' },
  { index: RIGHT_ANKLE, label: 'Right ankle' },
  { index: LEFT_HEEL, label: 'Left heel' },
  { index: RIGHT_HEEL, label: 'Right heel' },
  { index: LEFT_FOOT_INDEX, label: 'Left foot' },
  { index: RIGHT_FOOT_INDEX, label: 'Right foot' },
];
