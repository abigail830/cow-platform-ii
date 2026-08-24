import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFaqIndexYaml, resolveFaqIndexWorkflowYamlText } from './faq-index-yaml.ts';

describe('faq-index-yaml', () => {
  it('parses model_name and dimensions', () => {
    const parsed = parseFaqIndexYaml(
      'model_name: "qwen3-Embedding-8B"\ndimensions: 4096\n',
      'test',
    );
    assert.equal(parsed.modelName, 'qwen3-Embedding-8B');
    assert.equal(parsed.dimensions, 4096);
  });

  it('rejects missing model_name', () => {
    assert.throws(() => parseFaqIndexYaml('dimensions: 1024\n', 'test'), /model_name/);
  });

  it('reads pipeline config_yaml from DB', () => {
    const result = resolveFaqIndexWorkflowYamlText({
      configYaml: 'model_name: "MyEmbed"\ndimensions: 1024\n',
    });
    assert.match(result.yaml, /MyEmbed/);
    assert.equal(result.source, 'pipeline.config_yaml');
    assert.ok(result.configYamlSnapshot);
  });

  it('requires pipeline config_yaml', () => {
    assert.throws(() => resolveFaqIndexWorkflowYamlText({ configYaml: null }), /Config YAML/);
  });
});
