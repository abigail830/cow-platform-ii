import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import {
  DEFAULT_ASSET_IMAGE_MAX_DIMENSION,
  preprocessDocumentAssetImage,
} from './preprocess-document-asset-image.ts';

describe('preprocessDocumentAssetImage', () => {
  it('resizes large images down to max_dimension', async () => {
    const input = await sharp({
      create: {
        width: 2000,
        height: 1200,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await preprocessDocumentAssetImage(input, { maxDimension: 512 });
    assert.equal(result.width <= 512, true);
    assert.equal(result.height <= 512, true);
    assert.equal(result.originalWidth, 2000);
    assert.match(result.dataUri, /^data:image\/jpeg;base64,/);
    assert.ok(result.bytes > 0);
  });

  it('keeps small images without upscaling', async () => {
    const input = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await preprocessDocumentAssetImage(input, {
      maxDimension: DEFAULT_ASSET_IMAGE_MAX_DIMENSION,
    });
    assert.equal(result.width, 200);
    assert.equal(result.height, 100);
    assert.equal(result.mimeType, 'image/png');
  });
});
