
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const host = process.env.UI_HOST ?? '127.0.0.1';
const port = Number(process.env.UI_PORT ?? 8790);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    rel = normalize(rel).replace(/^([.][.][/\\])+/, '');
    let path = join(root, rel);

    try {
      const s = await stat(path);
      if (s.isDirectory()) path = join(path, 'index.html');
    } catch {
      path = join(root, 'index.html');
    }

    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': mime[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, {'content-type':'text/plain; charset=utf-8'});
    res.end(String(error));
  }
});

server.listen(port, host, () => {
  console.log(`TY Platform standalone UI: http://${host}:${port}`);
  console.log('Business API expected at: http://127.0.0.1:8787');
});
