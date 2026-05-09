import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createNewApiProxyHandler } from './server/newApiProxyCore.mjs';

const createDevMediaProxyPlugin = (): Plugin => ({
  name: 'dev-media-proxy',
  configureServer(server) {
    const handler = async (req: any, res: any) => {
      try {
        const requestUrl = new URL(req.url || '', 'http://localhost');
        const target = requestUrl.searchParams.get('url');

        if (!target) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Missing url query parameter.' }));
          return;
        }

        let targetUrl: URL;
        try {
          targetUrl = new URL(target);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Invalid url value.' }));
          return;
        }

        if (!['http:', 'https:'].includes(targetUrl.protocol)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Only http/https URLs are allowed.' }));
          return;
        }

        const upstream = await fetch(targetUrl.toString(), {
          method: 'GET',
          headers: req.headers.range ? { range: String(req.headers.range) } : undefined,
          redirect: 'follow',
        });

        res.statusCode = upstream.status;
        const passthroughHeaders = [
          'content-type',
          'content-length',
          'content-range',
          'accept-ranges',
          'cache-control',
          'etag',
          'last-modified',
          'expires',
        ];

        passthroughHeaders.forEach((key) => {
          const value = upstream.headers.get(key);
          if (value) {
            res.setHeader(key, value);
          }
        });

        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.end(buffer);
      } catch (error: any) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: 'Media proxy failed.',
            detail: error?.message || String(error),
          })
        );
      }
    };

    server.middlewares.use('/api/media-proxy', handler);
  },
});

const createDevNewApiProxyPlugin = (): Plugin => ({
  name: 'dev-new-api-proxy',
  configureServer(server) {
    const handler = createNewApiProxyHandler();
    server.middlewares.use(handler as any);
  },
});

const CONFIG_DATA_DIR = path.resolve(__dirname, 'server-data');
const CONFIG_FILE = path.join(CONFIG_DATA_DIR, 'config.json');

const createDevConfigPlugin = (): Plugin => ({
  name: 'dev-config-api',
  configureServer(server) {
    fs.mkdirSync(CONFIG_DATA_DIR, { recursive: true });

    server.middlewares.use('/api/config', async (req: any, res: any) => {
      try {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method === 'GET') {
          let data = { modelRegistry: null, apiKey: null, cosConfig: null, updatedAt: null };
          if (fs.existsSync(CONFIG_FILE)) {
            try { data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(data));
          return;
        }

        if (req.method === 'PUT') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8').trim() || '{}');
          const config = {
            modelRegistry: body.modelRegistry || null,
            apiKey: body.apiKey || null,
            cosConfig: body.cosConfig || null,
            updatedAt: new Date().toISOString(),
          };
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true, updatedAt: config.updatedAt }));
          return;
        }

        res.statusCode = 405;
        res.end();
      } catch (e: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Config API error', detail: e.message }));
      }
    });
  },
});

const createDevViduProxyPlugin = (): Plugin => ({
  name: 'dev-vidu-proxy',
  configureServer(server) {
    server.middlewares.use('/api/vidu-proxy', async (req: any, res: any) => {
      try {
        const targetPath = (req.url || '/').replace(/^\/api\/vidu-proxy/, '') || '/';
        const targetUrl = `https://api.vidu.cn${targetPath}`;

        const headers: Record<string, string> = {};
        if (req.headers['authorization']) headers['Authorization'] = String(req.headers['authorization']);
        if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);

        const upstream = await fetch(targetUrl, {
          method: req.method || 'GET',
          headers,
          body: req.method !== 'GET' && req.method !== 'HEAD'
            ? await new Promise<string>((resolve, reject) => {
                let body = '';
                req.on('data', (chunk: any) => { body += chunk; });
                req.on('end', () => resolve(body));
                req.on('error', reject);
              })
            : undefined,
          redirect: 'follow',
        });

        res.statusCode = upstream.status;
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
        const passthroughHeaders = ['content-length', 'cache-control', 'etag'];
        passthroughHeaders.forEach((key) => {
          const value = upstream.headers.get(key);
          if (value) res.setHeader(key, value);
        });

        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.end(buffer);
      } catch (error: any) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: 'Vidu proxy failed.',
          detail: error?.message || String(error),
        }));
      }
    });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), createDevConfigPlugin(), createDevMediaProxyPlugin(), createDevNewApiProxyPlugin(), createDevViduProxyPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.ANTSK_API_KEY),
        'process.env.ANTSK_API_KEY': JSON.stringify(env.ANTSK_API_KEY),
        'process.env.TENCENT_COS_SECRET_ID': JSON.stringify(env.TENCENT_COS_SECRET_ID),
        'process.env.TENCENT_COS_SECRET_KEY': JSON.stringify(env.TENCENT_COS_SECRET_KEY),
        'process.env.TENCENT_COS_REGION': JSON.stringify(env.TENCENT_COS_REGION),
        'process.env.TENCENT_COS_BUCKET': JSON.stringify(env.TENCENT_COS_BUCKET),
        'process.env.TENCENT_COS_CDN_DOMAIN': JSON.stringify(env.TENCENT_COS_CDN_DOMAIN),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1024,
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              icons: ['lucide-react'],
              zip: ['jszip'],
            },
          },
        },
      }
    };
});
