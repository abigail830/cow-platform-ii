import { useEffect, useState } from 'react';
import type { AdminRole, AdminUser } from '../api/users.ts';

type UserRolesFormProps = {
  user: AdminUser;
  roles: AdminRole[];
  onSubmit: (roleIds: string[]) => Promise<void>;
  onCancel: () => void;
};

export function UserRolesForm({ user, roles, onSubmit, onCancel }: UserRolesFormProps) {
  const [roleIds, setRoleIds] = useState<string[]>(user.roles.map((role) => role.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setRoleIds(user.roles.map((role) => role.id));
    setError('');
  }, [user]);

  function toggleRole(roleId: string) {
    setRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(roleIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update roles');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card model-config-form" onClick={(event) => event.stopPropagation()}>
        <h2>Edit Roles</h2>
        <p className="admin-form-hint">
          Assign one or more roles to <strong>{user.email}</strong>.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
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
              {busy ? 'Saving…' : 'Save roles'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
