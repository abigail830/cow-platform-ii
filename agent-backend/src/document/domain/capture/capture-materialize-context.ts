export function parseCaptureMaterializeContext(
  metadata: Record<string, unknown>,
  firstSegmentFileHash?: string | null,
) {
  const materializeForIndex = metadata.materialize_for_index === true;
  const indexDocumentId =
    typeof metadata.index_document_id === 'string' ? metadata.index_document_id.trim() : undefined;
  const indexContent =
    typeof metadata.index_content === 'object' &&
    metadata.index_content !== null &&
    !Array.isArray(metadata.index_content)
      ? (metadata.index_content as Record<string, unknown>)
      : { audio: 'combined' };
  const indexFileHash =
    typeof metadata.index_file_hash === 'string' && metadata.index_file_hash.trim()
      ? metadata.index_file_hash.trim()
      : firstSegmentFileHash?.trim() || undefined;
  return {
    materialize_for_index: materializeForIndex,
    index_document_id: indexDocumentId,
    index_content: indexContent,
    index_file_hash: indexFileHash,
  };
}
