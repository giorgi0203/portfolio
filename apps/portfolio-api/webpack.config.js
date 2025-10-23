const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/portfolio-api'),
    clean: true,
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: process.env.NODE_ENV === 'production',
      outputHashing: 'none',
      externalDependencies: "none",
      generatePackageJson: false, // We'll bundle everything - Fastify is simple!
      sourceMaps: process.env.NODE_ENV !== 'production',
    }),
  ],
  // Bundle everything - Fastify doesn't have complex dependencies like NestJS
  externals: {},
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
};
