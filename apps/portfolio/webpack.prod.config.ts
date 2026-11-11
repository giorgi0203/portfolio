import { withModuleFederation } from '@nx/module-federation/angular';
import config from './module-federation.config';

export default withModuleFederation(config, { dts: false }).then(
  (withFederation) => (webpackConfig) => {
    const result = withFederation(webpackConfig);
    // Shared RxJS modules occur in multiple federation runtime chunks. Keep
    // their exports consistent instead of pruning them per runtime.
    result.optimization = {
      ...result.optimization,
      usedExports: false,
      providedExports: false,
      sideEffects: false,
      concatenateModules: false,
    };
    return result;
  },
);
