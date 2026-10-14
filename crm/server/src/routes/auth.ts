import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { PERMISSIONS, can } from '../lib/permissions.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !user.isActive || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Неверный email или пароль' });
    }
    const token = app.jwt.sign({ id: user.id, role: user.role, name: user.name }, { expiresIn: '30d' });
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role, locale: user.locale } };
  });

  app.get('/api/auth/me', { preHandler: app.authenticate }, async (req) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id }, select: { id: true, email: true, name: true, role: true, locale: true, binotelInternal: true } });
    const permissions = (Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).filter((p) => can(user.role, p));
    return { ...user, permissions };
  });
}
