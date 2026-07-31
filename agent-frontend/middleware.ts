/**
 * Proxy /api and /health to the backend Vercel project (BACKEND_ORIGIN env).
 * Runs on Vercel Edge before static file rewrites — supports SSE streaming.
 */
export const config = {
  matcher: ['/api/:path*', '/health'],
};

export default async function middleware(request: Request): Promise<Response> {
  const backend = process.env.BACKEND_ORIGIN?.trim().replace(/\/$/, '');
  if (!backend) {
    return new Response('BACKEND_ORIGIN is not configured on the frontend Vercel project.', {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const url = new URL(request.url);
  const target = `${backend}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete('host');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
  };
  if (hasBody) {
    init.body = request.body;
    init.duplex = 'half';
  }

  const upstream = await fetch(target, init);

  if (shouldStreamProxyResponse(request, upstream, url)) {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  }

  // Edge middleware can drop small JSON bodies on 202 when piping upstream.body
  // (e.g. Flue agent admission receipts). Buffer non-streaming responses.
  const body = await upstream.arrayBuffer();
  return new Response(body.byteLength > 0 ? body : null, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

function shouldStreamProxyResponse(
  request: Request,
  upstream: Response,
  url: URL,
): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (url.searchParams.get('view') === 'updates') return true;
  if (/\/runs\/[^/]+$/.test(url.pathname) && !url.searchParams.has('meta')) return true;
  const contentType = upstream.headers.get('content-type') ?? '';
  return (
    contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson')
  );
}
