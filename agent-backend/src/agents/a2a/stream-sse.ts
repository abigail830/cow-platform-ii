import {
  StreamResponse,
  formatSSEErrorEvent,
  formatSSEEvent,
  SSE_HEADERS,
} from '@a2a-js/sdk';

export async function sseResponseFromStream(
  stream: AsyncGenerator<StreamResponse, void, undefined>,
): Promise<Response> {
  const iterator = stream[Symbol.asyncIterator]();
  let firstResult: IteratorResult<StreamResponse, void>;

  try {
    firstResult = await iterator.next();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        error: {
          code: 500,
          status: 'INTERNAL',
          message,
          details: [],
        },
      },
      { status: 500, headers: { 'Content-Type': 'application/a2a+json' } },
    );
  }

  const encoder = new TextEncoder();
  let streamError: unknown;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!firstResult.done) {
          controller.enqueue(encoder.encode(formatSSEEvent(StreamResponse.toJSON(firstResult.value))));
        }
        while (true) {
          const next = await iterator.next();
          if (next.done) break;
          controller.enqueue(encoder.encode(formatSSEEvent(StreamResponse.toJSON(next.value))));
        }
      } catch (error) {
        streamError = error;
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(
          encoder.encode(
            formatSSEErrorEvent({
              error: { code: 500, status: 'INTERNAL', message, details: [] },
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  if (streamError) {
    return new Response(body, { status: 200, headers: SSE_HEADERS });
  }

  return new Response(body, { status: 200, headers: SSE_HEADERS });
}
