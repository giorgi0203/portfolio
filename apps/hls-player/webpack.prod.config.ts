import { composePlugins, withNx } from '@nx/webpack';
import { ModuleFederationConfig } from '@nx/module-federation';
import { withModuleFederation } from '@nx/angular/module-federation';

import baseConfig from './module-federation.config';

const prodConfig: ModuleFederationConfig = {
  ...baseConfig,
};

export default composePlugins(
  withNx(),
  withModuleFederation(prodConfig)
);
