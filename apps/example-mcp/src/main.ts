/**
 * Example MCP (Model Context Protocol) Server
 *
 * Demonstrates how to build an MCP server with:
 *  - Tools: callable functions (calculator, workspace stats)
 *  - Resources: readable data (system info, project list)
 *  - Prompts: reusable prompt templates
 *
 * Supports two transport modes:
 *  - stdio (default): for VS Code / Copilot local usage
 *  - http: Streamable HTTP transport for remote/deployed usage
 *
 * Usage:
 *   node main.js              # stdio mode
 *   node main.js --http       # HTTP mode on port 3100
 *   node main.js --http 8080  # HTTP mode on custom port
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { randomUUID } from 'crypto';

// ─── Create the MCP server ─────────────────────────────────────────────────

const server = new McpServer({
  name: 'example-mcp',
  version: '1.0.0',
});

// ─── Tools ──────────────────────────────────────────────────────────────────

function registerTools(srv: McpServer) {

/**
 * A simple calculator tool that performs basic arithmetic.
 */
srv.tool(
  'calculate',
  'Perform basic arithmetic operations (add, subtract, multiply, divide)',
  {
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('The arithmetic operation'),
    a: z.number().describe('First operand'),
    b: z.number().describe('Second operand'),
  },
  async ({ operation, a, b }) => {
    let result: number;

    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) {
          return {
            content: [{ type: 'text', text: 'Error: Division by zero' }],
            isError: true,
          };
        }
        result = a / b;
        break;
    }

    return {
      content: [
        {
          type: 'text',
          text: `${a} ${operation} ${b} = ${result}`,
        },
      ],
    };
  }
);

/**
 * Returns current date/time in various formats.
 */
srv.tool(
  'get_datetime',
  'Get the current date and time in various formats',
  {
    format: z
      .enum(['iso', 'unix', 'human', 'all'])
      .default('all')
      .describe('Output format for the date/time'),
  },
  async ({ format }) => {
    const now = new Date();
    const formats: Record<string, string> = {
      iso: now.toISOString(),
      unix: String(Math.floor(now.getTime() / 1000)),
      human: now.toLocaleString(),
    };

    const output =
      format === 'all'
        ? Object.entries(formats)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        : `${format}: ${formats[format]}`;

    return { content: [{ type: 'text', text: output }] };
  }
);

/**
 * Lists Nx projects found in the workspace apps/ directory.
 */
srv.tool(
  'list_nx_projects',
  'List all Nx project directories in the monorepo apps/ folder',
  {},
  async () => {
    const appsDir = path.resolve(__dirname, '../../../apps');
    let projects: string[] = [];

    try {
      const entries = fs.readdirSync(appsDir, { withFileTypes: true });
      projects = entries
        .filter((e) => e.isDirectory())
        .filter((e) => {
          const projectJson = path.join(appsDir, e.name, 'project.json');
          return fs.existsSync(projectJson);
        })
        .map((e) => e.name);
    } catch {
      return {
        content: [{ type: 'text', text: 'Could not read apps directory.' }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Found ${projects.length} Nx projects:\n${projects.map((p) => `  • ${p}`).join('\n')}`,
        },
      ],
    };
  }
);

} // end registerTools

// ─── Resources ──────────────────────────────────────────────────────────────

function registerResources(srv: McpServer) {

/**
 * Exposes system information as a readable resource.
 */
srv.resource('system-info', 'system://info', async (uri) => ({
  contents: [
    {
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(
        {
          platform: os.platform(),
          arch: os.arch(),
          nodeVersion: process.version,
          hostname: os.hostname(),
          cpus: os.cpus().length,
          totalMemoryGB: (os.totalmem() / 1073741824).toFixed(2),
          freeMemoryGB: (os.freemem() / 1073741824).toFixed(2),
          uptime: `${(os.uptime() / 3600).toFixed(1)} hours`,
        },
        null,
        2
      ),
    },
  ],
}));

/**
 * Exposes the monorepo package.json as a resource.
 */
srv.resource('package-json', 'project://package.json', async (uri) => {
  const pkgPath = path.resolve(__dirname, '../../../package.json');

  try {
    const content = fs.readFileSync(pkgPath, 'utf-8');
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: content,
        },
      ],
    };
  } catch {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/plain',
          text: 'Could not read package.json',
        },
      ],
    };
  }
});

} // end registerResources

// ─── Prompts ────────────────────────────────────────────────────────────────

function registerPrompts(srv: McpServer) {

/**
 * A code-review prompt template.
 */
srv.prompt(
  'code-review',
  'Generate a code review for the given code snippet',
  { code: z.string().describe('The code to review'), language: z.string().optional().describe('Programming language') },
  ({ code, language }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please review the following ${language ?? ''} code. Focus on:
1. Potential bugs or errors
2. Performance improvements
3. Code style and best practices
4. Security concerns

\`\`\`${language ?? ''}
${code}
\`\`\``,
        },
      },
    ],
  })
);

/**
 * A summarisation prompt template.
 */
srv.prompt(
  'summarize',
  'Summarize text to a given length',
  { text: z.string().describe('The text to summarize'), maxWords: z.string().optional().describe('Max words (default 100)') },
  ({ text, maxWords }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Summarize the following text in ${maxWords ?? '100'} words or fewer:\n\n${text}`,
        },
      },
    ],
  })
);

} // end registerPrompts

// ─── Start ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const useHttp = args.includes('--http');

  if (useHttp) {
    // ── Streamable HTTP transport (remote/deployed mode) ──
    const portArg = args[args.indexOf('--http') + 1];
    const port = portArg && !portArg.startsWith('-') ? parseInt(portArg, 10) : 3100;

    // Map of session ID → transport for stateful connections
    const transports = new Map<string, StreamableHTTPServerTransport>();

    const httpServer = http.createServer(async (req, res) => {
      // CORS headers for cross-origin access
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', server: 'example-mcp', transport: 'streamable-http' }));
        return;
      }

      // MCP endpoint
      if (req.url === '/mcp') {
        // Check for existing session
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (sessionId && transports.has(sessionId)) {
          // Reuse existing transport for this session
          const transport = transports.get(sessionId)!;
          await transport.handleRequest(req, res);
          return;
        }

        if (req.method === 'POST') {
          // New session — create transport and connect a new server instance
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              transports.delete(transport.sessionId);
            }
          };

          // Each session gets its own MCP server instance
          const sessionServer = new McpServer({
            name: 'example-mcp',
            version: '1.0.0',
          });

          // Re-register all tools/resources/prompts on the session server
          registerTools(sessionServer);
          registerResources(sessionServer);
          registerPrompts(sessionServer);

          await sessionServer.connect(transport);

          if (transport.sessionId) {
            transports.set(transport.sessionId, transport);
          }

          await transport.handleRequest(req, res);
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request — POST to /mcp to initialize' }));
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    httpServer.listen(port, () => {
      console.log(`Example MCP server running on http://localhost:${port}/mcp`);
      console.log(`Health check: http://localhost:${port}/health`);
    });
  } else {
    // ── stdio transport (local VS Code / Copilot mode) ──
    registerTools(server);
    registerResources(server);
    registerPrompts(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Example MCP server running on stdio');
  }
}

main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
