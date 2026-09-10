import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DocumentChannel } from '../api/documentChannels.ts';
import { channelHasWriteAccess, listWritableChannelMoveOptions } from './channel-access.ts';

function channel(
  overrides: Partial<DocumentChannel> & Pick<DocumentChannel, 'id' | 'name'>,
): DocumentChannel {
  return {
    description: null,
    parent_id: null,
    sort_order: 0,
    pipeline_id: null,
    transcription_pipeline_id: null,
    post_process_pipeline_id: null,
    auto_start_pipeline: false,
    created_at: '',
    updated_at: '',
    children: [],
    ...overrides,
  };
}

describe('channelHasWriteAccess', () => {
  it('is fail-closed when my_access is missing', () => {
    assert.equal(channelHasWriteAccess({}), false);
    assert.equal(channelHasWriteAccess(null), false);
    assert.equal(channelHasWriteAccess({ my_access: null }), false);
  });

  it('requires write or manage, not read-only', () => {
    assert.equal(
      channelHasWriteAccess({ my_access: { read: true, write: false, manage: false } }),
      false,
    );
    assert.equal(
      channelHasWriteAccess({ my_access: { read: true, write: true, manage: false } }),
      true,
    );
    assert.equal(
      channelHasWriteAccess({ my_access: { read: true, write: false, manage: true } }),
      true,
    );
  });
});

describe('listWritableChannelMoveOptions', () => {
  it('keeps only writable destinations and hides current / read-only / ancestor placeholders', () => {
    const tree: DocumentChannel[] = [
      channel({
        id: 'corp',
        name: 'CorpService',
        my_access: { read: false, write: false, manage: false },
        children: [
          channel({
            id: 'lrqa',
            name: 'LRQA',
            parent_id: 'corp',
            my_access: { read: true, write: true, manage: true },
            children: [
              channel({
                id: 'meeting',
                name: 'MeetingRecord',
                parent_id: 'lrqa',
                my_access: { read: true, write: true, manage: false },
              }),
            ],
          }),
          channel({
            id: 'shared-read',
            name: 'SharedRead',
            parent_id: 'corp',
            my_access: { read: true, write: false, manage: false },
          }),
        ],
      }),
    ];

    const options = listWritableChannelMoveOptions(tree, 'lrqa');
    assert.deepEqual(
      options.map((option) => option.id),
      ['meeting'],
    );
    assert.equal(options[0]?.label, 'CorpService/LRQA/MeetingRecord');
  });
});
