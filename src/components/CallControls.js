import React from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  ScreenShare,
  ScreenShareOff,
  Circle,
  Square,
  Sparkles,
  MessageCircle,
  UserPlus,
  XCircle,
} from 'lucide-react';

/**
 * The in-call button bar.
 *
 * Extracted because SessionPage renders three camera layouts and each one
 * carried its own byte-identical copy of this bar — so every control change
 * meant three edits and three chances to drift (they had already drifted:
 * only one copy had the chat toggle). One copy now, with the chat button
 * opt-in via `showChatToggle`, which is the only real difference between
 * the three.
 */
const controlClass = (active, activeClass, idleClass = 'bg-white/20 hover:bg-white/30') =>
  `p-3 rounded-full transition-colors ${active ? activeClass : idleClass}`;

const CallControls = ({
  isVideoEnabled,
  toggleVideo,
  isAudioEnabled,
  toggleAudio,
  canScreenShare,
  isScreenSharing,
  toggleScreenShare,
  canBlur,
  isBlurEnabled,
  isBlurLoading,
  toggleBlur,
  canRecordCalls,
  isRecording,
  startRecording,
  stopRecording,
  showChatToggle = false,
  showChat,
  onToggleChat,
  addFriend,
  endSession,
}) => (
  <div className="flex justify-center space-x-4 mt-4">
    <button
      onClick={toggleVideo}
      className={controlClass(isVideoEnabled, 'bg-green-500 hover:bg-green-600', 'bg-red-500 hover:bg-red-600')}
      title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
    >
      {isVideoEnabled
        ? <Video className="w-5 h-5 text-white" />
        : <VideoOff className="w-5 h-5 text-white" />}
    </button>

    <button
      onClick={toggleAudio}
      className={controlClass(isAudioEnabled, 'bg-green-500 hover:bg-green-600', 'bg-red-500 hover:bg-red-600')}
      title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
    >
      {isAudioEnabled
        ? <Mic className="w-5 h-5 text-white" />
        : <MicOff className="w-5 h-5 text-white" />}
    </button>

    {canScreenShare && (
      <button
        onClick={toggleScreenShare}
        className={controlClass(isScreenSharing, 'bg-blue-500 hover:bg-blue-600')}
        title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
      >
        {isScreenSharing
          ? <ScreenShareOff className="w-5 h-5 text-white" />
          : <ScreenShare className="w-5 h-5 text-white" />}
      </button>
    )}

    {canBlur && (
      <button
        onClick={toggleBlur}
        disabled={isBlurLoading}
        className={controlClass(isBlurEnabled, 'bg-blue-500 hover:bg-blue-600')}
        title={
          isBlurLoading
            ? 'Preparing background blur…'
            : isBlurEnabled ? 'Turn off background blur' : 'Blur my background'
        }
      >
        <Sparkles className={`w-5 h-5 text-white ${isBlurLoading ? 'animate-pulse' : ''}`} />
      </button>
    )}

    {canRecordCalls && (
      <button
        onClick={isRecording ? stopRecording : startRecording}
        className={controlClass(isRecording, 'bg-red-600 hover:bg-red-700')}
        title={isRecording ? 'Stop recording' : 'Record call'}
      >
        {isRecording
          ? <Square className="w-5 h-5 text-white" />
          : <Circle className="w-5 h-5 text-white" />}
      </button>
    )}

    {/* Only the side-by-side layout needs this — the stacked layouts show
        the chat panel inline rather than behind a toggle. */}
    {showChatToggle && (
      <button
        onClick={onToggleChat}
        className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors lg:hidden"
        title={showChat ? 'Hide chat' : 'Show chat'}
      >
        <MessageCircle className="w-5 h-5 text-white" />
      </button>
    )}

    <button
      onClick={addFriend}
      className="p-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors"
      title="Add as friend"
    >
      <UserPlus className="w-5 h-5 text-white" />
    </button>

    <button
      onClick={endSession}
      className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
      title="End call"
    >
      <XCircle className="w-5 h-5 text-white" />
    </button>
  </div>
);

export default CallControls;
