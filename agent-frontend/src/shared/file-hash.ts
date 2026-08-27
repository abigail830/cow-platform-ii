export async function sha256HexFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return sha256HexFromBuffer(buffer);
}

export async function sha256HexFromText(text: string): Promise<string> {
  const buffer = new TextEncoder().encode(text);
  return sha256HexFromBuffer(buffer);
}

async function sha256HexFromBuffer(buffer: BufferSource): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
