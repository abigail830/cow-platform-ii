const METADATA_LABELS: Record<string, string> = {
  abstract: 'Abstract',
  author: 'Author',
  publish_date: 'Publish date',
  source: 'Source',
  tags: 'Tags',
  categories: 'Categories',
};

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function metadataListValues(metadata: Record<string, unknown>, key: string): string[] {
  const raw = metadata[key];
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function metadataField(
  metadata: Record<string, unknown>,
  key: string,
): { label: string; value: string } {
  return {
    label: METADATA_LABELS[key] ?? key,
    value: formatMetadataValue(metadata[key]),
  };
}

function MetadataBagels({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="document-metadata-value-muted">—</span>;
  }

  return (
    <div className="document-metadata-bagels">
      {items.map((item) => (
        <span key={item} className="metadata-bagel" title={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

type DocumentMetadataBarProps = {
  metadata: Record<string, unknown>;
};

export function DocumentMetadataBar({ metadata }: DocumentMetadataBarProps) {
  const abstract = metadataField(metadata, 'abstract');
  const author = metadataField(metadata, 'author');
  const publishDate = metadataField(metadata, 'publish_date');
  const source = metadataField(metadata, 'source');
  const tagItems = metadataListValues(metadata, 'tags');
  const categoryItems = metadataListValues(metadata, 'categories');

  const hasAnyValue =
    abstract.value !== '—' ||
    author.value !== '—' ||
    publishDate.value !== '—' ||
    source.value !== '—' ||
    tagItems.length > 0 ||
    categoryItems.length > 0;

  if (!hasAnyValue && Object.keys(metadata).length === 0) {
    return (
      <section className="document-metadata-panel document-metadata-panel-empty" aria-label="Document metadata">
        <span className="document-metadata-empty-label">Metadata</span>
        <span className="document-metadata-empty-hint">No extracted metadata yet.</span>
      </section>
    );
  }

  return (
    <section className="document-metadata-panel" aria-label="Document metadata">
      <div className="document-metadata-row document-metadata-row-abstract">
        <span className="document-metadata-key">{abstract.label}</span>
        <div className="document-metadata-abstract-value" title={abstract.value}>
          {abstract.value}
        </div>
      </div>

      <div className="document-metadata-row document-metadata-row-bagels">
        <div className="document-metadata-bagel-group">
          <span className="document-metadata-key">Tags</span>
          <MetadataBagels items={tagItems} />
        </div>
        <div className="document-metadata-bagel-group">
          <span className="document-metadata-key">Categories</span>
          <MetadataBagels items={categoryItems} />
        </div>
      </div>

      <div className="document-metadata-row document-metadata-row-inline">
        <div className="document-metadata-inline-item">
          <span className="document-metadata-key">{author.label}</span>
          <span className="document-metadata-inline-value" title={author.value}>
            {author.value}
          </span>
        </div>
        <div className="document-metadata-inline-item">
          <span className="document-metadata-key">{publishDate.label}</span>
          <span className="document-metadata-inline-value" title={publishDate.value}>
            {publishDate.value}
          </span>
        </div>
        <div className="document-metadata-inline-item">
          <span className="document-metadata-key">{source.label}</span>
          <span className="document-metadata-inline-value" title={source.value}>
            {source.value}
          </span>
        </div>
      </div>
    </section>
  );
}
