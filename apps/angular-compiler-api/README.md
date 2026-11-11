# Angular Compiler API

A minimal Node.js microservice that exposes an HTTP API to compile user-provided Angular component source into real Angular Ivy compiled output (AOT).

## Features

- **POST /api/compile** - Compile Angular components using AOT compilation
- **GET /health** - Health check endpoint
- **GET /api** - API information

## Security

- Input size limited to 200KB
- Compilation timeout: 10 seconds
- Compilation runs in a child process without executing user code
- CORS permits the deployed compiler and listed local development origins
- Compiler file reads are restricted to the temporary project and installed libraries

## Prerequisites

- Node.js 24+
- Angular dependencies installed in workspace root

## Running the Server

### Development

```bash
# From workspace root
npx nx serve angular-compiler-api

# Or with watch mode
npx nx serve angular-compiler-api --watch
```

### Production Build

```bash
# Build
npx nx build angular-compiler-api

# Run built version
node dist/apps/angular-compiler-api/main.js
```

The server runs on `http://localhost:3001` by default.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `localhost` | Server host |
| `PORT` | `3001` | Server port |

## API Reference

### POST /api/compile

Compile Angular component source to Ivy AOT output.

#### Request

```json
{
  "componentTs": "string (required)",
  "templateHtml": "string (required)",
  "styleCss": "string (optional)",
  "angularVersionHint": "string (optional, e.g. '19')"
}
```

**componentTs** can be either:
- Full component source with `@Component` decorator and imports
- Just the class body (will be wrapped in a minimal component)

#### Success Response (200)

```json
{
  "ok": true,
  "files": [
    {
      "path": "dist/src/app/demo.component.js",
      "content": "// Compiled JavaScript with ɵɵdefineComponent..."
    }
  ],
  "diagnostics": []
}
```

#### Error Response (200)

```json
{
  "ok": false,
  "diagnostics": [
    {
      "message": "Error message",
      "file": "demo.component.ts",
      "line": 5,
      "col": 10,
      "category": "error"
    }
  ]
}
```

## Sample curl Requests

### Simple Component (class body only)

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "componentTs": "title = \"Hello World\"; count = 0; increment() { this.count++; }",
    "templateHtml": "<h1>{{ title }}</h1><p>Count: {{ count }}</p><button (click)=\"increment()\">+1</button>"
  }'
```

### Full Component Source

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "componentTs": "import { Component } from \"@angular/core\";\nimport { CommonModule } from \"@angular/common\";\n\n@Component({\n  selector: \"app-demo\",\n  standalone: true,\n  imports: [CommonModule],\n  templateUrl: \"./demo.component.html\",\n  styleUrls: [\"./demo.component.css\"]\n})\nexport class DemoComponent {\n  items = [\"Angular\", \"React\", \"Vue\"];\n}",
    "templateHtml": "<ul><li *ngFor=\"let item of items\">{{ item }}</li></ul>",
    "styleCss": "ul { list-style: none; } li { padding: 8px; }"
  }'
```

### With Styles

```bash
curl -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "componentTs": "message = \"Styled Component\";",
    "templateHtml": "<div class=\"box\">{{ message }}</div>",
    "styleCss": ".box { padding: 20px; background: #f0f0f0; border-radius: 8px; }"
  }'
```

### Health Check

```bash
curl http://localhost:3001/health
```

### API Info

```bash
curl http://localhost:3001/api
```

## Angular Frontend Service

An Angular service is provided at `apps/portfolio/src/app/services/compiler-api.service.ts`:

```typescript
import { CompilerApiService } from './services/compiler-api.service';

@Component({...})
export class MyComponent {
  private compiler = inject(CompilerApiService);

  async compileCode() {
    const result = await firstValueFrom(
      this.compiler.compile(
        'title = "Hello";',
        '<h1>{{ title }}</h1>',
        'h1 { color: blue; }'
      )
    );

    if (result.success) {
      console.log('Compiled:', result.compiledCode);
    } else {
      console.error('Errors:', result.errorMessage);
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Express Server (main.ts)                  │
│                    Port 3001                                 │
├─────────────────────────────────────────────────────────────┤
│  POST /api/compile                                          │
│    │                                                        │
│    ▼                                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           AotCompilerService                         │   │
│  │  - Validates request (size, security)                │   │
│  │  - Creates temp project directory                    │   │
│  │  - Writes Angular project files                      │   │
│  │  - Spawns worker process                             │   │
│  │  - Collects results                                  │   │
│  │  - Cleans up temp directory                          │   │
│  └────────────────────┬────────────────────────────────┘   │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Worker Process (worker.ts)                 │   │
│  │  - Runs in isolated child_process                    │   │
│  │  - Uses @angular/compiler-cli                        │   │
│  │  - 10 second timeout                                 │   │
│  │  - 192MB worker heap limit                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Temp Project Structure:                                    │
│  /tmp/ng-compile-{uuid}/                                    │
│    ├── tsconfig.json                                        │
│    ├── package.json                                         │
│    ├── node_modules/ → (symlink to workspace)               │
│    └── src/                                                 │
│        ├── main.ts                                          │
│        └── app/                                             │
│            ├── demo.component.ts                            │
│            ├── demo.component.html                          │
│            └── demo.component.css (optional)                │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### "Unable to connect to compiler API"
- Ensure the server is running: `npx nx serve angular-compiler-api`
- Check if port 3001 is available

### "Compilation timed out"
- The default timeout is 10 seconds
- Complex components may need more time
- Check for infinite loops in component code

### "CORS not allowed"
- The API accepts the deployed Angular compiler origin and listed localhost origins
- For other origins, update `allowedOrigins` in main.ts

### Worker errors
- Ensure `@angular/compiler-cli` is installed
- Check that TypeScript version is compatible with Angular version

## Deployed playground

https://angular-compiler.giorgi.app/ serves the UI and API on the same origin. It uses the pinned Angular 21 compiler; a version hint does not install another compiler. The standalone service and production-only dependencies are packaged before deployment. See [deployment notes](../../docs/EXTRA_APPS_DEPLOYMENT.md) for service limits and checks.

For the local editor, start the API and `npx nx serve angular-compiler-ui`, then open http://localhost:4202. The dev server proxies `/api` and `/health` to port 3001; production Nginx serves them on the playground's HTTPS origin.
