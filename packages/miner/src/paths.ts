/**
 * Where the node client keeps its files: one per-user directory named after the brand.
 */

import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { BRAND } from '@dayagpu/shared';

export interface PathEnvironment {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  home: string;
}

export interface NodePaths {
  /** The per-user configuration directory. */
  directory: string;
  /** The node key. The only secret the client stores. */
  key: string;
  /** Non-secret settings: the network and coordinator URLs. */
  settings: string;
}

export function currentPathEnvironment(): PathEnvironment {
  return { platform: process.platform, env: process.env, home: homedir() };
}

export function configDirectory(environment: PathEnvironment): string {
  const name = BRAND.name.toLowerCase();
  if (environment.platform === 'win32') {
    const appData = environment.env['APPDATA'];
    const base = appData ? appData : win32.join(environment.home, 'AppData', 'Roaming');
    return win32.join(base, name);
  }
  const xdg = environment.env['XDG_CONFIG_HOME'];
  // The base directory spec says a relative value is invalid and must be ignored.
  if (xdg && posix.isAbsolute(xdg)) return posix.join(xdg, name);
  return posix.join(environment.home, '.config', name);
}

export function nodePaths(environment: PathEnvironment): NodePaths {
  const directory = configDirectory(environment);
  const join = environment.platform === 'win32' ? win32.join : posix.join;
  return {
    directory,
    key: join(directory, 'node-key.json'),
    settings: join(directory, 'settings.json'),
  };
}
