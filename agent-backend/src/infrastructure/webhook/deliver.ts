import { eq, sql } from 'drizzle-orm';
import { appWebhookDeliveries, appWebhookSubscriptions, db } from '../db/index.ts';
import { outboundFetch } from '../../lib/outbound-fetch.ts';
import { generateWebhookDeliveryId, signWebhookPayload } from './webhook-sign.ts';

export async function deliverWebhookEvent(input: {
  subscriptionId: string;
  event: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const [sub] = await db
    .select()
    .from(appWebhookSubscriptions)
    .where(eq(appWebhookSubscriptions.id, input.subscriptionId))
    .limit(1);
  if (!sub) return;

  const [seqRow] = await db
    .update(appWebhookSubscriptions)
    .set({ sequence: sql`${appWebhookSubscriptions.sequence} + 1` })
    .where(eq(appWebhookSubscriptions.id, sub.id))
    .returning({ sequence: appWebhookSubscriptions.sequence });
  const sequence = seqRow?.sequence ?? sub.sequence + 1;

  const webhookId = generateWebhookDeliveryId();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = {
    ...input.payload,
    event: input.event,
    sequence,
    idempotency_key: webhookId,
    timestamp: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-OpenKMS-Webhook-Id': webhookId,
    'X-OpenKMS-Timestamp': timestamp,
    'X-OpenKMS-Sequence': String(sequence),
  };
  if (sub.signatureMode === 'hmac_sha256') {
    headers['X-OpenKMS-Signature'] = signWebhookPayload({
      secret: sub.secret,
      timestamp,
      rawBody,
    });
  }

  const [delivery] = await db
    .insert(appWebhookDeliveries)
    .values({
      subscriptionId: sub.id,
      event: input.event,
      payload: body,
      sequence,
      status: 'pending',
      attempt: 1,
    })
    .returning();

  try {
    const response = await outboundFetch(sub.url, {
      method: 'POST',
      headers,
      body: rawBody,
      timeoutMs: 10_000,
      retries: 0,
      label: 'Webhook',
    });
    await db
      .update(appWebhookDeliveries)
      .set({
        status: response.ok ? 'delivered' : 'failed',
        responseStatus: response.status,
        errorMessage: response.ok ? null : `HTTP ${response.status}`,
      })
      .where(eq(appWebhookDeliveries.id, delivery!.id));
    if (!response.ok) {
      console.warn(`[webhook] ${input.event} HTTP ${response.status} for ${sub.url}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(appWebhookDeliveries)
      .set({
        status: 'failed',
        errorMessage: message.slice(0, 2000),
      })
      .where(eq(appWebhookDeliveries.id, delivery!.id));
    console.warn(`[webhook] ${input.event} failed: ${message}`);
  }
}
