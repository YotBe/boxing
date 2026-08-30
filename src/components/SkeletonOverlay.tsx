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
    visibilityThreshold?: number,
  ): void;
  clear(): void;
  /** Trigger a glowing rings shockwave at the specified joint landmark. */
  triggerSplash(landmarkIndex: number, color: string): void;
}

interface HitSplash {
  x: number;
  y: number;
  startTime: number;
  color: string;
}

/**
 * Canvas overlay sitting on top of the <video>. Mirrored to match the video so
 * the drawn skeleton lines up with the user. Uses MediaPipe's DrawingUtils for
 * the standard connectors/landmarks, dims low-visibility landmarks, then
 * highlights any out-of-range joint vertices in red using the engine's
 * per-joint feedback.
 */
interface SkeletonOverlayProps {
  /** Must match the video's mirroring or the skeleton lands on the wrong side. */
  mirrored: boolean;
}

const SkeletonOverlay = forwardRef<SkeletonOverlayHandle, SkeletonOverlayProps>((
  { mirrored },
  ref,
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const utilsRef = useRef<DrawingUtils | null>(null);

  const lastLandmarksRef = useRef<Landmark[] | undefined>(undefined);
  const splashesRef = useRef<HitSplash[]>([]);

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
    triggerSplash(landmarkIndex, color) {
      if (!lastLandmarksRef.current) return;
      const landmark = lastLandmarksRef.current[landmarkIndex];
      if (landmark) {
        splashesRef.current.push({
          x: landmark.x,
          y: landmark.y,
          startTime: performance.now(),
          color,
        });
      }
    },
    draw(landmarks, feedback, movement, visibilityThreshold = VISIBILITY_THRESHOLD) {
      const c = ctx();
      const canvas = canvasRef.current;
      const utils = utilsRef.current;
      if (!c || !canvas || !utils) return;

      c.clearRect(0, 0, canvas.width, canvas.height);
      
      // Save current landmarks for splash coordinates lookup
      lastLandmarksRef.current = landmarks;
      
      if (!landmarks || landmarks.length === 0) return;

      // DrawingUtils types z as required; at runtime it's always present.
      const asDrawable = (ls: Landmark[]) => ls as unknown as NormalizedLandmark[];

      const allGood = feedback?.ok ?? true;
      const lineColor = allGood ? '#22c55e' : '#e5e7eb';

      const visible = landmarks.filter(
        (l) => (l.visibility ?? 1) >= visibilityThreshold,
      );
      const hidden = landmarks.filter(
        (l) => (l.visibility ?? 1) < visibilityThreshold,
      );

      // Draw skeleton skeleton lines
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

      // Draw active visual hit shockwaves
      const now = performance.now();
      splashesRef.current = splashesRef.current.filter((s) => now - s.startTime < 350);
      splashesRef.current.forEach((s) => {
        const elapsed = now - s.startTime;
        const progress = elapsed / 350;
        const radius = 12 + progress * 48; // expanding ring
        const opacity = 1 - progress;
        
        c.save();
        c.beginPath();
        c.arc(s.x * canvas.width, s.y * canvas.height, radius, 0, Math.PI * 2);
        c.strokeStyle = s.color;
        c.lineWidth = 4 * (1 - progress);
        c.stroke();
        
        c.beginPath();
        c.arc(s.x * canvas.width, s.y * canvas.height, radius * 0.6, 0, Math.PI * 2);
        // Replace base RGB with opacity mapping for visual glow fill
        c.fillStyle = s.color.replace('rgb', 'rgba').replace(')', `, ${opacity * 0.25})`);
        c.fill();
        c.restore();
      });

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
      className="absolute inset-0 h-full w-full object-cover pointer-events-none"
      style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
    />
  );
});

SkeletonOverlay.displayName = 'SkeletonOverlay';
export default SkeletonOverlay;
