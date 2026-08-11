import { useState, useEffect, useRef, useCallback } from 'react';
import config from '../config/config';

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// Fetched once per page load and reused. STUN alone can't get a path
// through certain NAT/firewall pairs — ICE just goes "checking" ->
// "disconnected" and you get a connected-looking call with no video. The
// TURN relay is the fallback for exactly that case. Failing to fetch is
// non-fatal: STUN-only still works on most networks.
let iceServersPromise = null;

function getIceServers() {
  if (!iceServersPromise) {
    iceServersPromise = fetch(`${config.SERVER_URL}/api/turn-credentials`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        const turnServers = data?.iceServers || [];
        if (turnServers.length === 0) {
          console.warn('No TURN relay configured — calls across restrictive networks may fail');
        }
        return [...STUN_SERVERS, ...turnServers];
      })
      .catch(err => {
        console.error('Could not fetch TURN credentials, falling back to STUN only:', err.message);
        return STUN_SERVERS;
      });
  }
  return iceServersPromise;
}

const useWebRTC = (socket, sessionId, isInitiator) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [mediaError, setMediaError] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectionState, setConnectionState] = useState('new');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const mediaPromiseRef = useRef(null);
  const screenStreamRef = useRef(null);
  // ICE candidates that arrived before we could apply them. A candidate can
  // only be added once the peer connection exists AND its remote description
  // is set; anything earlier has to wait here or it's lost for good.
  const pendingCandidatesRef = useRef([]);
  // Set by the signalling effect below. createPeerConnection needs to kick
  // off recovery from its state-change handler, but recovery needs socket
  // and sessionId — a ref keeps that one-way instead of making the two
  // callbacks depend on each other.
  const recoverRef = useRef(null);
  const disconnectTimerRef = useRef(null);

  const initializeMedia = useCallback(async () => {
    // Reuse the existing/in-flight stream instead of calling getUserMedia
    // again — a second concurrent request for the same camera can fail
    // (device busy) or hand back a stream that never reaches the peer
    // connection, which is why video wouldn't come through.
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    if (mediaPromiseRef.current) {
      return mediaPromiseRef.current;
    }

    mediaPromiseRef.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

        setLocalStream(stream);
        localStreamRef.current = stream;
        setMediaError(null);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        return stream;
      } catch (error) {
        // Always log — a silently-swallowed permission denial here is
        // exactly what makes "camera won't connect" impossible to diagnose.
        console.error('Error accessing camera/mic:', error.name, error.message);
        const isDenied = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';

        // Try audio only if video fails
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });
          setLocalStream(audioStream);
          localStreamRef.current = audioStream;
          setMediaError(isDenied
            ? 'Camera access is blocked for this site. Check your browser\'s site permissions and reload.'
            : `Camera unavailable (${error.name}). It may be in use by another app.`);
          return audioStream;
        } catch (audioError) {
          console.error('Error accessing audio:', audioError.name, audioError.message);
          const audioAlsoDenied = audioError.name === 'NotAllowedError' || audioError.name === 'PermissionDeniedError';
          setMediaError(isDenied && audioAlsoDenied
            ? 'Camera and microphone access are blocked for this site. Check your browser\'s site permissions and reload.'
            : 'Could not access camera or microphone.');
          return null;
        }
      }
    })();

    try {
      return await mediaPromiseRef.current;
    } finally {
      mediaPromiseRef.current = null;
    }
  }, []);

  // Phones commonly END the camera/mic tracks when you switch to another
  // app — they don't just pause. Coming back, the track is dead
  // (readyState 'ended') and the sender keeps transmitting nothing, so the
  // other person is stuck looking at a frozen frame even once the network
  // is fine again. Re-acquire and swap the new tracks into the existing
  // senders; replaceTrack needs no renegotiation for the same kind.
  const ensureLocalTracksLive = useCallback(async () => {
    const peerConnection = peerConnectionRef.current;
    const current = localStreamRef.current;
    const somethingDied = !current || current.getTracks().some(t => t.readyState === 'ended');
    if (!somethingDied) return;

    console.log('Local tracks ended (likely app backgrounded) — re-acquiring');
    localStreamRef.current = null;
    const fresh = await initializeMedia();
    if (!fresh || !peerConnection) return;

    for (const track of fresh.getTracks()) {
      const sender = peerConnection.getSenders().find(s => s.track?.kind === track.kind)
        // A sender whose track already ended reports track === null, so also
        // match on the transceiver's configured kind.
        || peerConnection.getSenders().find(s => !s.track);
      if (sender) {
        try {
          await sender.replaceTrack(track);
        } catch (err) {
          console.error('Could not swap in refreshed track:', err.message);
        }
      }
    }
  }, [initializeMedia]);

  const createPeerConnection = useCallback(async (stream) => {
    const iceServers = await getIceServers();
    const peerConnection = new RTCPeerConnection({ iceServers });
    peerConnectionRef.current = peerConnection;

    // Add local stream tracks
    if (stream) {
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc-ice-candidate', {
          sessionId,
          candidate: event.candidate
        });
      }
    };

    // Surfaced in the UI so a call that can't connect says so, instead of
    // spinning on "Connecting..." forever with no way to tell the
    // difference between "still negotiating" and "this will never work".
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log('ICE connection state:', state);
      setConnectionState(state);

      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }

      if (state === 'failed') {
        // Terminal — ICE will not retry on its own.
        recoverRef.current?.();
      } else if (state === 'disconnected') {
        // Often self-heals within a few seconds (brief signal loss, a
        // network handover). Give it a moment before forcing a restart,
        // otherwise every blip triggers a needless renegotiation.
        disconnectTimerRef.current = setTimeout(() => {
          disconnectTimerRef.current = null;
          if (peerConnectionRef.current?.iceConnectionState === 'disconnected') {
            recoverRef.current?.();
          }
        }, 4000);
      }
    };

    return peerConnection;
  }, [socket, sessionId]);

  const startCall = useCallback(async () => {
    // Deliberately continues even when this returns null. A blocked or
    // broken camera/mic must not stop the call being set up: without an
    // offer the other person just sits on "Connecting..." forever with no
    // explanation, and you lose any chance of seeing THEM too.
    const stream = await initializeMedia();

    // Only the initiator creates a peer connection here and sends an offer.
    // The other side's peer connection is created once, in handleOffer,
    // when the real offer arrives — creating one here too would leave an
    // orphaned connection and pull in a second, disconnected media stream.
    if (isInitiator) {
      const peerConnection = await createPeerConnection(stream);

      // Whatever we couldn't capture locally, still ask to RECEIVE. An
      // offer only contains slots ("m-lines") for media it knows about, so
      // an audio-only offer — which is exactly what a blocked camera
      // produces via the audio fallback — gives the other side nowhere to
      // put their video, and their camera can never reach us however good
      // the connection is. These recvonly transceivers keep the incoming
      // direction open regardless of local device problems. Only needed on
      // the offering side; the answerer's slots are dictated by the offer
      // it receives, which the browser fills in as recvonly by itself.
      if (!stream || stream.getVideoTracks().length === 0) {
        peerConnection.addTransceiver('video', { direction: 'recvonly' });
      }
      if (!stream || stream.getAudioTracks().length === 0) {
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
      }

      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        if (socket) {
          socket.emit('webrtc-offer', {
            sessionId,
            offer
          });
        }
      } catch (error) {
        console.error('Error creating offer:', error);
      }
    }
  }, [initializeMedia, createPeerConnection, isInitiator, socket, sessionId]);

  // Reassign srcObject when video refs change (e.g., layout changes).
  // Shows the screen share instead of the camera while one is active.
  useEffect(() => {
    if (!localVideoRef.current) return;
    const desiredStream = isScreenSharing ? screenStreamRef.current : localStreamRef.current;
    if (desiredStream) {
      localVideoRef.current.srcObject = desiredStream;
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteStream]);

  useEffect(() => {
    if (!socket || !sessionId) return;

    // Applies everything that queued up while we weren't ready yet. Must run
    // immediately after any setRemoteDescription.
    const flushPendingCandidates = async () => {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection || !peerConnection.remoteDescription) return;

      const queued = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      for (const candidate of queued) {
        try {
          await peerConnection.addIceCandidate(candidate);
        } catch (error) {
          console.error('Error applying queued ICE candidate:', error);
        }
      }
    };

    const handleOffer = async (data) => {
      if (data.sessionId !== sessionId) return;

      // getUserMedia can take a while (permission prompt, camera warm-up),
      // and the other side is already trickling candidates at us during it.
      // They're buffered rather than dropped — see handleIceCandidate.
      const stream = await initializeMedia();

      // Reuse the existing connection when there is one. A second offer on
      // a live call is a RENEGOTIATION (an ICE restart after the network
      // dropped or the app was backgrounded) — building a fresh connection
      // here would throw away the working one, and the restart could never
      // succeed.
      const existing = peerConnectionRef.current;
      const peerConnection = existing && existing.signalingState !== 'closed'
        ? existing
        : await createPeerConnection(stream);

      try {
        await peerConnection.setRemoteDescription(data.offer);
        await flushPendingCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('webrtc-answer', {
          sessionId,
          answer
        });
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    };

    const handleAnswer = async (data) => {
      if (data.sessionId !== sessionId || !peerConnectionRef.current) return;

      try {
        await peerConnectionRef.current.setRemoteDescription(data.answer);
        // The answerer's candidates routinely beat its answer here.
        await flushPendingCandidates();
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    };

    const handleIceCandidate = async (data) => {
      if (data.sessionId !== sessionId) return;

      const peerConnection = peerConnectionRef.current;
      // Queue until there's a connection with a remote description to attach
      // it to. Dropping these instead (the old behaviour) is invisible on a
      // LAN — host candidates travel inside the SDP, so the call still
      // connects — but across the internet the STUN-derived candidates are
      // the only ones that can work, and they only ever arrive trickled like
      // this. Losing them means ICE never completes: both people see a
      // "connected" call with no video or audio.
      if (!peerConnection || !peerConnection.remoteDescription) {
        pendingCandidatesRef.current.push(data.candidate);
        return;
      }

      try {
        await peerConnection.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    };

    // Rebuilds the media path without tearing down the call. Only the
    // initiator generates the offer — if both sides offered at once the
    // descriptions would collide (glare), so the other side asks instead.
    const restartIce = async () => {
      const peerConnection = peerConnectionRef.current;
      if (!peerConnection || peerConnection.signalingState === 'closed') return;

      try {
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        socket.emit('webrtc-offer', { sessionId, offer });
        console.log('Sent ICE restart offer');
      } catch (error) {
        console.error('ICE restart failed:', error);
      }
    };

    const recover = async () => {
      await ensureLocalTracksLive();
      if (isInitiator) {
        restartIce();
      } else {
        // Ask the initiator to drive it.
        socket.emit('webrtc-restart-request', { sessionId });
        console.log('Requested ICE restart from partner');
      }
    };
    recoverRef.current = recover;

    const handleRestartRequest = (data) => {
      if (data.sessionId !== sessionId || !isInitiator) return;
      console.log('Partner asked for an ICE restart');
      restartIce();
    };

    // Coming back from another app is the moment to check everything is
    // still alive: the socket may have reconnected, the camera track may
    // have been killed, and ICE may be dead without having fired 'failed'
    // yet because the whole page was frozen.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const state = peerConnectionRef.current?.iceConnectionState;
      console.log('App foregrounded, ICE state:', state);
      if (state === 'connected' || state === 'completed') {
        ensureLocalTracksLive();
      } else if (peerConnectionRef.current) {
        recover();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIceCandidate);
    socket.on('webrtc-restart-request', handleRestartRequest);

    // Start the call
    startCall();

    return () => {
      socket.off('webrtc-offer', handleOffer);
      socket.off('webrtc-answer', handleAnswer);
      socket.off('webrtc-ice-candidate', handleIceCandidate);
      socket.off('webrtc-restart-request', handleRestartRequest);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      recoverRef.current = null;
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }

      // If this effect re-runs (e.g. React StrictMode's dev double-invoke,
      // or any future dependency change), tear down the connection it
      // created — otherwise a stale connection lingers and a later
      // offer/answer can get routed to the wrong RTCPeerConnection.
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      pendingCandidatesRef.current = [];
    };
  }, [socket, sessionId, startCall, initializeMedia, createPeerConnection, ensureLocalTracksLive, isInitiator]);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  }, []);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  }, []);

  // Swaps the video RTCRtpSender's track back to the camera. Reused both for
  // the button and for the browser's native "Stop sharing" control.
  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    const videoSender = peerConnectionRef.current?.getSenders().find(s => s.track?.kind === 'video');
    if (cameraTrack && videoSender) {
      videoSender.replaceTrack(cameraTrack).catch(err => console.error('Error restoring camera track:', err));
    }

    setIsScreenSharing(false);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError('Screen sharing isn\'t supported in this browser.');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenStreamRef.current = screenStream;

      const videoSender = peerConnectionRef.current?.getSenders().find(s => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }

      // The browser's own "Stop sharing" bar ends the track directly —
      // this is the only reliable way to catch that and revert to camera.
      screenTrack.onended = () => stopScreenShare();

      setIsScreenSharing(true);
    } catch (error) {
      // User cancelling the picker throws NotAllowedError — not a real error.
      if (error.name !== 'NotAllowedError') {
        console.error('Error starting screen share:', error.name, error.message);
      }
    }
  }, [isScreenSharing, stopScreenShare]);

  const cleanup = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  return {
    localVideoRef,
    remoteVideoRef,
    localStream,
    remoteStream,
    isVideoEnabled,
    isAudioEnabled,
    mediaError,
    connectionState,
    isScreenSharing,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    cleanup
  };
};

export default useWebRTC;
