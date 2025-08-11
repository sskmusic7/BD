import { useState, useEffect, useRef, useCallback } from 'react';

const useWebRTC = (socket, sessionId, isInitiator) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);



  const initializeMedia = useCallback(async () => {
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
      
      // Initially mute video, keep audio
      stream.getVideoTracks().forEach(track => {
        track.enabled = false;
      });
      
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      // Try audio only if video fails
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        setLocalStream(audioStream);
        localStreamRef.current = audioStream;
        return audioStream;
      } catch (audioError) {
        console.error('Error accessing audio:', audioError);
        return null;
      }
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

    const peerConnection = createPeerConnection(stream);
    
    if (isInitiator) {
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
