import { File, Paperclip } from 'lucide-react';
import { iconProps } from './icons/icon-props.ts';

export type MindmapSheetMeta = {
  name: string;
  root_title: string;
  topic_count: number;
};

export type MindmapAttachmentMeta = {
  path: string;
  size_bytes: number;
};

export type MindmapParsingResult = {
  document_kind?: string;
  format?: string;
  page_count?: number;
  parser?: string;
  sheets?: MindmapSheetMeta[];
  attachments?: MindmapAttachmentMeta[];
};

export function parseMindmapParsingResult(
  parsingResult: Record<string, unknown> | null | undefined,
): MindmapParsingResult | null {
  if (!parsingResult || parsingResult.document_kind !== 'mindmap') {
    return null;
  }
  return parsingResult as MindmapParsingResult;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

type MindmapMetadataPanelProps = {
  parsingResult: MindmapParsingResult;
  onSelectSheet?: (sheetIndex: number) => void;
  activeSheetIndex?: number | null;
};

export function MindmapMetadataPanel({
  parsingResult,
  onSelectSheet,
  activeSheetIndex = null,
}: MindmapMetadataPanelProps) {
  const sheets = parsingResult.sheets ?? [];
  const attachments = parsingResult.attachments ?? [];

  return (
    <section className="mindmap-metadata-panel" aria-label="Mind map metadata">
      <div className="mindmap-metadata-header">
        <h3 className="mindmap-metadata-title">Mind map</h3>
        <div className="mindmap-metadata-badges">
          {parsingResult.format && (
            <span className="mindmap-metadata-badge">{parsingResult.format}</span>
          )}
          {typeof parsingResult.page_count === 'number' && (
            <span className="mindmap-metadata-badge">
              {parsingResult.page_count} sheet{parsingResult.page_count === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {sheets.length > 0 && (
        <div className="mindmap-metadata-section">
          <h4 className="mindmap-metadata-section-title">Sheets</h4>
          <ul className="mindmap-sheet-list">
            {sheets.map((sheet, index) => {
              const interactive = typeof onSelectSheet === 'function';
              const isActive = activeSheetIndex === index;
              const content = (
                <>
                  <span className="mindmap-sheet-name">
                    <File {...iconProps({ size: 14 })} aria-hidden />
                    {sheet.name}
                  </span>
                  <span className="mindmap-sheet-meta">
                    Root: {sheet.root_title} · {sheet.topic_count} topic
                    {sheet.topic_count === 1 ? '' : 's'}
                  </span>
                </>
              );
              return (
                <li key={`${sheet.name}-${index}`} className="mindmap-sheet-item">
                  {interactive ? (
                    <button
                      type="button"
                      className={`mindmap-sheet-btn${isActive ? ' active' : ''}`}
                      onClick={() => onSelectSheet(index)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="mindmap-sheet-static">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mindmap-metadata-section">
          <h4 className="mindmap-metadata-section-title">Attachments</h4>
          <ul className="mindmap-attachment-list">
            {attachments.map((attachment) => (
              <li key={attachment.path} className="mindmap-attachment-item">
                <Paperclip {...iconProps({ size: 14 })} aria-hidden />
                <code className="mindmap-attachment-path">{attachment.path}</code>
                <span className="mindmap-attachment-size">{formatBytes(attachment.size_bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
