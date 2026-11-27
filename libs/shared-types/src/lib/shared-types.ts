export interface Project {
  id: number;
  title: string;
  description: string;
  technologies: string[];
  githubUrl?: string;
  liveUrl?: string;
  imageUrl?: string;
}

export interface Skill {
  id: number;
  name: string;
  category: string;
  level: number; // 1-100
}

export interface ContactRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactResponse {
  message: string;
  success: boolean;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

// Angular Compiler API Types
export interface CompileRequest {
  /** TypeScript source code for the component */
  componentTs: string;
  /** HTML template source */
  templateHtml: string;
  /** Optional CSS styles */
  styleCss?: string;
  /** Optional Angular version hint (e.g., "18", "19") */
  angularVersionHint?: string;
}

export interface CompilerDiagnostic {
  message: string;
  file?: string;
  line?: number;
  col?: number;
  category: 'error' | 'warning' | 'info';
}

/** Source-map v3 VLQ mappings. Only segments for the submitted component are exposed as editor links. */
export interface TemplateSourceMap {
  mappings: string;
  sourceIndex: number;
}

export interface CompiledFile {
  /** Relative path of the emitted file */
  path: string;
  /** File content */
  content: string;
  templateMap?: TemplateSourceMap;
}

export interface CompileSuccessResponse {
  ok: true;
  files: CompiledFile[];
  diagnostics: CompilerDiagnostic[];
}

export interface CompileErrorResponse {
  ok: false;
  diagnostics: CompilerDiagnostic[];
}

export type CompileResponse = CompileSuccessResponse | CompileErrorResponse;
