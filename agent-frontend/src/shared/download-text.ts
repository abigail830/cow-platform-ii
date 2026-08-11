export function sanitizeDownloadFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^\.+/, '')
      .slice(0, 180) || 'download'
  );
}

export function withDownloadExtension(baseName: string, extension: string): string {
  const sanitized = sanitizeDownloadFilename(baseName);
  const ext = extension.startsWith('.') ? extension.slice(1) : extension;
  const withoutExt = sanitized.replace(/\.[^.]+$/, '');
  return `${withoutExt}.${ext}`;
}

export function downloadTextFile(content: string, filename: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
