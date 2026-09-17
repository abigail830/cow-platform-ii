import { createHmac, randomBytes, randomUUID } from 'node:crypto';

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

export function generateWebhookDeliveryId(): string {
  return `wh_${randomUUID().replace(/-/g, '')}`;
}

export function signWebhookPayload(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
}): string {
  const mac = createHmac('sha256', input.secret);
  mac.update(`${input.timestamp}.${input.rawBody}`);
  return `v1=${mac.digest('hex')}`;
}
