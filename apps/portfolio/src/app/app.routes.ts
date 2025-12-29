import { Route } from '@angular/router';
import { loadRemoteModule } from '@nx/angular/mf';
import { App } from './app';

export const appRoutes: Route[] = [
  {
    path: '',
    component: App,
  },
  {
    path: 'hls-player',
    loadChildren: () =>
      loadRemoteModule('hls-player', './Routes').then((m) => m.remoteRoutes),
  },
];
