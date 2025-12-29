import { ModuleFederationConfig } from '@nx/module-federation';

const config: ModuleFederationConfig = {
  name: 'hls-player',
  exposes: {
    './Routes': 'apps/hls-player/src/app/remote-entry/entry.routes.ts',
  },
};

export default config;
