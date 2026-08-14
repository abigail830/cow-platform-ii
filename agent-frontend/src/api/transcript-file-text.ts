/** Extract plain text from transcript upload files in the browser (avoids server OSS reads on complete). */
export async function readTranscriptFileText(file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ext === 'md' || ext === 'markdown') {
    return file.text();
  }
  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }
  throw new Error('Unsupported transcript file type');
}
