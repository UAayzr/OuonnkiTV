import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      include: [
        'src/**/*.test.{ts,tsx}',
        'packages/cms-core/src/**/*.test.{ts,tsx}',
        'shared/**/*.test.{ts,tsx}',
        'api/**/*.test.{ts,tsx}',
        'functions/**/*.test.{ts,tsx}',
        'netlify/**/*.test.{ts,tsx}',
        'proxy-server.test.{ts,tsx}',
      ],
      setupFiles: ['./vitest.setup.ts'],
      clearMocks: true,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: './coverage',
      },
    },
  }),
)
