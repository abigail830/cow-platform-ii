export type AsrHotwordInput = {
  text: string;
  weight: number;
  lang?: string | null;
  note?: string | null;
};

export type DashScopeVocabularyEntry = {
  text: string;
  weight: number;
  lang?: string;
};

const MAX_PRECOMPILED_LIST_ENTRIES = 500;
const MAX_SUPER_HOTWORDS = 50;

function isQwenAsrModel(modelId: string): boolean {
  const lowered = modelId.toLowerCase();
  return lowered.includes('qwen') && lowered.includes('asr');
}

export function validateHotwordText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Hotword text is required');
  const hasNonAscii = /[^\x00-\x7F]/.test(trimmed);
  if (hasNonAscii) {
    if (trimmed.length > 15) {
      throw new Error(`Hotword "${trimmed}" exceeds 15 characters for non-ASCII text`);
    }
  } else {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length > 7) {
      throw new Error(`Hotword "${trimmed}" exceeds 7 ASCII word segments`);
    }
  }
  return trimmed;
}

export function validateHotwordWeight(weight: number, providerModelId: string): number {
  if (!Number.isFinite(weight)) throw new Error('Hotword weight must be a number');
  const rounded = Math.trunc(weight);
  if (rounded === 50 && isQwenAsrModel(providerModelId)) return 50;
  if (rounded < 1 || rounded > 5) {
    throw new Error('Hotword weight must be between 1 and 5 (or 50 for Qwen super hotwords)');
  }
  return rounded;
}

export function mergeHotwordsForChannel(
  rows: Array<{ text: string; weight: number; lang: string | null }>,
): DashScopeVocabularyEntry[] {
  const map = new Map<string, DashScopeVocabularyEntry>();
  for (const row of rows) {
    const text = row.text.trim();
    if (!text) continue;
    const lang = row.lang?.trim() || undefined;
    const key = `${lang ?? ''}\0${text.toLowerCase()}`;
    const existing = map.get(key);
    if (!existing || row.weight > existing.weight) {
      map.set(key, {
        text,
        weight: row.weight,
        ...(lang ? { lang } : {}),
      });
    }
  }
  const merged = [...map.values()];
  if (merged.length > MAX_PRECOMPILED_LIST_ENTRIES) {
    throw new Error(
      `Channel hotword count (${merged.length}) exceeds precompiled list limit (${MAX_PRECOMPILED_LIST_ENTRIES})`,
    );
  }
  const superCount = merged.filter((item) => item.weight === 50).length;
  if (superCount > MAX_SUPER_HOTWORDS) {
    throw new Error(`Super hotwords (weight=50) exceed limit of ${MAX_SUPER_HOTWORDS}`);
  }
  return merged;
}

export function channelVocabularyPrefix(channelId: string): string {
  const compact = channelId.replace(/-/g, '').toLowerCase();
  const alnum = compact.replace(/[^a-z0-9]/g, '');
  return alnum.slice(0, 10) || 'ch';
}
