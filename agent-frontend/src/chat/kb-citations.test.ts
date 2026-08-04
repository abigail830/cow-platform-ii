import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildKbCitationHrefResolver,
  extractKbCitations,
  rewriteKbCitationMarkdown,
} from './kb-citations.ts';

describe('extractKbCitations', () => {
  it('reads preview_url from hybrid_search tool output', () => {
    const citations = extractKbCitations([
      {
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolCallId: 't1',
            toolName: 'mcp__hybrid-search__hybrid_search',
            state: 'output-available',
            input: {},
            output: {
              results: [
                {
                  source: {
                    document_name: 'timeline-of-profit-repatriation-from-Vietnam.pdf',
                    preview_url:
                      '/knowledge/documents/doc-1?view=original&page=5',
                  },
                },
              ],
            },
          },
        ],
      } as never,
    ]);

    assert.equal(citations.length, 1);
    assert.equal(citations[0]?.previewUrl, '/knowledge/documents/doc-1?view=original&page=5');
  });
});

describe('rewriteKbCitationMarkdown', () => {
  const citations = [
    {
      documentName: 'timeline-of-profit-repatriation-from-Vietnam.pdf',
      previewUrl: '/knowledge/documents/doc-1?view=original&page=5',
    },
  ];

  it('rewrites placeholder hrefs using link label', () => {
    const input =
      'See [timeline-of-profit-repatriation-from-Vietnam.pdf](preview_url_placeholder)';
    const output = rewriteKbCitationMarkdown(input, citations);
    assert.match(output, /\/knowledge\/documents\/doc-1\?view=original&page=5/);
  });

  it('rewrites filename-only hrefs', () => {
    const input =
      '[timeline-of-profit-repatriation-from-Vietnam.pdf](timeline-of-profit-repatriation-from-Vietnam.pdf)';
    const output = rewriteKbCitationMarkdown(input, citations);
    assert.match(output, /\/knowledge\/documents\/doc-1\?view=original&page=5/);
  });
});

describe('buildKbCitationHrefResolver', () => {
  it('resolves placeholder href with label at render time', () => {
    const resolve = buildKbCitationHrefResolver([
      {
        documentName: 'Policy.pdf',
        previewUrl: '/knowledge/documents/doc-2?view=original&page=3',
      },
    ]);
    assert.equal(
      resolve('preview_url_placeholder', 'Policy.pdf'),
      '/knowledge/documents/doc-2?view=original&page=3',
    );
  });
});
