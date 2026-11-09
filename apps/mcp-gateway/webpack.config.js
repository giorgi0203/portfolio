const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/mcp-gateway'),
    clean: true,
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: [],
      optimization: process.env.NODE_ENV === 'production',
      outputHashing: 'none',
      externalDependencies: 'none',
      generatePackageJson: false,
      sourceMaps: process.env.NODE_ENV !== 'production',
    }),
  ],
  externals: {},
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
};
