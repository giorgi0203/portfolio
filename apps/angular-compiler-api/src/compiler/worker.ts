/**
 * Angular AOT Compiler Worker
 *
 * This module runs in a child process to compile Angular components
 * using the @angular/compiler-cli programmatic API.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import type { CompilerDiagnostic, CompiledFile } from 'shared-types';

interface WorkerMessage {
  type: 'compile';
  projectDir: string;
}

interface WorkerResult {
  success: boolean;
  files: CompiledFile[];
  diagnostics: CompilerDiagnostic[];
}

function formatDiagnostic(diagnostic: ts.Diagnostic): CompilerDiagnostic {
  const message = ts.flattenDiagnosticMessageText(
    diagnostic.messageText,
    '\n'
  );
  let file: string | undefined;
  let line: number | undefined;
  let col: number | undefined;

  if (diagnostic.file && diagnostic.start !== undefined) {
    const { line: lineNum, character } =
      diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    file = path.basename(diagnostic.file.fileName);
    line = lineNum + 1;
    col = character + 1;
  }

  let category: 'error' | 'warning' | 'info' = 'error';
  if (diagnostic.category === ts.DiagnosticCategory.Warning) {
    category = 'warning';
  } else if (
    diagnostic.category === ts.DiagnosticCategory.Message ||
    diagnostic.category === ts.DiagnosticCategory.Suggestion
  ) {
    category = 'info';
  }

  return { message, file, line, col, category };
}

async function compile(projectDir: string): Promise<WorkerResult> {
  const diagnostics: CompilerDiagnostic[] = [];
  const files: CompiledFile[] = [];

  try {
    // Dynamically import Angular compiler CLI
    const ngCompiler = await import('@angular/compiler-cli');
    
    const tsConfigPath = path.join(projectDir, 'tsconfig.json');

    // Read and parse tsconfig
    const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
    if (configFile.error) {
      diagnostics.push(formatDiagnostic(configFile.error));
      return { success: false, files: [], diagnostics };
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      projectDir
    );

    if (parsedConfig.errors.length > 0) {
      for (const error of parsedConfig.errors) {
        diagnostics.push(formatDiagnostic(error));
      }
      return { success: false, files: [], diagnostics };
    }

    // Configure Angular compiler options
    const angularCompilerOptions = {
      ...parsedConfig.options,
      enableIvy: true,
      compilationMode: 'full' as const,
      strictTemplates: false,
      strictInjectionParameters: false,
      strictInputAccessModifiers: false,
      skipTemplateCodegen: false,
      flatModuleOutFile: undefined,
      declaration: false,
      declarationMap: false,
    };

    // Read Angular compiler configuration
    const ngConfig = ngCompiler.readConfiguration(tsConfigPath);

    // Create Angular compiler host
    const host = ts.createCompilerHost(angularCompilerOptions);
    
    // Store emitted files in memory
    const emittedFiles = new Map<string, string>();
    const originalWriteFile = host.writeFile;
    host.writeFile = (
      fileName: string,
      data: string,
      writeByteOrderMark: boolean,
      onError?: (message: string) => void,
      sourceFiles?: readonly ts.SourceFile[]
    ) => {
      const relativePath = path.relative(projectDir, fileName);
      emittedFiles.set(relativePath, data);
      // Also write to disk for Angular compiler
      if (originalWriteFile) {
        originalWriteFile(fileName, data, writeByteOrderMark, onError, sourceFiles);
      }
    };

    // Create program using Angular's createProgram
    const program = ngCompiler.createProgram({
      rootNames: ngConfig.rootNames,
      options: { ...ngConfig.options, ...angularCompilerOptions },
      host,
    });

    // Get all diagnostics
    const allDiagnostics = [
      ...program.getTsOptionDiagnostics(),
      ...program.getNgOptionDiagnostics(),
      ...program.getTsSyntacticDiagnostics(),
      ...program.getTsSemanticDiagnostics(),
      ...program.getNgSemanticDiagnostics(),
      ...program.getNgStructuralDiagnostics(),
    ];

    // Check for errors
    const errors = allDiagnostics.filter(
      (d) => d.category === ts.DiagnosticCategory.Error
    );

    for (const diag of allDiagnostics) {
      diagnostics.push(formatDiagnostic(diag));
    }

    if (errors.length > 0) {
      return { success: false, files: [], diagnostics };
    }

    // Emit the compiled code
    const emitResult = program.emit();

    // Add emit diagnostics
    for (const diag of emitResult.diagnostics || []) {
      diagnostics.push(formatDiagnostic(diag));
    }

    if (emitResult.emitSkipped) {
      return { success: false, files: [], diagnostics };
    }

    // Collect emitted JS files
    for (const [filePath, content] of emittedFiles) {
      if (filePath.endsWith('.js') && !filePath.includes('node_modules')) {
        files.push({ path: filePath, content });
      }
    }

    // Also read from dist directory if files weren't captured
    if (files.length === 0) {
      const distDir = path.join(projectDir, 'dist');
      if (fs.existsSync(distDir)) {
        collectJsFiles(distDir, projectDir, files);
      }
    }

    return { success: true, files, diagnostics };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    diagnostics.push({
      message: `Compilation error: ${errorMessage}`,
      category: 'error',
    });
    return { success: false, files: [], diagnostics };
  }
}

function collectJsFiles(
  dir: string,
  baseDir: string,
  files: CompiledFile[]
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(fullPath, baseDir, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const relativePath = path.relative(baseDir, fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      files.push({ path: relativePath, content });
    }
  }
}

// Handle messages from parent process
process.on('message', async (message: WorkerMessage) => {
  if (message.type === 'compile') {
    try {
      const result = await compile(message.projectDir);
      if (process.send) process.send(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const result: WorkerResult = {
        success: false,
        files: [],
        diagnostics: [{ message: errorMessage, category: 'error' }],
      };
      if (process.send) process.send(result);
    }
  }
});

// Signal ready
if (process.send) process.send({ type: 'ready' });
