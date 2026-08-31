import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  breadcrumbSegments,
  createStorageFolder,
  folderLabel,
  formatBytes,
  getStorageInfo,
  listStorageObjects,
  moveStorageItems,
  objectLabel,
  type MoveItem,
  type StorageFolder,
  type StorageObject,
} from '../api/storage.ts';
import { File, Folder } from 'lucide-react';
import { MoveItemsModal } from '../components/MoveItemsModal.tsx';
import { NewFolderModal } from '../components/NewFolderModal.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { AdminPageDescription, AdminPageTitle, useAppOutletContext } from '../layouts/AppLayout.tsx';
import { getNavPage } from '../shared/admin-nav.ts';
import { hasPermission } from '../shared/permissions.ts';

const PAGE = getNavPage('/admin/storage')!;

type Row =
  | { kind: 'folder'; prefix: string; name: string }
  | { kind: 'object'; key: string; name: string; size: number; lastModified: string | null };

function selectionId(row: Row): string {
  return row.kind === 'folder' ? `folder:${row.prefix}` : `object:${row.key}`;
}

function rowToMoveItem(row: Row): MoveItem {
  return row.kind === 'folder'
    ? { type: 'prefix', key: row.prefix }
    : { type: 'object', key: row.key };
}

function formatModified(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function ObjectStoragePage() {
  const { user } = useAppOutletContext();
  const canWrite = useMemo(() => hasPermission(user, 'platform-basic:storage', 'write'), [user]);

  const [bucket, setBucket] = useState('');
  const [storageEnabled, setStorageEnabled] = useState<boolean | null>(null);
  const [prefix, setPrefix] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);

  const breadcrumbs = useMemo(() => breadcrumbSegments(prefix), [prefix]);

  const mapResponseToRows = useCallback((folders: StorageFolder[], objects: StorageObject[]): Row[] => {
    const folderRows: Row[] = folders.map((folder) => ({
      kind: 'folder',
      prefix: folder.prefix,
      name: folderLabel(folder.prefix),
    }));
    const objectRows: Row[] = objects.map((object) => ({
      kind: 'object',
      key: object.key,
      name: objectLabel(object.key),
      size: object.size,
      lastModified: object.last_modified,
    }));
    return [...folderRows, ...objectRows];
  }, []);

  const loadListing = useCallback(
    async (options?: { append?: boolean; token?: string | null }) => {
      const append = options?.append ?? false;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');

      try {
        const data = await listStorageObjects({
          prefix,
          continuationToken: options?.token ?? undefined,
        });
        const nextRows = mapResponseToRows(data.folders, data.objects);
        setRows((current) => (append ? [...current, ...nextRows] : nextRows));
        setContinuationToken(data.next_continuation_token);
        setTruncated(data.truncated);
        if (!append) setSelected(new Set());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load objects';
        if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
          setForbidden(true);
        } else {
          setError(message);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mapResponseToRows, prefix],
  );

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const info = await getStorageInfo();
      setBucket(info.bucket);
      setStorageEnabled(info.storage_enabled);
      if (!info.storage_enabled) {
        setRows([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load storage';
      if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
        setForbidden(true);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (storageEnabled) {
      void loadListing();
    }
  }, [prefix, storageEnabled, loadListing]);

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map(selectionId)));
  }

  const selectedRows = rows.filter((row) => selected.has(selectionId(row)));

  async function handleCreateFolder(name: string) {
    await createStorageFolder(prefix, name);
    setFolderModalOpen(false);
    await loadListing();
  }

  async function handleMove(destinationPrefix: string) {
    const result = await moveStorageItems({
      items: selectedRows.map(rowToMoveItem),
      destinationPrefix,
    });
    setMoveModalOpen(false);
    if (result.errors.length > 0) {
      setError(`Moved ${result.moved_count}, skipped ${result.skipped_count}. ${result.errors.join('; ')}`);
    }
    await loadListing();
  }

  if (forbidden) {
    return <Navigate to="/agents/playground" replace />;
  }

  return (
    <>
      <main className="admin-page">
        <header className="admin-header">
          <AdminPageTitle main={PAGE.titleMain} accent={PAGE.titleAccent} />
          <AdminPageDescription>
            {storageEnabled === false
              ? 'Object storage is not configured. Set S3-compatible credentials in the server environment.'
              : `Bucket: ${bucket || '—'}. Lists and moves run in your browser via presigned OSS URLs (works on Vercel). Ensure bucket CORS allows GET, PUT, and DELETE from this origin.`}
          </AdminPageDescription>
        </header>

        {storageEnabled && (
          <>
            <div className="admin-toolbar">
              <div className="admin-toolbar-left">
                {canWrite && (
                  <button type="button" className="btn-secondary" onClick={() => setFolderModalOpen(true)}>
                    New folder…
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={() => void loadListing()} disabled={loading}>
                  Refresh
                </button>
                {canWrite && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={selected.size === 0}
                    onClick={() => setMoveModalOpen(true)}
                  >
                    Move selected…
                  </button>
                )}
              </div>
            </div>

            <nav className="storage-breadcrumbs" aria-label="Storage path">
              <button type="button" className="storage-crumb" onClick={() => setPrefix('')}>
                {bucket || 'bucket'}
              </button>
              {breadcrumbs.map((segment) => (
                <span key={segment.prefix} className="storage-crumb-wrap">
                  <span className="storage-crumb-sep">/</span>
                  <button type="button" className="storage-crumb" onClick={() => setPrefix(segment.prefix)}>
                    {segment.label}
                  </button>
                </span>
              ))}
            </nav>
          </>
        )}

        {error && <p className="error inline">{error}</p>}

        {storageEnabled && (
          <div className="admin-table-wrap">
            <table className="admin-table storage-table">
            <thead>
              <tr>
                <th className="storage-col-check">
                  <input
                    type="checkbox"
                    className="brand-checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    This folder is empty.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const id = selectionId(row);
                  return (
                    <tr key={id}>
                      <td>
                        <input
                          type="checkbox"
                          className="brand-checkbox"
                          checked={selected.has(id)}
                          onChange={() => toggleRow(id)}
                          aria-label={`Select ${row.name}`}
                        />
                      </td>
                      <td>
                        {row.kind === 'folder' ? (
                          <button
                            type="button"
                            className="storage-name-link"
                            onClick={() => setPrefix(row.prefix)}
                          >
                            <Folder {...iconProps({ className: 'storage-icon' })} />
                            {row.name}
                          </button>
                        ) : (
                          <span className="storage-name-static">
                            <File {...iconProps({ className: 'storage-icon' })} />
                            {row.name}
                          </span>
                        )}
                      </td>
                      <td>{row.kind === 'folder' ? 'Folder' : 'Object'}</td>
                      <td>{row.kind === 'folder' ? '—' : formatBytes(row.size)}</td>
                      <td>{row.kind === 'folder' ? '—' : formatModified(row.lastModified)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {storageEnabled && truncated && continuationToken && (
        <div className="storage-load-more">
          <button
            type="button"
            className="btn-secondary"
            disabled={loadingMore}
            onClick={() => void loadListing({ append: true, token: continuationToken })}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
      </main>

      {folderModalOpen && (
        <NewFolderModal onCancel={() => setFolderModalOpen(false)} onSubmit={handleCreateFolder} />
      )}
      {moveModalOpen && (
        <MoveItemsModal
          count={selectedRows.length}
          onCancel={() => setMoveModalOpen(false)}
          onSubmit={handleMove}
        />
      )}
    </>
  );
}
