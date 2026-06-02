import {
  DrawingUtils,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  VISIBILITY_THRESHOLD,
  type Feedback,
  type Landmark,
  type MovementDefinition,
} from '../engine/types';

export interface SkeletonOverlayHandle {
  /** Match the canvas pixel buffer to the video's intrinsic resolution. */
  syncSize(width: number, height: number): void;
  /** Draw the skeleton for one frame, tinting out-of-range joints red. */
  draw(
    landmarks: Landmark[] | undefined,
    feedback: Feedback | null,
    movement: MovementDefinition,
  ): void;
  clear(): void;
}

/**
 * Canvas overlay sitting on top of the <video>. Mirrored to match the video so
 * the drawn skeleton lines up with the user. Uses MediaPipe's DrawingUtils for
 * the standard connectors/landmarks, dims low-visibility landmarks, then
 * highlights any out-of-range joint vertices in red using the engine's
 * per-joint feedback.
 */
const SkeletonOverlay = forwardRef<SkeletonOverlayHandle>((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const utilsRef = useRef<DrawingUtils | null>(null);

  function ctx(): CanvasRenderingContext2D | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext('2d');
    if (context && !utilsRef.current) {
      utilsRef.current = new DrawingUtils(context);
    }
    return context;
  }

  useImperativeHandle(ref, () => ({
    syncSize(width, height) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
    },
    clear() {
      const c = ctx();
      const canvas = canvasRef.current;
      if (c && canvas) c.clearRect(0, 0, canvas.width, canvas.height);
    },
    draw(landmarks, feedback, movement) {
      const c = ctx();
      const canvas = canvasRef.current;
      const utils = utilsRef.current;
      if (!c || !canvas || !utils) return;

      c.clearRect(0, 0, canvas.width, canvas.height);
      if (!landmarks || landmarks.length === 0) return;

      // DrawingUtils types z as required; at runtime it's always present.
      const asDrawable = (ls: Landmark[]) => ls as unknown as NormalizedLandmark[];

      const allGood = feedback?.ok ?? true;
      const lineColor = allGood ? '#22c55e' : '#e5e7eb';

      const visible = landmarks.filter(
        (l) => (l.visibility ?? 1) >= VISIBILITY_THRESHOLD,
      );
      const hidden = landmarks.filter(
        (l) => (l.visibility ?? 1) < VISIBILITY_THRESHOLD,
      );

      utils.drawConnectors(
        asDrawable(landmarks),
        PoseLandmarker.POSE_CONNECTIONS,
        { color: lineColor, lineWidth: 3 },
      );
      utils.drawLandmarks(asDrawable(visible), { color: lineColor, radius: 3 });
      if (hidden.length > 0) {
        utils.drawLandmarks(asDrawable(hidden), {
          color: 'rgba(120,120,120,0.4)',
          radius: 2,
        });
      }

      // Highlight the vertex of each out-of-range (and visible) joint in red.
      if (feedback) {
        const outOfRange = new Set(
          feedback.joints
            .filter((j) => j.available && !j.inRange)
            .map((j) => j.id),
        );
        const badVertices = movement.joints
          .filter((spec) => outOfRange.has(spec.id))
          .map((spec) => landmarks[spec.points[1]])
          .filter(Boolean);
        if (badVertices.length > 0) {
          utils.drawLandmarks(asDrawable(badVertices), {
            color: '#ef4444',
            radius: 7,
          });
        }
      }
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full object-cover"
      style={{ transform: 'scaleX(-1)' }}
    />
  );
});

SkeletonOverlay.displayName = 'SkeletonOverlay';
export default SkeletonOverlay;
