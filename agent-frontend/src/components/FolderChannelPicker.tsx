import { DocumentChannelMultiSelect } from './DocumentChannelMultiSelect.tsx';
import type { DocumentChannel } from '../api/documentChannels.ts';

type FolderChannelPickerProps = {
  channels: DocumentChannel[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function FolderChannelPicker({
  channels,
  selectedIds,
  onChange,
  disabled,
}: FolderChannelPickerProps) {
  return (
    <DocumentChannelMultiSelect
      channels={channels}
      selectedIds={selectedIds}
      onChange={onChange}
      disabled={disabled}
      embedded
    />
  );
}
