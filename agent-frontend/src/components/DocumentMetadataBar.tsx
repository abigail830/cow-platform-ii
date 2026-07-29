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

function metadataField(
  metadata: Record<string, unknown>,
  key: string,
): { label: string; value: string } {
  return {
    label: METADATA_LABELS[key] ?? key,
    value: formatMetadataValue(metadata[key]),
  };
}

type DocumentMetadataBarProps = {
  metadata: Record<string, unknown>;
};

export function DocumentMetadataBar({ metadata }: DocumentMetadataBarProps) {
  const abstract = metadataField(metadata, 'abstract');
  const author = metadataField(metadata, 'author');
  const publishDate = metadataField(metadata, 'publish_date');
  const source = metadataField(metadata, 'source');
  const categories = metadataField(metadata, 'categories');
  const tags = metadataField(metadata, 'tags');

  const hasAnyValue = [abstract, author, publishDate, source, categories, tags].some(
    (field) => field.value !== '—',
  );

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

      <div className="document-metadata-row document-metadata-row-fields">
        <div className="document-metadata-item">
          <span className="document-metadata-key">{author.label}</span>
          <span className="document-metadata-value" title={author.value}>
            {author.value}
          </span>
        </div>
        <div className="document-metadata-item">
          <span className="document-metadata-key">{publishDate.label}</span>
          <span className="document-metadata-value" title={publishDate.value}>
            {publishDate.value}
          </span>
        </div>
        <div className="document-metadata-item">
          <span className="document-metadata-key">{source.label}</span>
          <span className="document-metadata-value" title={source.value}>
            {source.value}
          </span>
        </div>
        <div className="document-metadata-item">
          <span className="document-metadata-key">{categories.label}</span>
          <span className="document-metadata-value" title={categories.value}>
            {categories.value}
          </span>
        </div>
      </div>

      <div className="document-metadata-row document-metadata-row-tags">
        <span className="document-metadata-key">{tags.label}</span>
        <div className="document-metadata-tags-value" title={tags.value}>
          {tags.value}
        </div>
      </div>
    </section>
  );
}
