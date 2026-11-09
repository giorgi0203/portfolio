/**
 * Angular Compiler API - Microservice
 *
 * Exposes HTTP endpoint to compile Angular components using AOT compilation.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import type { CompileRequest, CompileResponse } from 'shared-types';
import { aotCompiler } from './compiler';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

const app = express();

// Security: Limit request body size to 200KB
app.use(express.json({ limit: '200kb' }));

// CORS: Only allow local development origin
const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:4201',
  'http://127.0.0.1:4200',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like curl)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'angular-compiler-api',
    timestamp: new Date().toISOString(),
  });
});

// API info endpoint
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    name: 'Angular Compiler API',
    version: '1.0.0',
    description: 'Compile Angular components using AOT compilation',
    endpoints: {
      'POST /api/compile': 'Compile Angular component source to Ivy output',
      'GET /health': 'Health check',
    },
  });
});

// Main compilation endpoint
app.post('/api/compile', async (req: Request, res: Response) => {
  try {
    const request: CompileRequest = req.body;

    // Basic request validation
    if (!request || typeof request !== 'object') {
      const errorResponse: CompileResponse = {
        ok: false,
        diagnostics: [
          { message: 'Invalid request body', category: 'error' },
        ],
      };
      res.status(400).json(errorResponse);
      return;
    }

    // Log compilation request (without source code for security)
    console.log(
      `[${new Date().toISOString()}] Compilation request received - ` +
        `componentTs: ${request.componentTs?.length || 0} bytes, ` +
        `templateHtml: ${request.templateHtml?.length || 0} bytes, ` +
        `styleCss: ${request.styleCss?.length || 0} bytes`
    );

    // Compile the component
    const result = await aotCompiler.compile(request);

    // Log result
    console.log(
      `[${new Date().toISOString()}] Compilation ${result.ok ? 'succeeded' : 'failed'} - ` +
        `files: ${result.ok ? result.files.length : 0}, ` +
        `diagnostics: ${result.diagnostics.length}`
    );

    res.json(result);
  } catch (error) {
    console.error('Compilation error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorResponse: CompileResponse = {
      ok: false,
      diagnostics: [
        { message: `Server error: ${errorMessage}`, category: 'error' },
      ],
    };
    res.status(500).json(errorResponse);
  }
});

// Error handling middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);

  // CORS error
  if (err.message === 'CORS not allowed') {
    res.status(403).json({
      ok: false,
      diagnostics: [{ message: 'CORS not allowed', category: 'error' }],
    });
    return;
  }

  // JSON parsing error
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      ok: false,
      diagnostics: [{ message: 'Invalid JSON', category: 'error' }],
    });
    return;
  }

  // Generic error
  res.status(500).json({
    ok: false,
    diagnostics: [{ message: 'Internal server error', category: 'error' }],
  });
});

// Start server
app.listen(port, host, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Angular Compiler API - Microservice               ║
╠═══════════════════════════════════════════════════════════╣
║  Status:  Ready                                           ║
║  URL:     http://${host}:${port}                              ║
║  Endpoints:                                               ║
║    POST /api/compile  - Compile Angular component         ║
║    GET  /api          - API information                   ║
║    GET  /health       - Health check                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
