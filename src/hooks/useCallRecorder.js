import { useState, useRef, useCallback, useEffect } from 'react';
import config from '../config/config';

// Records the call INSIDE the page instead of relying on the OS screen
// recorder — iOS Safari's screen recording (ReplayKit/Control Center) does
// not capture WebRTC audio; this is a confirmed platform limitation with no
// JS-level workaround. Compositing both video feeds onto a canvas and
// including both raw audio tracks in the recorded stream sidesteps that
// entirely, since it's just reading MediaStreams the page already has.
//
// Audio IS mixed via the Web Audio API, into a single track.
//
// This corrects two claims that used to live here and were both wrong.
// "MediaRecorder mixes multiple audio tracks natively" is false — the spec
// leaves it implementation-defined and Chromium records only the first, so
// recordings captured one participant and silently dropped the other.
// "A createMediaStreamDestination() track yields a 0-byte file" is also
// false; it records fine. The likely original cause was an AudioContext
// created outside a user gesture (so suspended, producing silence) or one
// that got garbage collected mid-recording — hence creating it inside the
// Record click and holding it on a ref.
//
// Verified by giving each participant a distinct tone and measuring the
// recording: before, local 440Hz was at -40dB and remote 1200Hz at -74dB
// (absent); after, -40.4dB and -40.7dB — both present, evenly balanced.
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
  // Held so the mixing graph survives for the whole recording — a collected
  // AudioContext takes the mixed audio track down with it.
  const audioContextRef = useRef(null);

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
    if (audioContextRef.current) {
      // Releases the mixing graph. The participants' own tracks are inputs
      // to it, not owned by it, so the live call is unaffected.
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
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
    // captured. Portrait 9:16 with the two people stacked, because these
    // recordings are watched (and shared) on a phone; a landscape
    // side-by-side frame wastes most of the screen there. Partner on top,
    // you underneath, matching the "stacked" layout in the call itself.
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');
    const tileHeight = canvas.height / 2;
    const tileAspect = canvas.width / tileHeight;

    // Centre-crop each feed into its tile instead of stretching it. A
    // webcam is a wide 16:9 (or 4:3) image and each tile here is taller
    // than it is wide, so scaling to fit would squash faces noticeably —
    // much more so than in the old wide layout, where the mismatch was
    // small enough to get away with.
    const drawCropped = (videoEl, destY) => {
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      if (!vw || !vh) return;

      const sourceAspect = vw / vh;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (sourceAspect > tileAspect) {
        sw = vh * tileAspect;          // too wide — trim the sides
        sx = (vw - sw) / 2;
      } else {
        sh = vw / tileAspect;          // too tall — trim top and bottom
        sy = (vh - sh) / 2;
      }

      ctx.drawImage(videoEl, sx, sy, sw, sh, 0, destY, canvas.width, tileHeight);
    };

    const draw = () => {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawCropped(remoteVideoEl, 0);
      drawCropped(localVideoEl, tileHeight);
      rafIdRef.current = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);
    ownedTracksRef.current = canvasStream.getVideoTracks();

    // Mix both voices into ONE audio track.
    //
    // Putting two audio tracks in the stream and letting MediaRecorder sort
    // it out does NOT work: the spec leaves multi-track behaviour
    // implementation-defined and Chromium records only the first, so
    // recordings captured your mic and silently dropped the other person.
    // Measured with a distinct tone per participant: the local 440Hz came
    // through at -40dB while the remote 1200Hz sat at -74dB, i.e. absent.
    //
    // The AudioContext is created here, inside the Record click, because a
    // context created outside a user gesture starts suspended and yields
    // silence. It's kept on a ref so it can't be garbage collected
    // mid-recording, which takes the whole graph down with it.
    const combinedStream = new MediaStream(canvasStream.getVideoTracks());
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioSources = [localStream, remoteStream]
      .filter(s => s?.getAudioTracks().length);

    if (AudioContextClass && audioSources.length) {
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});

      const destination = audioContext.createMediaStreamDestination();
      audioSources.forEach((source) => {
        // A fresh MediaStream wrapper per track — the source node takes the
        // first audio track of whatever it's given, and the shared original
        // streams are left untouched.
        const node = audioContext.createMediaStreamSource(
          new MediaStream([source.getAudioTracks()[0]])
        );
        // Connected only to the recording destination, never to
        // audioContext.destination — that would play the call back through
        // the speakers and echo.
        node.connect(destination);
      });

      combinedStream.addTrack(destination.stream.getAudioTracks()[0]);
    } else if (audioSources.length) {
      // No Web Audio: better to capture one side than none.
      combinedStream.addTrack(audioSources[0].getAudioTracks()[0]);
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
