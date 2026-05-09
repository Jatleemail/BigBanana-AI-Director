/**
 * BigBanana AI Director — 统一生产服务器
 *
 * 单进程部署：静态文件服务 + 所有 API 代理 + 配置存储
 * 仅依赖 Node.js 内置模块，无需 npm install
 *
 * 用法: node server/productionServer.mjs
 * 端口: PORT 环境变量，默认 3000
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNewApiProxyHandler } from './newApiProxyCore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const DATA_DIR = path.resolve(__dirname, '..', 'server-data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

// ==================================================================
// 辅助函数
// ==================================================================

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const readBodyText = async (req) => Buffer.from(await readBody(req)).toString('utf8');

// ==================================================================
// 静态文件服务（SPA 回退）
// ==================================================================

const serveStatic = (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let urlPath = requestUrl.pathname;

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(DIST_DIR, urlPath);

  // 安全检查：防止目录穿越
  if (!filePath.startsWith(DIST_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext];

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA 回退：非文件路由返回 index.html
        fs.readFile(path.join(DIST_DIR, 'index.html'), (err2, data2) => {
          if (err2) {
            res.statusCode = 500;
            res.end('Internal Server Error');
            return;
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(data2);
        });
        return;
      }
      res.statusCode = 500;
      res.end('Internal Server Error');
      return;
    }

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // 静态资源长期缓存（入口 HTML 除外）
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }

    res.end(data);
  });
};

// ==================================================================
// /api/media-proxy — 媒体代理（绕过 CORS）
// ==================================================================

const handleMediaProxy = async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const target = requestUrl.searchParams.get('url');

    if (!target) { sendJson(res, 400, { error: 'Missing url query parameter.' }); return; }

    let targetUrl;
    try { targetUrl = new URL(target); } catch {
      sendJson(res, 400, { error: 'Invalid url value.' }); return;
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      sendJson(res, 400, { error: 'Only http/https URLs are allowed.' }); return;
    }

    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: req.headers.range ? { range: String(req.headers.range) } : undefined,
      redirect: 'follow',
    });

    res.statusCode = upstream.status;
    ['content-type', 'content-length', 'content-range', 'accept-ranges',
     'cache-control', 'etag', 'last-modified', 'expires'].forEach((key) => {
      const value = upstream.headers.get(key);
      if (value) res.setHeader(key, value);
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    sendJson(res, 502, { error: 'Media proxy failed.', detail: error?.message || String(error) });
  }
};

// ==================================================================
// /api/vidu-proxy — Vidu API 代理
// ==================================================================

const handleViduProxy = async (req, res) => {
  try {
    const targetPath = (req.url || '/').replace(/^\/api\/vidu-proxy/, '') || '/';
    const targetUrl = `https://api.vidu.cn${targetPath}`;

    const headers = {};
    if (req.headers['authorization']) headers['Authorization'] = String(req.headers['authorization']);
    if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);

    const options = { method: req.method || 'GET', headers, redirect: 'follow' };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body = await readBodyText(req);
    }

    const upstream = await fetch(targetUrl, options);

    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    ['content-length', 'cache-control', 'etag'].forEach((key) => {
      const value = upstream.headers.get(key);
      if (value) res.setHeader(key, value);
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    sendJson(res, 502, { error: 'Vidu proxy failed.', detail: error?.message || String(error) });
  }
};

// ==================================================================
// /api/config — 服务端共享配置
// ==================================================================

const handleConfigApi = async (req, res) => {
  try {
    if (req.method === 'GET') {
      let data = { modelRegistry: null, apiKey: null, cosConfig: null, updatedAt: null };
      if (fs.existsSync(CONFIG_FILE)) {
        try { data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
      }
      sendJson(res, 200, data);
      return;
    }

    if (req.method === 'PUT') {
      const text = await readBodyText(req);
      const body = JSON.parse(text || '{}');
      const config = {
        modelRegistry: body.modelRegistry || null,
        apiKey: body.apiKey || null,
        cosConfig: body.cosConfig || null,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
      sendJson(res, 200, { ok: true, updatedAt: config.updatedAt });
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    sendJson(res, 500, { error: 'Config API error', detail: e.message });
  }
};

// ==================================================================
// 主服务
// ==================================================================

// 预加载 new-api-proxy handler（含 session 管理等）
const newApiProxyHandler = createNewApiProxyHandler();

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = requestUrl.pathname;

    // CORS 预检（API 路由）
    if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Range');
      res.end();
      return;
    }

    // API 路由分发
    if (pathname === '/api/media-proxy') {
      await handleMediaProxy(req, res);
      return;
    }

    if (pathname.startsWith('/api/vidu-proxy')) {
      await handleViduProxy(req, res);
      return;
    }

    if (pathname === '/api/config') {
      await handleConfigApi(req, res);
      return;
    }

    if (pathname.startsWith('/api/new-api')) {
      newApiProxyHandler(req, res, () => {
        // 如果 new-api handler 不处理，回退到 404
        sendJson(res, 404, { success: false, message: 'Not Found', data: null });
      });
      return;
    }

    // 其他请求 → 静态文件
    serveStatic(req, res);
  } catch (error) {
    console.error('[server] Unhandled error:', error.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  const buildExists = fs.existsSync(path.join(DIST_DIR, 'index.html'));
  console.log('');
  console.log('  BigBanana AI Director — Production Server');
  console.log(`  Listening on http://${HOST}:${PORT}`);
  console.log(`  Static files: ${buildExists ? '✓ dist/' : '✗ dist/ not found — run "npm run build" first'}`);
  console.log(`  Config: server-data/config.json`);
  console.log('');
  console.log('  Routes:');
  console.log('    /                  Static SPA');
  console.log('    /api/config        Shared config API');
  console.log('    /api/media-proxy   CORS media proxy');
  console.log('    /api/new-api/*     Account center proxy');
  console.log('    /api/vidu-proxy/*  Vidu API proxy');
  console.log('');
});
