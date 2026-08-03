import { useState, useEffect, useRef, useCallback } from 'react';

const useWebRTC = (socket, sessionId, isInitiator) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const mediaPromiseRef = useRef(null);

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

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        return stream;
      } catch (error) {
        // Only log if it's not a permission denial (expected behavior)
        if (error.name !== 'NotAllowedError' && error.name !== 'PermissionDeniedError') {
          console.error('Error accessing media devices:', error);
        }
        // Try audio only if video fails
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });
          setLocalStream(audioStream);
          localStreamRef.current = audioStream;
          return audioStream;
        } catch (audioError) {
          // Only log if it's not a permission denial
          if (audioError.name !== 'NotAllowedError' && audioError.name !== 'PermissionDeniedError') {
            console.error('Error accessing audio:', audioError);
          }
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

  // Reassign srcObject when video refs change (e.g., layout changes)
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
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

  const cleanup = useCallback(() => {
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
    toggleVideo,
    toggleAudio,
    cleanup
  };
};

export default useWebRTC;
