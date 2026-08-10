// Synthesized UI sound cues (Web Audio API oscillators — no audio asset
// files needed). One lazily-created AudioContext is reused across calls;
// iOS requires it to be resumed from inside a user-gesture handler, which
// is naturally satisfied here since the first sound only ever plays after
// the user has tapped "Find a Partner".

let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

// Plays a single tone with a short attack/decay envelope to avoid clicks.
function playTone(freq, startDelay, duration, peakGain = 0.12) {
  const ctx = getAudioContext();
  const startTime = ctx.currentTime + startDelay;

  const oscillator = ctx.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = freq;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + duration * 0.15);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}

export function playConnectedChime() {
  // Quick ascending arpeggio — C5, E5, G5
  playTone(523.25, 0, 0.16);
  playTone(659.25, 0.1, 0.16);
  playTone(783.99, 0.2, 0.24);
}

export function playDisconnectedTone() {
  // Short descending pair — A4, E4
  playTone(440, 0, 0.2);
  playTone(329.63, 0.14, 0.3);
}

export function playMessageSentTone() {
  playTone(1046.5, 0, 0.08, 0.06); // C6, brief and quiet — shouldn't compete with call audio
}

export function playMessageReceivedTone() {
  playTone(783.99, 0, 0.1, 0.07); // G5 — distinct from the sent tone, still brief
}

let searchingIntervalId = null;

export function startSearchingLoop() {
  if (searchingIntervalId) return; // already running
  const ping = () => {
    // Two soft, quick pings — a gentle ringback-tone feel.
    playTone(587.33, 0, 0.12, 0.08);
    playTone(587.33, 0.18, 0.12, 0.08);
  };
  ping();
  searchingIntervalId = setInterval(ping, 2500);
}

export function stopSearchingLoop() {
  if (searchingIntervalId) {
    clearInterval(searchingIntervalId);
    searchingIntervalId = null;
  }
}
