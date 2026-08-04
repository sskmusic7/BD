import { useState, useEffect, useRef, useCallback } from 'react';

const useWebRTC = (socket, sessionId, isInitiator) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [mediaError, setMediaError] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const mediaPromiseRef = useRef(null);
  const screenStreamRef = useRef(null);

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

  const createPeerConnection = useCallback((stream) => {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    const peerConnection = new RTCPeerConnection(config);
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

    return peerConnection;
  }, [socket, sessionId]);

  const startCall = useCallback(async () => {
    const stream = await initializeMedia();
    if (!stream) return;

    // Only the initiator creates a peer connection here and sends an offer.
    // The other side's peer connection is created once, in handleOffer,
    // when the real offer arrives — creating one here too would leave an
    // orphaned connection and pull in a second, disconnected media stream.
    if (isInitiator) {
      const peerConnection = createPeerConnection(stream);
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

    const handleOffer = async (data) => {
      if (data.sessionId !== sessionId) return;
      
      const stream = await initializeMedia();
      const peerConnection = createPeerConnection(stream);
      
      try {
        await peerConnection.setRemoteDescription(data.offer);
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
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    };

    const handleIceCandidate = async (data) => {
      if (data.sessionId !== sessionId || !peerConnectionRef.current) return;
      
      try {
        await peerConnectionRef.current.addIceCandidate(data.candidate);
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    };

    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIceCandidate);

    // Start the call
    startCall();

    return () => {
      socket.off('webrtc-offer', handleOffer);
      socket.off('webrtc-answer', handleAnswer);
      socket.off('webrtc-ice-candidate', handleIceCandidate);

      // If this effect re-runs (e.g. React StrictMode's dev double-invoke,
      // or any future dependency change), tear down the connection it
      // created — otherwise a stale connection lingers and a later
      // offer/answer can get routed to the wrong RTCPeerConnection.
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, [socket, sessionId, startCall, initializeMedia, createPeerConnection]);

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
    isScreenSharing,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    cleanup
  };
};

export default useWebRTC;
