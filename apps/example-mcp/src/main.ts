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
import { serviceLanding } from 'shared-types';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
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
    const appsDir = path.join(process.env.WORKSPACE_METADATA_DIR || process.cwd(), 'apps');
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
  const pkgPath = path.join(process.env.WORKSPACE_METADATA_DIR || process.cwd(), 'package.json');

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

    const sessions = new Map<string,{transport:StreamableHTTPServerTransport;server:McpServer;touched:number}>();
    const retire = async (id:string)=>{const entry=sessions.get(id);if(!entry)return;sessions.delete(id);await entry.server.close().catch(()=>undefined);};
    setInterval(()=>{for(const [id,entry] of sessions)if(Date.now()-entry.touched>10*60*1000)void retire(id);},60000).unref();
    const httpServer = http.createServer(async (req,res)=>{
      res.setHeader('Access-Control-Allow-Origin','*');
      res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Content-Type, mcp-session-id, MCP-Protocol-Version');
      res.setHeader('Access-Control-Expose-Headers','mcp-session-id');
      const reply=(status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
      const pathname=new URL(req.url||'/','http://localhost').pathname;
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      if(pathname==='/health'){reply(200,{status:'ok',server:'example-mcp',transport:'streamable-http'});return;}
      if(pathname==='/'&&req.headers.accept?.includes('text/html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(serviceLanding('Example MCP','Calculator and date/time tools, project resources, and reusable prompt templates.','/mcp'));return;}
      if(pathname==='/'){reply(200,{name:'Example MCP',description:'A public calculator, datetime, project metadata, and prompt demo. No AI API calls.',endpoint:'/mcp',usage:'Connect with an MCP client using Streamable HTTP.',source:'https://github.com/giorgi0203/portfolio/tree/codex/portfolio-subdomains/apps/example-mcp'});return;}
      if(pathname!=='/mcp'){reply(404,{error:'Not found'});return;}
      try {
        let body:unknown;
        if(req.method==='POST'){
          let length=0;const chunks:Buffer[]=[];
          for await(const chunk of req){length+=chunk.length;if(length>200*1024){reply(413,{error:'Request exceeds 200 KB'});return;}chunks.push(chunk);}
          try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{reply(400,{error:'Invalid JSON'});return;}
        }
        const id=req.headers['mcp-session-id'];
        if(typeof id==='string'){
          const entry=sessions.get(id);if(!entry){reply(404,{error:'Session expired. Initialize a new session.'});return;}
          entry.touched=Date.now();await entry.transport.handleRequest(req,res,body);return;
        }
        if(req.method!=='POST'||!isInitializeRequest(body)){reply(400,{error:'Initialize the MCP session first.'});return;}
        if(sessions.size>=64){res.setHeader('Retry-After','60');reply(503,{error:'Server busy. Please retry shortly.'});return;}
        const sessionServer=new McpServer({name:'example-mcp',version:'1.0.0'});
        registerTools(sessionServer);registerResources(sessionServer);registerPrompts(sessionServer);
        const transport=new StreamableHTTPServerTransport({sessionIdGenerator:()=>randomUUID(),onsessioninitialized:sessionId=>sessions.set(sessionId,{transport,server:sessionServer,touched:Date.now()})});
        transport.onclose=()=>{if(transport.sessionId)sessions.delete(transport.sessionId);};
        await sessionServer.connect(transport);
        await transport.handleRequest(req,res,body);
        if(!transport.sessionId)await sessionServer.close();
      }catch(error){console.error('MCP request failed:',error instanceof Error?error.message:'Unknown error');if(!res.headersSent)reply(500,{error:'MCP request failed'});else res.end();}
    });

    httpServer.listen(port, process.env.HOST || '127.0.0.1', () => {
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
