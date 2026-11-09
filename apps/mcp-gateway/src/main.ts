/**
 * MCP Gateway / Orchestrator
 *
 * A reverse-proxy gateway that sits in front of multiple MCP servers and
 * routes requests to the appropriate backend based on the URL path.
 *
 * Architecture:
 *
 *   Client (VS Code / Copilot)
 *       │
 *       ▼
 *   ┌─────────────────────────────────┐
 *   │  MCP Gateway  (this server)     │  ← Single entry point
 *   │  http://gateway:3200            │
 *   │                                 │
 *   │  /mcp/example  → localhost:3100 │  ← Routes to backend MCPs
 *   │  /mcp/another  → localhost:3101 │
 *   │  /mcp/...      → ...           │
 *   └─────────────────────────────────┘
 *
 * Each backend MCP server runs independently (e.g. example-mcp --http 3100).
 * The gateway proxies Streamable HTTP requests to the right backend.
 *
 * usage:
 *   node main.js                                # default port 3200
 *   MCP_GATEWAY_PORT=8080 node main.js          # custom port
 */

import * as http from 'http';

// ─── Configuration ──────────────────────────────────────────────────────────

interface McpBackend {
  /** Display name */
  name: string;
  /** Base URL of the backend MCP server's /mcp endpoint */
  url: string;
  /** Optional description shown in discovery */
  description?: string;
}

/**
 * Register your MCP backends here.
 * In production you'd load this from a config file or env vars.
 */
const backends: Record<string, McpBackend> = {
  example: {
    name: 'example-mcp',
    url: 'http://localhost:3100',
    description: 'Calculator, datetime, and Nx project tools',
  },
  // Add more backends:
  // another: {
  //   name: 'another-mcp',
  //   url: 'http://localhost:3101',
  //   description: 'Another MCP server',
  // },
};

const GATEWAY_PORT = parseInt(process.env['MCP_GATEWAY_PORT'] || '3200', 10);

// ─── Proxy logic ────────────────────────────────────────────────────────────

/**
 * Forward an HTTP request to a backend MCP server.
 */
async function proxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  backend: McpBackend,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Read the incoming body
    const bodyChunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(bodyChunks);
      const targetUrl = new URL('/mcp', backend.url);

      const proxyReq = http.request(
        targetUrl,
        {
          method: req.method,
          headers: {
            ...req.headers,
            host: targetUrl.host,
            'content-length': String(body.length),
          },
        },
        (proxyRes) => {
          // Copy status and headers from backend
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
          proxyRes.on('end', resolve);
        },
      );

      proxyReq.on('error', (err) => {
        console.error(`Proxy error for ${backend.name}:`, err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bad Gateway',
          message: `Backend ${backend.name} at ${backend.url} is unavailable`,
        }));
        resolve();
      });

      proxyReq.write(body);
      proxyReq.end();
    });

    req.on('error', reject);
  });
}

// ─── HTTP Server ────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';

  // ── Health / discovery ─────────────────────────────────────
  if (url === '/health') {
    // Check each backend's health
    const checks = await Promise.allSettled(
      Object.entries(backends).map(async ([key, backend]) => {
        try {
          const healthRes = await fetch(`${backend.url}/health`);
          const data = await healthRes.json();
          return { key, name: backend.name, status: 'up', data };
        } catch {
          return { key, name: backend.name, status: 'down' };
        }
      }),
    );

    const results = checks.map((c) =>
      c.status === 'fulfilled' ? c.value : { status: 'error' },
    );

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      gateway: 'ok',
      backends: results,
    }, null, 2));
    return;
  }

  // ── Discovery: list available MCP servers ──────────────────
  if (url === '/servers') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      servers: Object.entries(backends).map(([key, b]) => ({
        key,
        name: b.name,
        description: b.description,
        endpoint: `/mcp/${key}`,
      })),
    }, null, 2));
    return;
  }

  // ── Route: /mcp/:backendKey → proxy to backend ─────────────
  const mcpMatch = url.match(/^\/mcp\/([^/]+)(\/.*)?$/);
  if (mcpMatch) {
    const backendKey = mcpMatch[1];
    const backend = backends[backendKey];

    if (!backend) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: `Unknown MCP server: ${backendKey}`,
        available: Object.keys(backends),
      }));
      return;
    }

    await proxyRequest(req, res, backend);
    return;
  }

  // ── Root ────────────────────────────────────────────────────
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'mcp-gateway',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        servers: '/servers',
        mcp: '/mcp/:serverKey  (e.g. /mcp/example)',
      },
    }, null, 2));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(GATEWAY_PORT, () => {
  console.log(`\nMCP Gateway running on http://localhost:${GATEWAY_PORT}`);
  console.log(`\nRegistered backends:`);
  for (const [key, b] of Object.entries(backends)) {
    console.log(`  /mcp/${key} → ${b.url}  (${b.name})`);
  }
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health   — health check all backends`);
  console.log(`  GET  /servers  — list available MCP servers`);
  console.log(`  POST /mcp/:key — proxy to a specific MCP server\n`);
});
