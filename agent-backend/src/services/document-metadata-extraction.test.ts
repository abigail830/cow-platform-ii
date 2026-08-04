import { describe, expect, it } from 'vitest';
import {
  channelHasMetadataExtraction,
  metadataNeedsExtraction,
} from './document-metadata-extraction.ts';

describe('channelHasMetadataExtraction', () => {
  it('returns true when metadata extraction agent is configured', () => {
    expect(
      channelHasMetadataExtraction({
        metadataExtractionAgentDefId: 'agent-1',
        metadataExtractionModelId: null,
      }),
    ).toBe(true);
  });

  it('returns true for legacy model-only configuration', () => {
    expect(
      channelHasMetadataExtraction({
        metadataExtractionAgentDefId: null,
        metadataExtractionModelId: 'model-1',
      }),
    ).toBe(true);
  });

  it('returns false when neither agent nor model is configured', () => {
    expect(
      channelHasMetadataExtraction({
        metadataExtractionAgentDefId: null,
        metadataExtractionModelId: null,
      }),
    ).toBe(false);
  });
});

describe('metadataNeedsExtraction', () => {
  it('returns false when extraction is not configured', () => {
    expect(metadataNeedsExtraction({}, false)).toBe(false);
  });

  it('returns true when extraction is configured and metadata is empty', () => {
    expect(metadataNeedsExtraction({}, true)).toBe(true);
    expect(metadataNeedsExtraction({ author: '', tags: [] }, true)).toBe(true);
  });

  it('returns false when metadata already has values', () => {
    expect(metadataNeedsExtraction({ author: 'Ada' }, true)).toBe(false);
  });
});
