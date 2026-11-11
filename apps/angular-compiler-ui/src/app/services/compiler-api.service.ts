import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError, timeout } from 'rxjs';
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
 */
@Injectable({
  providedIn: 'root',
})
export class CompilerApiService {
  private readonly http = inject(HttpClient);

  /** Compiler API base URL */
  private readonly apiUrl = '/api';

  /**
   * Compile Angular component source code to Ivy AOT output
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
      timeout(20000),
      map((response) => this.mapResponse(response)),
      catchError((error) => this.handleError(error))
    );
  }

  /**
   * Check if the compiler API is available
   */
  healthCheck(): Observable<boolean> {
    return this.http
      .get<{ status: string }>('/health')
      .pipe(
        timeout(5000),
        map((response) => response.status === 'healthy'),
        catchError(() => [false])
      );
  }

  /**
   * Maps API response to CompilationOutcome
   */
  private mapResponse(response: CompileResponse): CompilationOutcome {
    if (response.ok) {
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
      errorMessage = `Client error: ${error.error.message}`;
    } else if (error.status === 0) {
      errorMessage =
        'The compiler is unavailable. Please try again shortly.';
    } else if (error.error?.diagnostics) {
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
