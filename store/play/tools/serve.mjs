import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};
http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let f = path.join(root, p);
    const tries = [f, f + '.html', path.join(f, 'index.html'), path.join(root, 'index.html')];
    const hit = tries.find((t) => fs.existsSync(t) && fs.statSync(t).isFile());
    res.writeHead(200, {
      'Content-Type': types[path.extname(hit)] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
    fs.createReadStream(hit).pipe(res);
  })
  .listen(8765);
