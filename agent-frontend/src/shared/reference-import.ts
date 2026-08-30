export type ReferenceImportRow = {
  filename: string;
  reference: string;
  durationSec: number | null;
  lineNumber: number;
};

export type ReferenceImportPreview = {
  rows: ReferenceImportRow[];
  unmatchedFilenames: string[];
  duplicateFilenames: string[];
};

function detectDelimiter(headerLine: string): string {
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  return tabCount > commaCount ? '\t' : ',';
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter !== ',') {
    return line.split(delimiter).map((cell) => cell.trim());
  }

  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function parseDurationCell(raw: string | undefined): number | null {
  const text = raw?.trim() ?? '';
  if (!text) return null;
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1000) / 1000;
}

function parseReferenceImportText(text: string): ReferenceImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]!);
  const firstCells = splitDelimitedLine(lines[0]!, delimiter);
  const normalized = firstCells.map(normalizeHeader);
  const filenameIndex = normalized.findIndex((cell) =>
    ['filename', 'file', 'file_name', 'name', 'audio'].includes(cell),
  );
  const referenceIndex = normalized.findIndex((cell) =>
    ['reference', 'ref', 'transcript', 'text', 'ground_truth', 'gt'].includes(cell),
  );
  const durationIndex = normalized.findIndex((cell) =>
    ['duration_sec', 'duration_seconds', 'duration', 'audio_duration_sec', 'seconds'].includes(cell),
  );

  const hasHeader = filenameIndex >= 0 && (referenceIndex >= 0 || durationIndex >= 0);
  const startIndex = hasHeader ? 1 : 0;
  const resolvedFilenameIndex = hasHeader ? filenameIndex : 0;
  const resolvedReferenceIndex = hasHeader && referenceIndex >= 0 ? referenceIndex : 1;
  const resolvedDurationIndex = hasHeader && durationIndex >= 0 ? durationIndex : -1;

  const rows: ReferenceImportRow[] = [];
  for (let lineIndex = startIndex; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitDelimitedLine(lines[lineIndex]!, delimiter);
    const filename = cells[resolvedFilenameIndex]?.trim() ?? '';
    const reference =
      resolvedReferenceIndex >= 0 ? (cells[resolvedReferenceIndex]?.trim() ?? '') : '';
    const durationSec =
      resolvedDurationIndex >= 0 ? parseDurationCell(cells[resolvedDurationIndex]) : null;
    if (!filename) continue;
    if (!reference && durationSec == null) continue;
    rows.push({ filename, reference, durationSec, lineNumber: lineIndex + 1 });
  }
  return rows;
}

export function buildReferenceImportPreview(
  text: string,
  itemNames: string[],
): ReferenceImportPreview {
  const rows = parseReferenceImportText(text);
  const itemNameSet = new Set(itemNames);
  const seen = new Set<string>();
  const duplicateFilenames: string[] = [];
  const unmatchedFilenames: string[] = [];

  for (const row of rows) {
    if (seen.has(row.filename)) {
      duplicateFilenames.push(row.filename);
    } else {
      seen.add(row.filename);
    }
    if (!itemNameSet.has(row.filename)) {
      unmatchedFilenames.push(row.filename);
    }
  }

  return {
    rows,
    unmatchedFilenames: [...new Set(unmatchedFilenames)],
    duplicateFilenames: [...new Set(duplicateFilenames)],
  };
}

export async function readReferenceImportFile(file: File): Promise<string> {
  return file.text();
}

export function datasetItemDurationSec(metadata: Record<string, unknown> | undefined): number | null {
  if (!metadata) return null;
  const raw = metadata.duration_sec ?? metadata.duration_seconds;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function formatDatasetItemDuration(sec: number | null): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(sec / 60);
  const seconds = Math.round(sec % 60);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatDatasetItemReferencePreview(
  text: string | null | undefined,
  maxLen = 80,
): string {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return '—';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}
