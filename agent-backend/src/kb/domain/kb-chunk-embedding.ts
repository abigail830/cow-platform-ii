export function decodeEmbeddingBase64(b64: string): number[] {
  const buf = Buffer.from(b64, 'base64');
  if (buf.byteLength % 4 !== 0) {
    throw new Error('Invalid embedding base64 length');
  }
  const floats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return [...floats];
}
