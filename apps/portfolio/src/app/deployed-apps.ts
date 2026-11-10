import { projectCatalog } from 'shared-types';
export type { CatalogProject as DeployedApp } from 'shared-types';
/** The homepage and public API share one project catalog. */
export const deployedApps = projectCatalog;
