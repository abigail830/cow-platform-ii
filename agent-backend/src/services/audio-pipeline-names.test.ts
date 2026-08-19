import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ASYNC_AUDIO_PIPELINE_NAMES,
  audioPipelineProviderForName,
  isAudioAsyncPipelineName,
} from '../services/audio-pipeline-names.ts';

describe('audio-pipeline-names', () => {
  it('recognizes supported async audio pipeline names', () => {
    assert.equal(isAudioAsyncPipelineName('aliyun-qwen-audio-transcribe'), true);
    assert.equal(isAudioAsyncPipelineName('aliyun-fun-asr-transcribe'), true);
    assert.equal(isAudioAsyncPipelineName('baidu-doc-parse'), false);
    assert.deepEqual([...ASYNC_AUDIO_PIPELINE_NAMES], [
      'aliyun-qwen-audio-transcribe',
      'aliyun-fun-asr-transcribe',
    ]);
  });

  it('maps pipeline name to provider', () => {
    assert.equal(audioPipelineProviderForName('aliyun-qwen-audio-transcribe'), 'aliyun');
    assert.equal(audioPipelineProviderForName('aliyun-fun-asr-transcribe'), 'aliyun');
    assert.equal(audioPipelineProviderForName('unknown'), null);
  });
});
