import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    // Vitest transforms with esbuild, which does NOT emit decorator metadata.
    // Without that metadata NestJS cannot resolve constructor dependencies and
    // every injected service arrives as `undefined`. SWC emits it correctly.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.spec.ts'],
    // Money tests share one database; running files in parallel would let one
    // suite's ledger writes leak into another's assertions.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['./test/global-setup.ts'],
  },
});
