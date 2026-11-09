/**
 * Templates for generating minimal Angular project files
 */

export function getTsConfigJson(nodeModulesPath: string): string {
  // Use forward slashes for paths in tsconfig
  const nmPath = nodeModulesPath.replace(/\\/g, '/');
  
  return JSON.stringify(
    {
      compilerOptions: {
        baseUrl: '.',
        outDir: './dist',
        sourceMap: false,
        declaration: false,
        moduleResolution: 'node',
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        target: 'ES2022',
        module: 'ES2022',
        lib: ['ES2022', 'dom'],
        skipLibCheck: true,
        strict: false,
        noImplicitAny: false,
        noImplicitReturns: false,
        noFallthroughCasesInSwitch: false,
        useDefineForClassFields: false,
        forceConsistentCasingInFileNames: true,
        esModuleInterop: true,
        paths: {
          '@angular/*': [`${nmPath}/@angular/*`],
          'rxjs': [`${nmPath}/rxjs`],
          'rxjs/*': [`${nmPath}/rxjs/*`],
          'tslib': [`${nmPath}/tslib`],
          'zone.js': [`${nmPath}/zone.js`],
          'zone.js/*': [`${nmPath}/zone.js/*`],
        },
        typeRoots: [`${nmPath}/@types`],
      },
      angularCompilerOptions: {
        enableIvy: true,
        compilationMode: 'full',
        strictTemplates: false,
        strictInjectionParameters: false,
        strictInputAccessModifiers: false,
        flatModuleOutFile: null,
        strictNullInputBindings: false,
      },
      files: ['./src/main.ts', './src/app/demo.component.ts'],
    },
    null,
    2
  );
}

export function getMainTs(): string {
  return `import { bootstrapApplication } from '@angular/platform-browser';
import { DemoComponent } from './app/demo.component';

bootstrapApplication(DemoComponent).catch(err => console.error(err));
`;
}

export function getComponentTs(
  componentSource: string,
  hasTemplate: boolean,
  hasStyles: boolean
): string {
  // If user provides full component source, use it directly
  if (
    componentSource.includes('@Component') ||
    componentSource.includes('import')
  ) {
    return componentSource;
  }

  // Otherwise, wrap in a minimal component
  const templateUrl = hasTemplate ? `templateUrl: './demo.component.html',` : '';
  const styleUrl = hasStyles ? `styleUrls: ['./demo.component.css'],` : '';

  return `import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [CommonModule],
  ${templateUrl}
  ${styleUrl}
})
export class DemoComponent {
  ${componentSource}
}
`;
}

export function getPackageJson(angularVersion: string): string {
  return JSON.stringify(
    {
      name: 'temp-angular-compile',
      version: '1.0.0',
      private: true,
      type: 'module',
      dependencies: {
        '@angular/core': `^${angularVersion}.0.0`,
        '@angular/common': `^${angularVersion}.0.0`,
        '@angular/compiler': `^${angularVersion}.0.0`,
        '@angular/compiler-cli': `^${angularVersion}.0.0`,
        '@angular/platform-browser': `^${angularVersion}.0.0`,
        rxjs: '^7.8.0',
        tslib: '^2.6.0',
        typescript: '^5.4.0',
        'zone.js': '^0.14.0',
      },
    },
    null,
    2
  );
}
