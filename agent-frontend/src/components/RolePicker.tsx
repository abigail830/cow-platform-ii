import type { AdminRole } from '../api/users.ts';

type RolePickerProps = {
  roles: AdminRole[];
  selectedIds: string[];
  onChange: (roleIds: string[]) => void;
  disabled?: boolean;
};

export function RolePicker({ roles, selectedIds, onChange, disabled = false }: RolePickerProps) {
  function toggleRole(roleId: string) {
    if (disabled) return;
    onChange(
      selectedIds.includes(roleId)
        ? selectedIds.filter((id) => id !== roleId)
        : [...selectedIds, roleId],
    );
  }

  return (
    <div className="role-picker" role="group" aria-label="Roles">
      {roles.map((role) => {
        const selected = selectedIds.includes(role.id);
        return (
          <label
            key={role.id}
            className={`role-picker-card${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
          >
            <input
              type="checkbox"
              className="brand-checkbox"
              checked={selected}
              disabled={disabled}
              onChange={() => toggleRole(role.id)}
            />
            <span className="role-picker-card-body">
              <span className="role-picker-card-title">{role.label}</span>
              {role.description ? (
                <span className="role-picker-card-desc">{role.description}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
