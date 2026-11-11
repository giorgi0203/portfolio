/**
 * Angular AOT Compiler Service
 *
 * Orchestrates the compilation process:
 * 1. Creates temporary project directory
 * 2. Writes Angular project files
 * 3. Spawns worker process to compile
 * 4. Collects results and cleans up
 */

import { fork, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import type {
  CompileRequest,
  CompileResponse,
  CompiledFile,
  CompilerDiagnostic,
} from 'shared-types';
import {
  getTsConfigJson,
  getMainTs,
  getComponentTs,
  getPackageJson,
} from './templates';

const COMPILATION_TIMEOUT_MS = 10000; // 10 seconds
const MAX_INPUT_SIZE = 200 * 1024; // 200KB

interface WorkerResult {
  success: boolean;
  files: CompiledFile[];
  diagnostics: CompilerDiagnostic[];
}

export class AotCompilerService {
  private workerPath: string;

  constructor() {
    // Worker path will be resolved at runtime
    this.workerPath = path.join(__dirname, 'compiler', 'worker.js');
  }

  /**
   * Validates the compilation request
   */
  validateRequest(request: CompileRequest): CompilerDiagnostic[] {
    const diagnostics: CompilerDiagnostic[] = [];

    if (!request || typeof request !== 'object' || Array.isArray(request)) return [{message:'A JSON object is required',category:'error'}];
    if (typeof request.componentTs !== 'string' || !request.componentTs.trim()) diagnostics.push({message:'componentTs is required and must be a string',category:'error'});
    for (const key of ['templateHtml','styleCss','angularVersionHint'] as const) {
      if (request[key] !== undefined && typeof request[key] !== 'string') diagnostics.push({message:`${key} must be a string`,category:'error'});
    }
    if (diagnostics.length) return diagnostics;
    const complete = /@Component\s*\(/.test(request.componentTs);
    if (!complete && !request.templateHtml?.trim()) diagnostics.push({message:'templateHtml is required for a component class body',category:'error'});
    const size=Buffer.byteLength(request.componentTs+(request.templateHtml||'')+(request.styleCss||''),'utf8');
    if(size>MAX_INPUT_SIZE) diagnostics.push({message:'Source exceeds the 200 KB limit',category:'error'});

    return diagnostics;
  }

  /**
   * Compiles Angular component source code
   */
  async compile(request: CompileRequest): Promise<CompileResponse> {
    // Validate request
    const validationErrors = this.validateRequest(request);
    if (validationErrors.length > 0) {
      return { ok: false, diagnostics: validationErrors };
    }

    const projectDir = path.join(
      os.tmpdir(),
      `ng-compile-${randomUUID()}`
    );

    try {
      // Create project structure
      await this.createProjectStructure(projectDir, request);

      // Run compilation in worker process
      const result = await this.runCompilation(projectDir);

      if (result.success) {
        return {
          ok: true,
          files: result.files,
          diagnostics: result.diagnostics,
        };
      } else {
        return { ok: false, diagnostics: result.diagnostics };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        diagnostics: [{ message: errorMessage, category: 'error' }],
      };
    } finally {
      // Always clean up temporary directory
      await this.cleanup(projectDir);
    }
  }

  /**
   * Creates the temporary Angular project structure
   */
  private async createProjectStructure(
    projectDir: string,
    request: CompileRequest
  ): Promise<void> {
    const srcDir = path.join(projectDir, 'src');
    const appDir = path.join(srcDir, 'app');

    // Create directories
    fs.mkdirSync(appDir, { recursive: true });

    // Determine Angular version
    const angularVersion = '21';

    // Get the workspace node_modules path
    // In development, __dirname is in src/compiler, need to go up to workspace root
    // In production (bundled), __dirname is in dist/apps/angular-compiler-api
    let workspaceRoot = path.resolve(__dirname, '../../../../');
    let workspaceNodeModules = process.env.COMPILER_NODE_MODULES || path.join(__dirname, 'node_modules');
    if(!fs.existsSync(workspaceNodeModules)) workspaceNodeModules = path.join(workspaceRoot,'node_modules');
    
    // If that doesn't exist, try the production path
    if (!fs.existsSync(workspaceNodeModules)) {
      workspaceRoot = path.resolve(__dirname, '../../../');
      workspaceNodeModules = path.join(workspaceRoot, 'node_modules');
    }
    
    // Final fallback - look for node_modules relative to process.cwd()
    if (!fs.existsSync(workspaceNodeModules)) {
      workspaceNodeModules = path.join(process.cwd(), 'node_modules');
    }

    // Write tsconfig.json with the correct node_modules path
    fs.writeFileSync(
      path.join(projectDir, 'tsconfig.json'),
      getTsConfigJson(workspaceNodeModules)
    );

    // Write package.json
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      getPackageJson(angularVersion)
    );

    // Write main.ts
    fs.writeFileSync(path.join(srcDir, 'main.ts'), getMainTs(request.componentTs));

    // Write component file
    const hasStyles = !!request.styleCss;
    const isCompleteComponent = /@Component\s*\(/.test(request.componentTs);
    const componentContent = getComponentTs(
      request.componentTs,
      !isCompleteComponent && !!request.templateHtml,
      hasStyles && !isCompleteComponent
    );
    fs.writeFileSync(
      path.join(appDir, 'demo.component.ts'),
      componentContent
    );

    // Write template file only if needed (not for complete components)
    if (request.templateHtml) {
      fs.writeFileSync(
        path.join(appDir, 'demo.component.html'),
        request.templateHtml
      );
    }

    // Write styles file only if provided and not a complete component
    if (request.styleCss) {
      fs.writeFileSync(
        path.join(appDir, 'demo.component.css'),
        request.styleCss
      );
    }

    // Create symlink to node_modules from workspace root
    // This is needed for the Angular compiler to resolve modules at runtime
    const tempNodeModules = path.join(projectDir, 'node_modules');

    try {
      // Try symlink first (faster, works on Windows with junction)
      fs.symlinkSync(workspaceNodeModules, tempNodeModules, 'junction');
    } catch (err) {
      // Fallback: compilation relies on tsconfig paths
      console.warn(
        'Could not create symlink to node_modules:',
        err instanceof Error ? err.message : err
      );
    }
  }

  /**
   * Runs compilation in a worker process with timeout
   */
  private runCompilation(projectDir: string): Promise<WorkerResult> {
    return new Promise((resolve) => {
      let worker: ChildProcess | null = null;
      let timeoutId: NodeJS.Timeout | null = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (worker && !worker.killed) {
          worker.kill('SIGKILL');
        }
      };

      try {
        // Resolve worker path - handle both development and production
        let workerPath = path.join(__dirname, 'compiler', 'worker.js');
        if (!fs.existsSync(workerPath)) {
          workerPath = path.join(__dirname, 'worker.js');
        }

        worker = fork(workerPath, [], {
          cwd: projectDir,
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: {
            NODE_ENV: 'production',
            NODE_OPTIONS: '--max-old-space-size=192',
          },
        });

        // Set timeout
        timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve({
              success: false,
              files: [],
              diagnostics: [
                {
                  message: `Compilation timed out after ${COMPILATION_TIMEOUT_MS}ms`,
                  category: 'error',
                },
              ],
            });
          }
        }, COMPILATION_TIMEOUT_MS);

        worker.on('message', (message: unknown) => {
          if (resolved) return;

          const msg = message as { type?: string } & WorkerResult;

          if (msg.type === 'ready') {
            // Worker is ready, send compile command
            worker?.send({ type: 'compile', projectDir });
          } else if ('success' in msg) {
            resolved = true;
            cleanup();
            resolve(msg as WorkerResult);
          }
        });

        worker.on('error', (error) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve({
              success: false,
              files: [],
              diagnostics: [
                { message: `Worker error: ${error.message}`, category: 'error' },
              ],
            });
          }
        });

        worker.on('exit', (code) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve({
              success: false,
              files: [],
              diagnostics: [
                {
                  message: `Worker exited unexpectedly with code ${code}`,
                  category: 'error',
                },
              ],
            });
          }
        });
      } catch (error) {
        cleanup();
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        resolve({
          success: false,
          files: [],
          diagnostics: [{ message: errorMessage, category: 'error' }],
        });
      }
    });
  }

  /**
   * Cleans up temporary project directory
   */
  private async cleanup(projectDir: string): Promise<void> {
    try {
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(`Failed to cleanup ${projectDir}:`, error);
    }
  }
}

// Export singleton instance
export const aotCompiler = new AotCompilerService();
