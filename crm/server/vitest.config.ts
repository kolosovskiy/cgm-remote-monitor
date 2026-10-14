import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://crm:crm@localhost:5432/crm_test', JWT_SECRET: 'test', LOG_LEVEL: 'silent', WEBHOOK_SECRET: 'wh-secret', BINOTEL_KEY: 'k', BINOTEL_SECRET: 's', TELEGRAM_BOT_TOKEN: '' },
  },
});
