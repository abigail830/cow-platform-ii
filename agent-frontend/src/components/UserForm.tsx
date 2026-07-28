import { useEffect, useState } from 'react';
import type { AdminRole } from '../api/users.ts';

type UserFormProps = {
  roles: AdminRole[];
  onSubmit: (input: {
    email: string;
    displayName?: string;
    password: string;
    roleIds: string[];
  }) => Promise<void>;
  onCancel: () => void;
};

export function UserForm({ roles, onSubmit, onCancel }: UserFormProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const adminRole = roles.find((role) => role.key === 'admin');
    if (adminRole) setRoleIds([adminRole.id]);
  }, [roles]);

  function toggleRole(roleId: string) {
    setRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        password,
        roleIds,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>Add User</h2>
        <p className="admin-form-hint">Create a local account that signs in with email and password.</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-wide">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label className="form-field form-field-wide">
              <span>Display name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="form-field form-field-wide">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </label>
            <div className="form-field form-field-wide">
              <span>Roles</span>
              <div className="role-picker">
                {roles.map((role) => (
                  <label key={role.id} className="role-picker-option">
                    <input
                      type="checkbox"
                      className="brand-checkbox"
                      checked={roleIds.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                    />
                    <span>
                      {role.label}
                      {role.description ? ` — ${role.description}` : ''}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
