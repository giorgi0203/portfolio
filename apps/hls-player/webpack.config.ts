import { composePlugins, withNx,  } from '@nx/webpack';
import { withModuleFederation } from '@nx/angular/module-federation';
import { ModuleFederationConfig } from '@nx/module-federation';
import baseConfig from './module-federation.config';

console.log("webbsdasdasdda");

const config: ModuleFederationConfig = {
  ...baseConfig,
};

export default composePlugins(
  withNx(),
  withModuleFederation(config)
);
