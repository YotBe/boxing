import { useEffect, useRef, type RefObject } from 'react';

/**
 * Where frames come from. The engine downstream neither knows nor cares — it
 * receives an `HTMLVideoElement` either way — which is exactly why swapping in
 * a recorded clip works with no changes below this component.
 */
export type FrameSource =
  | { kind: 'camera'; facingMode: 'user' | 'environment' }
  | { kind: 'file'; url: string; name: string };

export type CameraFailure = 'denied' | 'notfound' | 'inuse' | 'insecure' | 'other';

export interface CameraError {
  kind: CameraFailure;
  message: string;
  /** What the operator should actually do about it. */
  remedy: string;
}

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement>;
  source: FrameSource;
  /** Horizontal mirror. True for a selfie view, false for rear camera / file. */
  mirrored: boolean;
  /** Fired once the stream is playing and dimensions are known. */
  onReady: () => void;
  onError: (error: CameraError) => void;
}

/** A page served over plain HTTP (other than localhost) cannot open a camera. */
export function isSecureContextForCamera(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * Turn whatever getUserMedia threw into something a human can act on. The
 * browser's own messages ("Requested device not found") are worse than useless
 * standing in front of somebody, so each failure carries its own remedy.
 */
function classify(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : '';
  const detail = err instanceof Error ? err.message : String(err);

  if (!isSecureContextForCamera()) {
    return {
      kind: 'insecure',
      message: 'Camera blocked: this page is not on a secure origin.',
      remedy:
        'Browsers only allow camera access over HTTPS (or localhost). Open the deployed https:// URL instead of the LAN address.',
    };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      kind: 'denied',
      message: 'Camera permission was denied.',
      remedy:
        'Allow camera access for this site in the browser address bar, then press Retry. On iOS: Settings → Safari → Camera → Allow.',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      kind: 'notfound',
      message: 'No camera matched that request.',
      remedy:
        'Try the other camera with the Front/Rear toggle, or switch the source to Video file to run the engine on a recorded clip.',
    };
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return {
      kind: 'inuse',
      message: 'The camera is already in use by another app.',
      remedy:
        'Close any other app or tab holding the camera, then press Retry. Or switch the source to Video file.',
    };
  }
  return {
    kind: 'other',
    message: `Camera failed to start: ${detail}`,
    remedy: 'Press Retry, or switch the source to Video file to keep running.',
  };
}

/**
 * Owns the frame source: either a live `getUserMedia` stream or a recorded
 * video file, rendered into a single `<video>` the rest of the app reads from.
 */
export default function CameraView({
  videoRef,
  source,
  mirrored,
  onReady,
  onError,
}: CameraViewProps) {
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  // Keep refs updated with latest callback references, so changing a handler
  // never tears down and restarts the stream (which flickered the feed).
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  const sourceKey =
    source.kind === 'camera' ? `camera:${source.facingMode}` : `file:${source.url}`;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function startFile(url: string) {
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = null;
      video.src = url;
      video.loop = true;
      video.muted = true;
      try {
        await video.play();
        if (!cancelled) onReadyRef.current();
      } catch (err) {
        if (cancelled) return;
        onErrorRef.current({
          kind: 'other',
          message: 'That video file could not be played.',
          remedy:
            'Use an MP4 (H.264) recorded on this phone, or switch the source back to the camera.',
        });
        console.warn('Video file playback failed:', err);
      }
    }

    async function startCamera(facingMode: 'user' | 'environment') {
      if (!isSecureContextForCamera()) {
        onErrorRef.current(classify(new DOMException('insecure', 'SecurityError')));
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current({
          kind: 'other',
          message: 'This browser does not expose a camera API.',
          remedy: 'Open the page in Safari or Chrome, or use the Video file source.',
        });
        return;
      }
      try {
        // `ideal` rather than `exact`: a phone that cannot honour the request
        // should hand back its other camera, not fail outright. 1280×720 is
        // requested because the model downsamples anyway — asking for more
        // costs capture and copy time for no accuracy.
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        // removeAttribute rather than src = '': an empty src resolves against
        // the document URL, so some browsers go off and try to load the page
        // itself as a video and fire an error before the stream is attached.
        video.removeAttribute('src');
        video.loop = false;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) onReadyRef.current();
      } catch (err) {
        if (cancelled) return;
        onErrorRef.current(classify(err));
      }
    }

    if (source.kind === 'file') {
      startFile(source.url);
    } else {
      startCamera(source.facingMode);
    }

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // `sourceKey` collapses the source object to the identity that actually
    // requires a restart, so re-renders with an equivalent source are free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, videoRef]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 h-full w-full object-cover"
      style={{ transform: mirrored ? 'scaleX(-1)' : 'none' }}
    />
  );
}
