const SOUNDTRACK_STORAGE_KEY = 'horcrux-hunter-soundtrack-enabled';
const DEFAULT_VOLUME = 0.42;

let audioElement = null;
let soundtrackEnabled = true;
let shouldResumeAfterHide = false;

function readPreference() {
  try {
    return window.localStorage.getItem(SOUNDTRACK_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writePreference(enabled) {
  try {
    window.localStorage.setItem(SOUNDTRACK_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Ignore storage failures and fall back to in-memory state.
  }
}

function playSoundtrack() {
  if (!audioElement || !soundtrackEnabled || document.hidden || !audioElement.paused) {
    return;
  }

  audioElement.muted = false;
  audioElement.volume = DEFAULT_VOLUME;

  const playPromise = audioElement.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      // Browsers may reject playback until a user gesture unlocks audio.
    });
  }
}

function pauseSoundtrack() {
  if (!audioElement || audioElement.paused) {
    return;
  }

  audioElement.pause();
}

function handleUserUnlock() {
  playSoundtrack();
}

function handleVisibilityChange() {
  if (!audioElement) {
    return;
  }

  if (document.hidden) {
    shouldResumeAfterHide = soundtrackEnabled && !audioElement.paused;
    pauseSoundtrack();
    return;
  }

  if (shouldResumeAfterHide) {
    shouldResumeAfterHide = false;
    playSoundtrack();
  }
}

export function initSoundtrack() {
  audioElement = document.getElementById('app-soundtrack');
  if (!audioElement) {
    return;
  }

  soundtrackEnabled = readPreference();
  writePreference(soundtrackEnabled);
  audioElement.loop = true;
  audioElement.preload = 'metadata';
  audioElement.muted = !soundtrackEnabled;
  audioElement.volume = DEFAULT_VOLUME;

  document.addEventListener('pointerdown', handleUserUnlock, { passive: true });
  document.addEventListener('keydown', handleUserUnlock);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  playSoundtrack();
}
