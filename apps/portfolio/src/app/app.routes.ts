import { Route } from '@angular/router';
import { loadRemote } from '@module-federation/enhanced/runtime';
import { App } from './app';
import { HomeComponent } from './home/home.component';

export const appRoutes: Route[] = [
  {
    path: '',
    component: App,
    children: [
      {
        path: '',
        component: HomeComponent,
      },
      {
        path: 'hls-player',
        loadChildren: () =>
          loadRemote<typeof import('hls-player/Routes')>(
            'hls-player/Routes',
          ).then((m) => m!.remoteRoutes),
      },
      {
        path: 'angular-playground',
        loadChildren: () =>
          loadRemote<typeof import('angular_playground/Routes')>(
            'angular_playground/Routes',
          ).then((m) => m!.remoteRoutes),
      },
    ],
  },
];
