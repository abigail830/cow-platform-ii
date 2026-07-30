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
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
