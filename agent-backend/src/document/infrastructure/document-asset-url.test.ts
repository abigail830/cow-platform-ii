import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  assertAllowedBundleAssetPath,
  buildDocumentAssetTicketUrl,
  documentAssetApiPath,
  parsePlatformAssetUrl,
  platformAssetUrl,
  resolveDocumentAssetPathInput,
  signAssetTicket,
  verifyAssetTicket,
} from './document-asset-url.ts';

const DOC_ID = '550e8400-e29b-41d4-a716-446655440000';
const FILE_HASH = 'abc123def456';

describe('document-asset-url', () => {
  const prevJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-asset-tickets';
    delete process.env.ASSET_TICKET_SECRET;
  });

  afterEach(() => {
    if (prevJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevJwt;
  });

  it('builds canonical API paths and absolute URLs', () => {
    assert.equal(
      documentAssetApiPath(DOC_ID, 'markdown_out/foo.jpg'),
      `/api/knowledge/documents/${DOC_ID}/assets/markdown_out/foo.jpg`,
    );
    assert.equal(
      platformAssetUrl(DOC_ID, './markdown_out/foo.jpg', 'https://api.example.com'),
      `https://api.example.com/api/knowledge/documents/${DOC_ID}/assets/markdown_out/foo.jpg`,
    );
  });

  it('parses platform asset URLs', () => {
    const rel = `/api/knowledge/documents/${DOC_ID}/assets/markdown_out/foo.jpg`;
    assert.deepEqual(parsePlatformAssetUrl(rel), {
      documentId: DOC_ID,
      path: 'markdown_out/foo.jpg',
    });
    assert.deepEqual(parsePlatformAssetUrl(`https://cow-platform.vercel.app${rel}`), {
      documentId: DOC_ID,
      path: 'markdown_out/foo.jpg',
    });
    assert.equal(parsePlatformAssetUrl('markdown_out/foo.jpg'), null);
  });

  it('validates bundle asset paths', () => {
    assert.equal(
      assertAllowedBundleAssetPath('markdown_out/foo.jpg', FILE_HASH),
      'markdown_out/foo.jpg',
    );
    assert.throws(() => assertAllowedBundleAssetPath('../secret.pdf', FILE_HASH), /Invalid asset path/);
    assert.throws(() => assertAllowedBundleAssetPath('result.json', FILE_HASH), /not an allowed bundle image/);
  });

  it('signs and verifies asset tickets', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const sig = signAssetTicket(DOC_ID, 'markdown_out/foo.jpg', exp);
    assert.equal(
      verifyAssetTicket(DOC_ID, 'markdown_out/foo.jpg', String(exp), sig),
      true,
    );
    assert.equal(
      verifyAssetTicket(DOC_ID, 'markdown_out/foo.jpg', String(exp - 1200), sig),
      false,
    );
    assert.equal(
      verifyAssetTicket(DOC_ID, 'markdown_out/other.jpg', String(exp), sig),
      false,
    );
  });

  it('resolves MCP path input from relative or platform asset URL', () => {
    assert.equal(
      resolveDocumentAssetPathInput(DOC_ID, 'markdown_out/foo.jpg'),
      'markdown_out/foo.jpg',
    );
    const url = platformAssetUrl(DOC_ID, 'markdown_out/foo.jpg', 'https://api.example.com');
    assert.equal(resolveDocumentAssetPathInput(DOC_ID, url), 'markdown_out/foo.jpg');
    assert.throws(
      () =>
        resolveDocumentAssetPathInput(
          DOC_ID,
          platformAssetUrl('00000000-0000-0000-0000-000000000001', 'markdown_out/foo.jpg'),
        ),
      /does not match/,
    );
  });

  it('builds ticket URLs with exp and sig query params', () => {
    const now = Math.floor(Date.now() / 1000);
    const ticket = buildDocumentAssetTicketUrl(DOC_ID, 'markdown_out/foo.jpg', now);
    assert.match(ticket.url, /^\/api\/knowledge\/documents\/.+\/assets\/markdown_out\/foo\.jpg\?exp=\d+&sig=[a-f0-9]{64}$/);
    const exp = ticket.url.match(/exp=(\d+)/)?.[1];
    const sig = ticket.url.match(/sig=([a-f0-9]{64})/)?.[1];
    assert.ok(exp && sig);
    assert.equal(verifyAssetTicket(DOC_ID, 'markdown_out/foo.jpg', exp, sig), true);
  });
});
