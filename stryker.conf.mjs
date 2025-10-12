// @ts-check
/**
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress', 'dashboard'],
  testRunner: 'vitest',
  testRunnerNodeArgs: ['--max-old-space-size=4096'],
  coverageAnalysis: 'perTest',
  mutate: [
    'apps/portfolio/src/**/*.ts',
    '!apps/portfolio/src/**/*.spec.ts',
    '!apps/portfolio/src/**/*.config.ts',
    '!apps/portfolio/src/test-setup.ts',
    '!apps/portfolio/src/main.ts'
  ],
  checkers: ['typescript'],
  tsconfigFile: 'apps/portfolio/tsconfig.json',
  htmlReporter: {
    fileName: 'reports/mutation/stryker-report.html'
  },
  dashboard: {
    project: 'github.com/your-username/portfolio',
    version: 'main'
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 50
  },
  timeoutMS: 60000,
  timeoutFactor: 1.5,
  dryRunTimeoutMinutes: 5,
  // Disable mutators that are too aggressive or not useful for this project type
  mutator: {
    excludedMutations: [
      'StringLiteral', // Often creates false positives in Angular apps
      'ArrayDeclaration',
      'ObjectLiteral'
    ]
  },
  vitest: {
    configFile: 'apps/portfolio/vite.config.mts',
    dir: 'apps/portfolio'
  },
  // Memory optimization settings
  maxTestRunnerReuse: 0, // Restart test runners frequently to prevent memory leaks
  plugins: [
    '@stryker-mutator/vitest-runner',
    '@stryker-mutator/typescript-checker'
  ]
};
