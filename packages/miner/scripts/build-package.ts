/**
 * Builds the npm package of the node client into `dist/`: one bundled ES module with the shared
 * code inlined, a manifest generated from this workspace's, the README and the license.
 *
 * Node does not run TypeScript from `node_modules`, so the package ships JavaScript. Publish from
 * `dist/`, never from the workspace, which stays private.
 */

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}dist/`;

interface WorkspaceManifest {
  name: string;
  version: string;
  description: string;
  license: string;
  engines: Record<string, string>;
  dependencies: Record<string, string>;
}

const workspace = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as WorkspaceManifest;

// Workspace packages are bundled in; everything else installs from the registry.
const runtime = Object.fromEntries(Object.entries(workspace.dependencies).filter(([name]) => !name.startsWith('@minera/')));
const external = [/^node:/, ...Object.keys(runtime).map((name) => new RegExp(`^${name}(/|$)`))];

rmSync(out, { recursive: true, force: true });
await build({
  input: `${root}src/cli.ts`,
  platform: 'node',
  external,
  output: { file: `${out}bin/rig.js`, format: 'esm' },
});

const manifest = {
  name: workspace.name,
  version: workspace.version,
  description: workspace.description,
  keywords: ['gpu', 'mining', 'node', 'inference', 'cli'],
  homepage: 'https://mineragpu.tech/docs/quickstart',
  bugs: 'https://github.com/mineragpu/minera/issues',
  repository: { type: 'git', url: 'git+https://github.com/mineragpu/minera.git', directory: 'packages/miner' },
  license: workspace.license,
  type: 'module',
  bin: { rig: 'bin/rig.js' },
  files: ['bin'],
  engines: workspace.engines,
  dependencies: runtime,
  publishConfig: { access: 'public' },
};

mkdirSync(out, { recursive: true });
writeFileSync(`${out}package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(`${root}README.md`, `${out}README.md`);
copyFileSync(`${root}../../LICENSE`, `${out}LICENSE`);
console.log(`Built ${manifest.name}@${manifest.version} in ${out}`);
