import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Plus, Search, Trash2, UserRound } from 'lucide-react';
import {
  fetchResourceAccess,
  lookupUsersForSharing,
  normalizeResourceFlags,
  resourcePermissionLabel,
  saveResourceAccess,
  transferResourceOwner,
  type ResourceAccessGrantRow,
  type ResourceAccessSettings,
  type ResourceAccessUser,
  type ResourcePermissionFlags,
  type ResourceType,
} from '../api/resourceAccess.ts';
import { iconProps } from './icons/icon-props.ts';

type DraftUserGrant = ResourceAccessGrantRow & { draft?: boolean };

type ResourceAccessPanelProps = {
  resourceType: ResourceType;
  resourceId: string;
  resourceLabel: string;
  inheritHint?: string;
  /** When false, parent provides Cancel / Save actions (e.g. channel settings modal). */
  showFooter?: boolean;
  onCapabilitiesChange?: (caps: { canManage: boolean }) => void;
};

export type ResourceAccessPanelHandle = {
  save: () => Promise<boolean>;
  canManage: boolean;
};

function ownerLabel(user: ResourceAccessUser | null): string {
  if (!user) return 'Unknown';
  return user.displayName?.trim() || user.email;
}

function PermCheckbox({
  checked,
  disabled,
  onChange,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <label className="role-perm-check" title={title}>
      <input
        type="checkbox"
        className="brand-checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function UserSearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="admin-search resource-access-search">
      <Search {...iconProps()} aria-hidden />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function UserSearchResults({
  searching,
  results,
  emptyLabel,
  onSelect,
  isDisabled,
}: {
  searching: boolean;
  results: ResourceAccessUser[];
  emptyLabel: string;
  onSelect: (user: ResourceAccessUser) => void;
  isDisabled: (user: ResourceAccessUser) => boolean;
}) {
  if (searching) {
    return <p className="admin-form-hint resource-access-search-hint">Searching…</p>;
  }
  if (results.length === 0) {
    return <p className="admin-form-hint resource-access-search-hint">{emptyLabel}</p>;
  }
  return (
    <ul className="resource-access-search-results" role="listbox">
      {results.map((user) => {
        const disabled = isDisabled(user);
        return (
          <li key={user.id}>
            <button
              type="button"
              className="resource-access-search-item"
              disabled={disabled}
              onClick={() => onSelect(user)}
            >
              <UserRound {...iconProps({ size: 14 })} aria-hidden />
              <span className="resource-access-search-item-label">{ownerLabel(user)}</span>
              <span className="resource-access-search-item-email">{user.email}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function useDebouncedUserSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<ResourceAccessUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!enabled || !query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void lookupUsersForSharing(query)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, query]);

  return { results, searching };
}

export const ResourceAccessPanel = forwardRef<ResourceAccessPanelHandle, ResourceAccessPanelProps>(
  function ResourceAccessPanel(
    {
      resourceType,
      resourceId,
      resourceLabel,
      inheritHint,
      showFooter = true,
      onCapabilitiesChange,
    },
    ref,
  ) {
  const [settings, setSettings] = useState<ResourceAccessSettings | null>(null);
  const [others, setOthers] = useState<ResourcePermissionFlags>({ read: false, write: false, manage: false });
  const [users, setUsers] = useState<DraftUserGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addUserQuery, setAddUserQuery] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferQuery, setTransferQuery] = useState('');
  const [transferTarget, setTransferTarget] = useState<ResourceAccessUser | null>(null);

  const canManage = settings?.my_access.manage ?? false;
  const existingUserIds = useMemo(() => new Set(users.map((grant) => grant.userId)), [users]);

  const addUserSearch = useDebouncedUserSearch(addUserQuery, canManage && addUserQuery.trim().length > 0);
  const transferSearch = useDebouncedUserSearch(transferQuery, canManage && transferOpen && transferQuery.trim().length > 0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void fetchResourceAccess(resourceType, resourceId)
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setOthers(data.others);
        setUsers(data.users);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sharing settings');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceId, resourceType]);

  useEffect(() => {
    if (!loading && settings) {
      onCapabilitiesChange?.({ canManage: settings.my_access.manage });
    }
  }, [loading, onCapabilitiesChange, settings]);

  function updateOthers(level: keyof ResourcePermissionFlags, checked: boolean) {
    setOthers((prev) => normalizeResourceFlags({ ...prev, [level]: checked }));
  }

  function updateUserGrant(userId: string, level: keyof ResourcePermissionFlags, checked: boolean) {
    setUsers((prev) =>
      prev.map((grant) =>
        grant.userId === userId
          ? { ...grant, ...normalizeResourceFlags({ ...grant, [level]: checked }) }
          : grant,
      ),
    );
  }

  function addUser(user: ResourceAccessUser) {
    if (existingUserIds.has(user.id) || settings?.owner?.id === user.id) return;
    setUsers((prev) => [
      ...prev,
      {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        read: true,
        write: false,
        manage: false,
        draft: true,
      },
    ]);
    setAddUserQuery('');
  }

  function openTransfer() {
    setTransferOpen(true);
    setTransferQuery('');
    setTransferTarget(null);
    setError('');
  }

  function closeTransfer() {
    setTransferOpen(false);
    setTransferQuery('');
    setTransferTarget(null);
  }

  function isUserUnavailable(user: ResourceAccessUser): boolean {
    return existingUserIds.has(user.id) || settings?.owner?.id === user.id;
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError('');
    try {
      const updated = await saveResourceAccess(resourceType, resourceId, {
        others,
        users: users.map((grant) => ({
          userId: grant.userId,
          read: grant.read,
          write: grant.write,
          manage: grant.manage,
        })),
      });
      setSettings(updated);
      setOthers(updated.others);
      setUsers(updated.users);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sharing settings');
      return false;
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      save: handleSave,
      canManage,
    }),
    [canManage, others, users, resourceId, resourceType],
  );

  async function handleTransferOwner() {
    if (!transferTarget) return;
    setSaving(true);
    setError('');
    try {
      const updated = await transferResourceOwner(resourceType, resourceId, transferTarget.id);
      setSettings(updated);
      setOthers(updated.others);
      setUsers(updated.users);
      closeTransfer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer owner');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="admin-form-hint">Loading sharing settings…</p>;
  }

  if (!settings) {
    return <p className="error">{error || 'Sharing settings unavailable.'}</p>;
  }

  return (
    <div className="resource-access-panel">
      <p className="admin-form-hint resource-access-intro">
        Control who can read, edit, and manage <strong>{resourceLabel}</strong>.
        {inheritHint ? ` ${inheritHint}` : ''}
      </p>
      <p className="resource-access-my-access">
        Your access: <strong>{resourcePermissionLabel(settings.my_access)}</strong>
      </p>

      <div className="resource-access-table-wrap">
        <table className="admin-table role-perm-matrix resource-access-table">
          <thead>
            <tr>
              <th>Grantee</th>
              <th>Read</th>
              <th>Write</th>
              <th>Manage</th>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="resource-access-grantee">
                  <UserRound {...iconProps({ size: 16 })} aria-hidden />
                  <div>
                    <div className="resource-access-grantee-title">Owner</div>
                    <div className="resource-access-grantee-sub">{ownerLabel(settings.owner)}</div>
                  </div>
                </div>
              </td>
              <td><PermCheckbox checked disabled title="Owner has read" onChange={() => {}} /></td>
              <td><PermCheckbox checked disabled title="Owner has write" onChange={() => {}} /></td>
              <td><PermCheckbox checked disabled title="Owner has manage" onChange={() => {}} /></td>
              <td className="resource-access-row-action">
                {canManage && !transferOpen && (
                  <button type="button" className="btn-link" onClick={openTransfer}>
                    Transfer
                  </button>
                )}
              </td>
            </tr>

            <tr>
              <td>
                <div className="resource-access-grantee">
                  <div>
                    <div className="resource-access-grantee-title">Others</div>
                    <div className="resource-access-grantee-sub">Other signed-in users</div>
                  </div>
                </div>
              </td>
              <td>
                <PermCheckbox
                  checked={others.read}
                  disabled={!canManage}
                  title="Others can read"
                  onChange={(checked) => updateOthers('read', checked)}
                />
              </td>
              <td>
                <PermCheckbox
                  checked={others.write}
                  disabled={!canManage}
                  title="Others can write"
                  onChange={(checked) => updateOthers('write', checked)}
                />
              </td>
              <td>
                <PermCheckbox
                  checked={others.manage}
                  disabled={!canManage}
                  title="Others can manage"
                  onChange={(checked) => updateOthers('manage', checked)}
                />
              </td>
              <td />
            </tr>

            {users.map((grant) => (
              <tr key={grant.userId}>
                <td>
                  <div className="resource-access-grantee">
                    <div>
                      <div className="resource-access-grantee-title">
                        {grant.displayName?.trim() || grant.email}
                      </div>
                      <div className="resource-access-grantee-sub">{grant.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <PermCheckbox
                    checked={grant.read}
                    disabled={!canManage}
                    title="User can read"
                    onChange={(checked) => updateUserGrant(grant.userId, 'read', checked)}
                  />
                </td>
                <td>
                  <PermCheckbox
                    checked={grant.write}
                    disabled={!canManage}
                    title="User can write"
                    onChange={(checked) => updateUserGrant(grant.userId, 'write', checked)}
                  />
                </td>
                <td>
                  <PermCheckbox
                    checked={grant.manage}
                    disabled={!canManage}
                    title="User can manage"
                    onChange={(checked) => updateUserGrant(grant.userId, 'manage', checked)}
                  />
                </td>
                <td className="resource-access-row-action">
                  {canManage && (
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Remove user"
                      onClick={() => setUsers((prev) => prev.filter((row) => row.userId !== grant.userId))}
                    >
                      <Trash2 {...iconProps()} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && transferOpen && (
        <section className="resource-access-subpanel" aria-label="Transfer ownership">
          <div className="resource-access-subpanel-header">
            <h3>Transfer ownership</h3>
            <button type="button" className="btn-link" onClick={closeTransfer}>
              Cancel
            </button>
          </div>
          <p className="admin-form-hint">
            Search for a user to become the new owner. You will keep manage access only if explicitly granted.
          </p>
          <div className="resource-access-subpanel-body">
            <UserSearchField
              value={transferQuery}
              onChange={(value) => {
                setTransferQuery(value);
                setTransferTarget(null);
              }}
              placeholder="Search by email or name…"
              ariaLabel="Search users to transfer ownership"
            />
            {transferTarget ? (
              <div className="resource-access-selected-user">
                <UserRound {...iconProps({ size: 16 })} aria-hidden />
                <span>{ownerLabel(transferTarget)}</span>
                <button type="button" className="btn-link" onClick={() => setTransferTarget(null)}>
                  Clear
                </button>
              </div>
            ) : (
              transferQuery.trim().length > 0 && (
                <UserSearchResults
                  searching={transferSearch.searching}
                  results={transferSearch.results.filter((user) => user.id !== settings.owner?.id)}
                  emptyLabel="No users found."
                  isDisabled={isUserUnavailable}
                  onSelect={(user) => {
                    setTransferTarget(user);
                    setTransferQuery(ownerLabel(user));
                  }}
                />
              )
            )}
          </div>
          <div className="resource-access-subpanel-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={!transferTarget || saving}
              onClick={() => void handleTransferOwner()}
            >
              {saving ? 'Transferring…' : 'Confirm transfer'}
            </button>
          </div>
        </section>
      )}

      {canManage && (
        <section className="resource-access-add-user" aria-label="Add user">
          <div className="resource-access-add-user-header">
            <Plus {...iconProps({ size: 16 })} aria-hidden />
            <span>Add user</span>
          </div>
          <div className="resource-access-add-user-body">
            <UserSearchField
              value={addUserQuery}
              onChange={setAddUserQuery}
              placeholder="Search by email or name…"
              ariaLabel="Search users to add"
            />
            {addUserQuery.trim().length > 0 && (
              <UserSearchResults
                searching={addUserSearch.searching}
                results={addUserSearch.results}
                emptyLabel="No users found."
                isDisabled={isUserUnavailable}
                onSelect={addUser}
              />
            )}
          </div>
        </section>
      )}

      {error && <p className="error">{error}</p>}

      {showFooter && canManage && (
        <div className="resource-access-actions">
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save sharing settings'}
          </button>
        </div>
      )}
    </div>
  );
},
);
