import { registerRemotes } from '@module-federation/enhanced/runtime';

fetch('/module-federation.manifest.json')
  .then((res) => {
    if (!res.ok) {
      throw new Error('Unable to load remote manifest');
    }

    return res.json() as Promise<Record<string, string>>;
  })
  .then((manifest) =>
    Object.entries(manifest).map(([name, entry]) => ({ name, entry }))
  )
  .then((remotes) => registerRemotes(remotes))
  .then(() => import('./bootstrap'))
  .catch((err) => console.error(err));
