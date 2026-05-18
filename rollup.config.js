import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import postcss from 'rollup-plugin-postcss';
import dts from 'rollup-plugin-dts';

export default [
  // ── 1. JS bundle (CJS + ESM) ─────────────────────────────────────────────
  {
    input: 'src/index.ts',
    output: [
      {
        // FIX: .cjs extension so Node knows this is CommonJS even when
        // package.json has "type":"module"
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named',
      },
      {
        file: 'dist/index.esm.js',
        format: 'esm',
        sourcemap: true,
      },
    ],
    plugins: [
      peerDepsExternal(),
      resolve({
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declarationDir: 'dist/types',
        declaration: true,
        // Override for Rollup build only — "Bundler" in tsconfig is for
        // editor/type-check; Rollup's plugin needs classic "node" resolution
        compilerOptions: {
          moduleResolution: 'node',
        },
      }),
      // FIX: extract:true emits a standalone dist/index.css file.
      // inject:true bundles CSS into JS which breaks SSR and some bundlers.
      postcss({
        extract: 'index.css',
        minimize: true,
      }),
    ],
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  },

  // ── 2. Type declarations bundle ───────────────────────────────────────────
  {
    input: 'dist/types/index.d.ts',
    output: [{ file: 'dist/index.d.ts', format: 'esm' }],
    plugins: [dts()],
    external: [/\.css$/],
  },
];