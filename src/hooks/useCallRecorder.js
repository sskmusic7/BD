import { useState, useRef, useCallback, useEffect } from 'react';
import config from '../config/config';

// Records the call INSIDE the page instead of relying on the OS screen
// recorder — iOS Safari's screen recording (ReplayKit/Control Center) does
// not capture WebRTC audio; this is a confirmed platform limitation with no
// JS-level workaround. Compositing both video feeds onto a canvas and
// including both raw audio tracks in the recorded stream sidesteps that
// entirely, since it's just reading MediaStreams the page already has.
//
// Audio is NOT mixed via the Web Audio API on purpose — verified directly
// (isolated bisection testing) that Chromium's MediaRecorder produces a
// completely empty (0-byte) file for a track sourced from
// AudioContext.createMediaStreamDestination(), even recording that track
// alone with no video at all. Including both RAW audio tracks directly in
// the recorded stream works instead — MediaRecorder mixes multiple audio
// tracks in a stream natively, and it's simpler code besides.
//
// Chunks are streamed to the server as they're produced (server/index.js's
// /api/recordings/:id/* routes) instead of held in browser memory for the
// whole recording — a long session could otherwise mean a lot of RAM
// sitting in the tab, which is a real crash risk on a phone.
export const canRecordCalls =
  typeof window !== 'undefined' &&
  !!window.MediaRecorder &&
  typeof HTMLCanvasElement !== 'undefined' &&
  !!HTMLCanvasElement.prototype.captureStream &&
  typeof crypto !== 'undefined' &&
  !!crypto.randomUUID;

// Modest, explicit caps instead of browser defaults — keeps an hour-long
// recording predictable (roughly 700MB-1GB) rather than an unbounded size
// on a server disk shared with other live services.
const VIDEO_BITS_PER_SECOND = 1_500_000;
const AUDIO_BITS_PER_SECOND = 96_000;

function pickMimeType() {
  const candidates = [
    // mp4 first, deliberately — verified directly (isolated bisection
    // testing, not guesswork) that Chromium's MediaRecorder produces a
    // completely empty (0-byte) file for *any* video/webm variant once the
    // stream is a reconstructed MediaStream combining tracks from
    // different sources (exactly what this hook always does: a canvas
    // video track + raw audio tracks). This reproduced with vp9, vp8, and
    // generic webm, and with multiple stream-construction approaches — a
    // genuine Chromium limitation, not a workaround-able API misuse.
    // video/mp4 (Chromium maps generic 'video/mp4' to vp9/opus-in-mp4
    // internally, since it doesn't support h264/aac at all) reliably
    // produces a real, playable file with the same reconstructed stream.
    'video/mp4;codecs=h264,aac',
    'video/mp4',
  ];
  return candidates.find(type => window.MediaRecorder.isTypeSupported(type)) || '';
}

async function uploadChunk(recordingId, blob) {
  const url = `${config.SERVER_URL}/api/recordings/${recordingId}/chunk`;
  // Explicit Content-Type instead of letting fetch use the Blob's own type
  // (MediaRecorder's mimeType, e.g. "video/mp4;codecs=h264,aac") — that
  // codecs parameter has an unquoted comma, which isn't valid per HTTP's
  // parameter syntax and breaks the server's content-type matching,
  // silently skipping raw body parsing. Verified directly (reproduced with
  // plain curl, independent of fetch) before landing on this fix.
  const attempt = () => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: blob,
  });

  let response = await attempt().catch(() => null);
  if (!response || !response.ok) {
    // One retry — chunk uploads happen every second during a live call,
    // a single transient network blip shouldn't need to fail the whole
    // recording.
    response = await attempt().catch(() => null);
  }
  return !!response && response.ok;
}

const useCallRecorder = ({ localVideoRef, remoteVideoRef, localStream, remoteStream }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadFilename, setDownloadFilename] = useState(null);
  const [error, setError] = useState(null);

  const rafIdRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingIdRef = useRef(null);
  const failedChunkCountRef = useRef(0);
  const timerIntervalRef = useRef(null);
  const compositeStreamRef = useRef(null);
  // Only the canvas's own captured tracks — these belong exclusively to the
  // recorder and are safe to stop. The audio tracks added to
  // compositeStreamRef are the SAME track objects the live call is using
  // (a MediaStreamTrack can belong to multiple MediaStreams at once, this
  // is standard/supported), so teardown must never call .stop() on those —
  // it would end the live call's audio, not just the recording.
  const ownedTracksRef = useRef([]);

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
    ownedTracksRef.current.forEach(track => track.stop());
    ownedTracksRef.current = [];
    compositeStreamRef.current = null;
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
    ownedTracksRef.current = canvasStream.getVideoTracks();

    // Both raw audio tracks go in directly, un-cloned — MediaRecorder mixes
    // multiple audio tracks in a stream natively. Previously these were
    // .clone()'d so teardown could safely stop them without touching the
    // live call's actual audio — but MediaStreamTrack.clone() turned out to
    // be unreliable on iOS Safari specifically for getUserMedia-sourced
    // tracks (confirmed: recordings were missing the LOCAL mic entirely —
    // the cloned track — while the remote track, sourced from WebRTC's
    // ontrack instead of getUserMedia, came through fine). A track can
    // belong to multiple MediaStreams at once, so adding the originals
    // directly works without cloning; teardown only stops ownedTracksRef
    // (the canvas tracks), never these shared audio tracks.
    const combinedStream = new MediaStream(canvasStream.getVideoTracks());
    if (localStream?.getAudioTracks().length) {
      combinedStream.addTrack(localStream.getAudioTracks()[0]);
    }
    if (remoteStream?.getAudioTracks().length) {
      combinedStream.addTrack(remoteStream.getAudioTracks()[0]);
    }
    compositeStreamRef.current = combinedStream;

    const mimeType = pickMimeType();
    const recorderOptions = {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    };
    let recorder;
    try {
      recorder = new MediaRecorder(combinedStream, recorderOptions);
    } catch (err) {
      setError('Could not start recording: ' + err.message);
      teardown();
      return;
    }

    const recordingId = crypto.randomUUID();
    recordingIdRef.current = recordingId;
    failedChunkCountRef.current = 0;

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return;
      uploadChunk(recordingId, event.data).then((ok) => {
        if (!ok) {
          failedChunkCountRef.current += 1;
          console.error('Recording chunk upload failed (chunk skipped, recording continues)');
        }
      });
    };
    recorder.onstop = async () => {
      try {
        const res = await fetch(`${config.SERVER_URL}/api/recordings/${recordingId}/finish`, { method: 'POST' });
        if (!res.ok) throw new Error(`finish failed: ${res.status}`);
        setDownloadUrl(`${config.SERVER_URL}/api/recordings/${recordingId}/download`);
        setDownloadFilename(`bodydouble-call-${Date.now()}.mp4`);
        if (failedChunkCountRef.current > 0) {
          setError(`Recording saved, but ${failedChunkCountRef.current} segment(s) failed to upload and may be missing.`);
        }
      } catch (err) {
        setError('Could not finalize the recording: ' + err.message);
      }
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
    setDownloadUrl(null);
    setDownloadFilename(null);
  }, []);

  // Stop cleanly if the component unmounts mid-recording (e.g. the session
  // ends) rather than leaking the canvas loop and tracks.
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
