// src/plugins/esbuildPlugins.ts
import type { Plugin } from 'esbuild-wasm';

export function unpkgPathPlugin(): Plugin {
  return {
    name: 'unpkg-path-plugin',
    setup(build) {
      // 1) Handle our local files by namespace “file”
      build.onResolve({ filter: /^\/.*/ }, args => {
        return { path: args.path, namespace: 'file' };
      });
      // 2) Everything else (bare imports) goes to unpkg
      build.onResolve({ filter: /.*/ }, args => {
        return {
          path: `https://unpkg.com/${args.path}`,
          namespace: 'cdn',
        };
      });
    },
  };
}

export function unpkgFetchPlugin(inputFiles: Map<string, string>): Plugin {
  return {
    name: 'unpkg-fetch-plugin',
    setup(build) {
      // 1) Load our in-memory files
      build.onLoad({ filter: /.*/, namespace: 'file' }, args => {
        return {
          contents: inputFiles.get(args.path) || '',
          loader: args.path.endsWith('.css') ? 'css' : 'jsx',
        };
      });
      // 2) Fetch everything else from unpkg
      build.onLoad({ filter: /.*/, namespace: 'cdn' }, async args => {
        const res = await fetch(args.path);
        const text = await res.text();
        return {
          contents: text,
          loader: /\.css$/.test(args.path) ? 'css' : 'jsx',
        };
      });
    },
  };
}
