import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const file = new URL('../index.html', import.meta.url);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/healthz') {
    try { await readFile(file); response.writeHead(200, {'Content-Type':'application/json'}); response.end('{"status":"ok","app":"exit-north"}'); }
    catch { response.writeHead(503); response.end('Build is missing.'); }
    return;
  }
  if (!['/', '/index.html'].includes(path)) { response.writeHead(404); response.end('Not found'); return; }
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405, {'Allow':'GET, HEAD'}); response.end(); return; }
  try {
    const html = await readFile(file);
    response.writeHead(200, {
      'Content-Type':'text/html; charset=utf-8',
      'Content-Length':html.byteLength,
      'Cache-Control':'no-cache',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : html);
  } catch (error) {
    response.writeHead(503, {'Content-Type':'text/plain; charset=utf-8'});
    response.end('Build the application with npm run build.');
    console.error(error.message);
  }
});
server.listen(port,host,() => console.log(`Exit North listening on ${host}:${port}`));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
