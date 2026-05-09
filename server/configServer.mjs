import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.CONFIG_SERVER_PORT || '8789', 10);
const HOST = process.env.CONFIG_SERVER_HOST || '0.0.0.0';
const DATA_DIR = path.resolve(__dirname, '..', 'server-data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const writeJson = (res, statusCode, payload) => {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return null;
  return JSON.parse(text);
};

const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[config-server] Failed to load config:', e.message);
  }
  return { modelRegistry: null, apiKey: null, updatedAt: null };
};

const saveConfigFile = (data) => {
  const config = {
    modelRegistry: data.modelRegistry || null,
    apiKey: data.apiKey || null,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  return config;
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (requestUrl.pathname === '/api/config') {
      if (req.method === 'GET') {
        writeJson(res, 200, loadConfig());
        return;
      }

      if (req.method === 'PUT') {
        const body = await readBody(req);
        if (!body) {
          writeJson(res, 400, { error: 'Missing request body' });
          return;
        }
        const saved = saveConfigFile(body);
        console.log('[config-server] Config updated at', saved.updatedAt);
        writeJson(res, 200, { ok: true, updatedAt: saved.updatedAt });
        return;
      }

      writeJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    if (requestUrl.pathname === '/healthz') {
      writeJson(res, 200, { ok: true, service: 'config-server' });
      return;
    }

    writeJson(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('[config-server] Error:', e.message);
    writeJson(res, 500, { error: 'Internal server error', detail: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[config-server] listening on http://${HOST}:${PORT}`);
});
