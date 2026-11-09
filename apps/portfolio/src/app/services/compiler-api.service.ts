import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import type {
  CompileRequest,
  CompileResponse,
  CompiledFile,
  CompilerDiagnostic,
} from 'shared-types';

/**
 * Result of a successful compilation
 */
export interface CompilationResult {
  success: true;
  files: CompiledFile[];
  /** First compiled JS file content (convenience) */
  compiledCode: string;
  diagnostics: CompilerDiagnostic[];
}

/**
 * Result of a failed compilation
 */
export interface CompilationError {
  success: false;
  diagnostics: CompilerDiagnostic[];
  errorMessage: string;
}

export type CompilationOutcome = CompilationResult | CompilationError;

/**
 * Angular service for interacting with the Angular Compiler API
 *
 * @example
 * ```typescript
 * const result = await firstValueFrom(
 *   compilerService.compile(
 *     'title = "Hello";',
 *     '<h1>{{ title }}</h1>'
 *   )
 * );
 * if (result.success) {
 *   console.log(result.compiledCode);
 * }
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class CompilerApiService {
  private readonly http = inject(HttpClient);

  /** Compiler API base URL */
  private readonly apiUrl = 'http://localhost:3001/api';

  /**
   * Compile Angular component source code to Ivy AOT output
   *
   * @param componentTs - TypeScript source code for the component class body
   *                      (can be full component with decorators or just class body)
   * @param templateHtml - HTML template source
   * @param styleCss - Optional CSS styles
   * @param angularVersionHint - Optional Angular version hint (e.g., "19")
   * @returns Observable that emits CompilationOutcome
   */
  compile(
    componentTs: string,
    templateHtml: string,
    styleCss?: string,
    angularVersionHint?: string
  ): Observable<CompilationOutcome> {
    const request: CompileRequest = {
      componentTs,
      templateHtml,
      styleCss,
      angularVersionHint,
    };

    return this.http.post<CompileResponse>(`${this.apiUrl}/compile`, request).pipe(
      map((response) => this.mapResponse(response)),
      catchError((error) => this.handleError(error))
    );
  }

  /**
   * Check if the compiler API is available
   */
  healthCheck(): Observable<boolean> {
    return this.http
      .get<{ status: string }>(`${this.apiUrl.replace('/api', '')}/health`)
      .pipe(
        map((response) => response.status === 'healthy'),
        catchError(() => [false])
      );
  }

  /**
   * Maps API response to CompilationOutcome
   */
  private mapResponse(response: CompileResponse): CompilationOutcome {
    if (response.ok) {
      // Find the main component JS file
      const componentFile = response.files.find(
        (f) =>
          f.path.includes('demo.component') ||
          f.path.includes('component') ||
          f.path.endsWith('.js')
      );

      return {
        success: true,
        files: response.files,
        compiledCode: componentFile?.content || '',
        diagnostics: response.diagnostics,
      };
    } else {
      const errorMessages = response.diagnostics
        .filter((d) => d.category === 'error')
        .map((d) => d.message);

      return {
        success: false,
        diagnostics: response.diagnostics,
        errorMessage: errorMessages.join('\n') || 'Compilation failed',
      };
    }
  }

  /**
   * Handles HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<CompilationOutcome> {
    let errorMessage = 'Failed to connect to compiler API';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Client error: ${error.error.message}`;
    } else if (error.status === 0) {
      errorMessage =
        'Unable to connect to compiler API. Is the server running on port 3001?';
    } else if (error.error?.diagnostics) {
      // Server returned error response
      return throwError(
        () =>
          ({
            success: false,
            diagnostics: error.error.diagnostics,
            errorMessage: error.error.diagnostics
              .map((d: CompilerDiagnostic) => d.message)
              .join('\n'),
          }) as CompilationError
      );
    } else {
      errorMessage = `Server error: ${error.status} ${error.statusText}`;
    }

    return throwError(
      () =>
        ({
          success: false,
          diagnostics: [{ message: errorMessage, category: 'error' }],
          errorMessage,
        }) as CompilationError
    );
  }
}
