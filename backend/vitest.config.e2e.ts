import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

const testEnv = loadEnv({ path: '.env.test', override: true }).parsed ?? {};
Object.assign(process.env, testEnv); // for global-setup (runs in this process)

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: testEnv,
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false, // tests share one database
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
