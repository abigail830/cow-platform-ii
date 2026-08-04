import { extensionFromFilename, isSessionFileImage } from '../storage/session-files/constants.ts';

export type ExtractResult = {
  text: string;
  warnings?: string[];
};

export async function extractSessionFileText(params: {
  fileId?: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<ExtractResult> {
  const ext = extensionFromFilename(params.filename);
  const warnings: string[] = [];

  if (ext === 'md' || ext === 'markdown' || ext === 'txt' || ext === 'csv') {
    return { text: params.bytes.toString('utf8') };
  }

  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: params.bytes });
    return { text: result.value, warnings: result.messages.length ? ['docx_extract_messages'] : undefined };
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(params.bytes, { type: 'buffer' });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (!csv.trim()) continue;
      parts.push(`## Sheet: ${sheetName}\n\n${csv}`);
    }
    return { text: parts.join('\n\n') || '(empty workbook)' };
  }

  if (ext === 'pptx') {
    try {
      const { OfficeParser } = await import('officeparser');
      const ast = await OfficeParser.parseOffice(params.bytes, { fileType: 'pptx' });
      return { text: ast.toText() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse pptx: ${message}`);
    }
  }

  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: params.bytes });
    try {
      const result = await parser.getText();
      const text = result.text?.trim() ?? '';
      if (!text) {
        warnings.push('scanned_pdf_no_text');
      }
      return { text, warnings: warnings.length ? warnings : undefined };
    } finally {
      await parser.destroy();
    }
  }

  if (isSessionFileImage(params.filename)) {
    if (!params.fileId?.trim()) {
      throw new Error('fileId is required for session image extraction');
    }
    const { extractSessionImageText } = await import('./session-file-image-extract.ts');
    return extractSessionImageText({
      fileId: params.fileId.trim(),
      filename: params.filename,
      mimeType: params.mimeType,
      bytes: params.bytes,
    });
  }

  throw new Error(`Unsupported session file extension: ${ext || '(none)'}`);
}
