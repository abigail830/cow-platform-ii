import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ResourceAccessPanel, type ResourceAccessPanelHandle } from './ResourceAccessPanel.tsx';
import { iconProps } from './icons/icon-props.ts';
import type { ResourceType } from '../api/resourceAccess.ts';

type ResourceSharingModalProps = {
  resourceType: ResourceType;
  resourceId: string;
  resourceLabel: string;
  inheritHint?: string;
  onClose: () => void;
};

export function ResourceSharingModal({
  resourceType,
  resourceId,
  resourceLabel,
  inheritHint,
  onClose,
}: ResourceSharingModalProps) {
  const panelRef = useRef<ResourceAccessPanelHandle>(null);
  const [busy, setBusy] = useState(false);
  const [canManage, setCanManage] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true);
    try {
      const saved = await panelRef.current?.save();
      if (saved) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card resource-sharing-modal" onClick={(event) => event.stopPropagation()}>
        <div className="resource-sharing-modal-header">
          <h2>Sharing &amp; access</h2>
          <button type="button" className="icon-btn" title="Close" onClick={onClose}>
            <X {...iconProps()} />
          </button>
        </div>
        <form className="resource-sharing-modal-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="resource-sharing-modal-body">
            <ResourceAccessPanel
              ref={panelRef}
              showFooter={false}
              resourceType={resourceType}
              resourceId={resourceId}
              resourceLabel={resourceLabel}
              inheritHint={inheritHint}
              onCapabilitiesChange={({ canManage: manage }) => setCanManage(manage)}
            />
          </div>
          <div className="modal-actions resource-sharing-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !canManage}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
