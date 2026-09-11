import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Copy, KeyRound, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  createUserApiKey,
  listUserApiKeys,
  revokeUserApiKey,
  type UserApiKeyItem,
} from '../api/userApiKeys.ts';
import { iconProps } from '../components/icons/icon-props.ts';
import { TransientNotice } from '../components/TransientNotice.tsx';
import { useTransientNotice } from '../hooks/useTransientNotice.ts';
import { AdminPageDescription, AdminPageTitle } from '../layouts/AppLayout.tsx';
import { HOME_PATH } from '../shared/app-nav.ts';

export function ApiKeysSettingsPage() {
  const [items, setItems] = useState<UserApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);
  const { notice: transientNotice, showNotice } = useTransientNotice(2500);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listUserApiKeys());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreateKey() {
    setBusy(true);
    setError('');
    setNewKeyPlaintext(null);
    try {
      const created = await createUserApiKey();
      setNewKeyPlaintext(created.key);
      await load();
      showNotice('API key created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id: string) {
    if (!window.confirm('Revoke this API key? Scripts using it will stop working.')) return;
    setBusy(true);
    setError('');
    try {
      await revokeUserApiKey(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showNotice('Copied.');
    } catch {
      // ignore
    }
  }

  return (
    <main className="admin-page">
      <TransientNotice message={transientNotice} />
      <Link to={HOME_PATH} className="document-detail-back">
        <ArrowLeft {...iconProps({ size: 16 })} aria-hidden />
        Back to Home
      </Link>
      <header className="admin-header">
        <AdminPageTitle main="API" accent="Keys" />
        <AdminPageDescription>
          Generate personal API keys for Cursor, scripts, and external integrations. Keys are shown
          once at creation; only a hash is stored on the server.
        </AdminPageDescription>
      </header>

      {error && <p className="error inline">{error}</p>}

      <section className="admin-card api-keys-section">
        <h2 className="admin-section-title">
          <KeyRound {...iconProps({ size: 18 })} aria-hidden />
          Your API keys
        </h2>
        <p className="admin-form-hint">
          Use <code>Authorization: Bearer okf_…</code> or <code>OPENKMS_API_KEY</code> in Cursor,
          MCP clients, and CI. Each key maps to your account and respects KB access control.
        </p>

        <div className="admin-toolbar">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void onCreateKey()}>
            Generate API key
          </button>
        </div>

        {newKeyPlaintext && (
          <div className="api-key-reveal admin-card nested">
            <p className="admin-form-hint">
              Copy this key now. You will not be able to see it again.
            </p>
            <div className="api-key-reveal-row">
              <code className="api-key-reveal-value">{newKeyPlaintext}</code>
              <button
                type="button"
                className="btn-icon api-key-copy-btn"
                title="Copy API key"
                aria-label="Copy API key"
                onClick={() => void copyText(newKeyPlaintext)}
              >
                <Copy {...iconProps()} aria-hidden />
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="admin-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="admin-muted">No active API keys.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>
                      <code>{item.key_prefix}…</code>
                    </td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                    <td>
                      {item.last_used_at ? new Date(item.last_used_at).toLocaleString() : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Revoke"
                        aria-label="Revoke API key"
                        disabled={busy}
                        onClick={() => void onRevoke(item.id)}
                      >
                        <Trash2 {...iconProps()} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
