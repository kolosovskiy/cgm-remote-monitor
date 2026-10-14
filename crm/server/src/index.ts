import { buildApp } from './app.js';
import { config } from './config.js';
import { startAutomationEngine, startOverdueWatcher } from './automation/engine.js';
import { startChannels, stopChannels } from './channels/registry.js';
import { prisma } from './db.js';

const app = await buildApp();
startAutomationEngine();
const overdue = startOverdueWatcher();
await startChannels();

await app.listen({ port: config.port, host: '0.0.0.0' });

const shutdown = async () => {
  clearInterval(overdue);
  await stopChannels();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
