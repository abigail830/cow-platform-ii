/** Extract spoken transcript body from pipeline markdown (mirrors evaluate-cli judge logic). */

const SPEAKER_HEADER_RE = /^##\s*\[[^\]]+\]\s*.+|^\*\*\d{2}:\d{2}(:\d{2})?\*\*\s*.+/;

function isMetadataLine(line: string): boolean {
  if (!line.startsWith('- ')) return false;
  const lowered = line.toLowerCase();
  return (
    lowered.includes('asr:') ||
    lowered.includes('language:') ||
    lowered.includes('speakers:') ||
    lowered.includes('speaker:')
  );
}

export function extractTranscriptPlainText(raw: string): string {
  const text = raw.trim();
  if (!text) return '';

  if (
    !text.startsWith('#') &&
    !text.includes('## [') &&
    !/^\*\*\d{2}:\d{2}/m.test(text)
  ) {
    return text;
  }

  const lines = text.split(/\r?\n/);
  const parts: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (SPEAKER_HEADER_RE.test(line)) {
      i += 1;
      while (i < lines.length) {
        const body = lines[i].trim();
        if (!body) {
          i += 1;
          continue;
        }
        if (body.startsWith('#') || SPEAKER_HEADER_RE.test(body) || isMetadataLine(body)) {
          break;
        }
        parts.push(body);
        i += 1;
      }
      continue;
    }
    i += 1;
  }

  if (parts.length > 0) return parts.join('\n').trim();

  return lines
    .map((row) => row.trim())
    .filter(
      (row) =>
        row &&
        !row.startsWith('#') &&
        !isMetadataLine(row) &&
        !SPEAKER_HEADER_RE.test(row),
    )
    .join('\n')
    .trim();
}
