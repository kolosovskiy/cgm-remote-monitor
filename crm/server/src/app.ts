import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import authPlugin from './plugins/auth.js';
import { HttpError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { contactRoutes } from './routes/contacts.js';
import { pipelineRoutes } from './routes/pipelines.js';
import { leadRoutes } from './routes/leads.js';
import { conversationRoutes } from './routes/conversations.js';
import { miscRoutes } from './routes/misc.js';
import { registerChannels } from './channels/registry.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  // Сырое тело нужно для проверки подписей Meta/Viber.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as typeof req & { rawBody: string }).rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error);
    }
  });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  await app.register(cors, { origin: true });
  await app.register(authPlugin);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Ошибка валидации', issues: err.issues });
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    const e = err as Error & { statusCode?: number; code?: string };
    if (e.code === 'P2025') return reply.code(404).send({ error: 'Запись не найдена' });
    app.log.error(err);
    return reply.code(e.statusCode ?? 500).send({ error: e.message ?? 'Internal error' });
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(contactRoutes);
  await app.register(pipelineRoutes);
  await app.register(leadRoutes);
  await app.register(conversationRoutes);
  await app.register(miscRoutes);
  await registerChannels(app);

  // Раздача собранного фронтенда (web/dist), если он есть.
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/webhooks')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
