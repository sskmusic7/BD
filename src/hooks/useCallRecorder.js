import { useState, useRef, useCallback, useEffect } from 'react';

// Records the call INSIDE the page instead of relying on the OS screen
// recorder — iOS Safari's screen recording (ReplayKit/Control Center) does
// not capture WebRTC audio; this is a confirmed platform limitation with no
// JS-level workaround. Compositing both video feeds onto a canvas and
// mixing both audio tracks via the Web Audio API sidesteps that entirely,
// since it's just reading MediaStreams the page already has.
export const canRecordCalls =
  typeof window !== 'undefined' &&
  !!window.MediaRecorder &&
  typeof HTMLCanvasElement !== 'undefined' &&
  !!HTMLCanvasElement.prototype.captureStream;

function pickMimeType() {
  const candidates = [
    // Safari/iOS supports mp4/h264, not webm.
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find(type => window.MediaRecorder.isTypeSupported(type)) || '';
}

const useCallRecorder = ({ localVideoRef, remoteVideoRef, localStream, remoteStream }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadFilename, setDownloadFilename] = useState(null);
  const [error, setError] = useState(null);

  const rafIdRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const compositeStreamRef = useRef(null);

  const stopDrawLoop = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    stopDrawLoop();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (compositeStreamRef.current) {
      compositeStreamRef.current.getTracks().forEach(track => track.stop());
      compositeStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [stopDrawLoop]);

  const startRecording = useCallback(() => {
    if (isRecording) return;
    setError(null);

    if (!canRecordCalls) {
      setError('Recording isn\'t supported in this browser.');
      return;
    }

    const localVideoEl = localVideoRef.current;
    const remoteVideoEl = remoteVideoRef.current;
    if (!localVideoEl || !remoteVideoEl) {
      setError('Video not ready yet — try again in a moment.');
      return;
    }

    // Off-DOM canvas — never appended to the page, just drawn to and
    // captured. Side-by-side to match the layout users already recognize.
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    const halfWidth = canvas.width / 2;

    const draw = () => {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (localVideoEl.videoWidth) {
        ctx.drawImage(localVideoEl, 0, 0, halfWidth, canvas.height);
      }
      if (remoteVideoEl.videoWidth) {
        ctx.drawImage(remoteVideoEl, halfWidth, 0, halfWidth, canvas.height);
      }
      rafIdRef.current = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);

    // Mix local + remote audio into one track. Creating/resuming the
    // AudioContext here, synchronously inside this click handler, is what
    // satisfies iOS's user-gesture requirement for audio playback/capture.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    audioContextRef.current = audioCtx;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const destination = audioCtx.createMediaStreamDestination();
    if (localStream?.getAudioTracks().length) {
      audioCtx.createMediaStreamSource(new MediaStream(localStream.getAudioTracks())).connect(destination);
    }
    if (remoteStream?.getAudioTracks().length) {
      audioCtx.createMediaStreamSource(new MediaStream(remoteStream.getAudioTracks())).connect(destination);
    }

    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);
    compositeStreamRef.current = combinedStream;

    // TEMP DIAGNOSTIC — remove after finding the audio issue.
    console.log('[recorder-debug]', {
      audioCtxState: audioCtx.state,
      localAudioTracks: localStream?.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState, muted: t.muted })),
      remoteAudioTracks: remoteStream?.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState, muted: t.muted })),
      destinationAudioTracks: destination.stream.getAudioTracks().map(t => ({ enabled: t.enabled, readyState: t.readyState, muted: t.muted })),
      combinedVideoTracks: combinedStream.getVideoTracks().length,
      combinedAudioTracks: combinedStream.getAudioTracks().length,
    });

    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(combinedStream, { mimeType }) : new MediaRecorder(combinedStream);
    } catch (err) {
      setError('Could not start recording: ' + err.message);
      teardown();
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const extension = (recorder.mimeType || mimeType || '').includes('mp4') ? 'mp4' : 'webm';
      setDownloadUrl(url);
      setDownloadFilename(`bodydouble-call-${Date.now()}.${extension}`);
    };

    mediaRecorderRef.current = recorder;
    recorder.start(1000);

    setRecordingSeconds(0);
    timerIntervalRef.current = setInterval(() => {
      setRecordingSeconds(prev => prev + 1);
    }, 1000);

    setIsRecording(true);
  }, [isRecording, localVideoRef, remoteVideoRef, localStream, remoteStream, teardown]);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    teardown();
    setIsRecording(false);
  }, [isRecording, teardown]);

  const clearDownload = useCallback(() => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    setDownloadUrl(null);
    setDownloadFilename(null);
  }, [downloadUrl]);

  // Stop cleanly if the component unmounts mid-recording (e.g. the session
  // ends) rather than leaking the canvas loop, audio context, and tracks.
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isRecording,
    recordingSeconds,
    downloadUrl,
    downloadFilename,
    error,
    startRecording,
    stopRecording,
    clearDownload,
  };
};

export default useCallRecorder;
