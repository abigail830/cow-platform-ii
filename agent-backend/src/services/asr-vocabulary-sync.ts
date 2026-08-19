const CUSTOMIZATION_PATH = '/services/audio/asr/customization';

export type DashScopeVocabularyCredentials = {
  apiKey: string;
  baseUrl: string;
};

type VocabularyEntry = {
  text: string;
  weight: number;
  lang?: string;
};

async function parseJsonResponse(response: Response, label: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON (${response.status}): ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} returned unexpected payload`);
  }
  return data as Record<string, unknown>;
}

export async function dashScopeCreateVocabulary(
  creds: DashScopeVocabularyCredentials,
  input: {
    targetModel: string;
    prefix: string;
    vocabulary: VocabularyEntry[];
  },
): Promise<string> {
  const url = `${creds.baseUrl.replace(/\/$/, '')}${CUSTOMIZATION_PATH}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'speech-biasing',
      input: {
        action: 'create_vocabulary',
        target_model: input.targetModel,
        prefix: input.prefix,
        vocabulary: input.vocabulary,
      },
    }),
  });
  const data = await parseJsonResponse(response, 'Create vocabulary');
  const output = data.output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('Create vocabulary returned no output');
  }
  const vocabularyId = (output as Record<string, unknown>).vocabulary_id;
  if (typeof vocabularyId !== 'string' || !vocabularyId.trim()) {
    throw new Error('Create vocabulary returned no vocabulary_id');
  }
  return vocabularyId.trim();
}

export async function dashScopeUpdateVocabulary(
  creds: DashScopeVocabularyCredentials,
  input: {
    vocabularyId: string;
    vocabulary: VocabularyEntry[];
  },
): Promise<void> {
  const url = `${creds.baseUrl.replace(/\/$/, '')}${CUSTOMIZATION_PATH}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'speech-biasing',
      input: {
        action: 'update_vocabulary',
        vocabulary_id: input.vocabularyId,
        vocabulary: input.vocabulary,
      },
    }),
  });
  await parseJsonResponse(response, 'Update vocabulary');
}

export async function dashScopeDeleteVocabulary(
  creds: DashScopeVocabularyCredentials,
  vocabularyId: string,
): Promise<void> {
  const url = `${creds.baseUrl.replace(/\/$/, '')}${CUSTOMIZATION_PATH}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'speech-biasing',
      input: {
        action: 'delete_vocabulary',
        vocabulary_id: vocabularyId,
      },
    }),
  });
  await parseJsonResponse(response, 'Delete vocabulary');
}
