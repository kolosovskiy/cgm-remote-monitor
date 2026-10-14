import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';

const select = { id: true, email: true, name: true, role: true, binotelInternal: true, isActive: true, createdAt: true };

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/users', { preHandler: app.authenticate }, async () => prisma.user.findMany({ select, orderBy: { name: 'asc' } }));

  app.post('/api/users', { preHandler: app.requireAdmin }, async (req) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().min(1), role: z.enum(['ADMIN', 'MANAGER']).default('MANAGER'), binotelInternal: z.string().optional() }).parse(req.body);
    return prisma.user.create({ data: { ...body, email: body.email.toLowerCase(), passwordHash: await bcrypt.hash(body.password, 10) }, select });
  });

  app.patch('/api/users/:id', { preHandler: app.requireAdmin }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1).optional(), role: z.enum(['ADMIN', 'MANAGER']).optional(), binotelInternal: z.string().nullable().optional(), isActive: z.boolean().optional(), password: z.string().min(6).optional() }).parse(req.body);
    const { password, ...rest } = body;
    return prisma.user.update({ where: { id }, data: { ...rest, ...(password && { passwordHash: await bcrypt.hash(password, 10) }) }, select });
  });
}
