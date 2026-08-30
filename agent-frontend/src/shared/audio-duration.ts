/** Read audio file duration in the browser (seconds). */
const AUDIO_DURATION_TIMEOUT_MS = 15_000;

export async function readAudioDurationSec(file: File): Promise<number | null> {
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(file.name)) {
    return null;
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();

    const finish = (value: number | null) => {
      window.clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(null), AUDIO_DURATION_TIMEOUT_MS);

    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration;
      if (Number.isFinite(duration) && duration > 0) {
        finish(Math.round(duration * 1000) / 1000);
        return;
      }
      finish(null);
    });

    audio.addEventListener('error', () => finish(null));
    audio.preload = 'metadata';
    audio.src = url;
  });
}
