import { useEffect, useRef, type RefObject } from 'react';

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement>;
  selectedCameraId?: string;
  /** Fired once the stream is playing and dimensions are known. */
  onReady: () => void;
  onError: (message: string) => void;
}

/**
 * Owns the webcam: requests getUserMedia and renders the feed into a <video>.
 * Mirrored horizontally (scaleX(-1)) so it behaves like a mirror, which is the
 * natural mental model when correcting your own form.
 */
export default function CameraView({
  videoRef,
  selectedCameraId,
  onReady,
  onError,
}: CameraViewProps) {
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);

  // Keep refs updated with latest callback references
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      try {
        const videoConstraints: MediaTrackConstraints = selectedCameraId
          ? { deviceId: { exact: selectedCameraId } }
          : { facingMode: 'user' };

        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        onReadyRef.current();
      } catch (err) {
        onErrorRef.current(
          err instanceof Error
            ? `Camera access failed: ${err.message}`
            : 'Camera access failed.',
        );
      }
    }

    start();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [selectedCameraId, videoRef]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 h-full w-full object-cover"
      style={{ transform: 'scaleX(-1)' }}
    />
  );
}
