import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { can } from '../src/lib/permissions.js';

let app: FastifyInstance;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
let stageId: string;
let pipelineId: string;

beforeAll(async () => {
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'ignore' });
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "Message","Conversation","Call","Task","Note","StageHistory","Lead","ContactIdentity","Contact","Stage","Pipeline","Automation","FieldDefinition","WebhookLog","Setting","MessageTemplate","User" CASCADE');
  const hash = await bcrypt.hash('x', 4);
  for (const role of ['ADMIN', 'DEVELOPER', 'MANAGER', 'OPERATOR'] as const) {
    const u = await prisma.user.create({ data: { email: `${role.toLowerCase()}@t.local`, name: role, role, passwordHash: hash } });
    ids[role] = u.id;
    tokens[role] = app.jwt.sign({ id: u.id, role, name: role });
  }
  const p = await prisma.pipeline.create({ data: { name: 'P', isDefault: true, stages: { create: [{ name: 'S', position: 0 }] } }, include: { stages: true } });
  pipelineId = p.id;
  stageId = p.stages[0].id;
});
const h = (role: string) => ({ authorization: `Bearer ${tokens[role]}` });

describe('матрица прав', () => {
  it('can() соответствует ролям', () => {
    expect(can('ADMIN', 'users.manage')).toBe(true);
    expect(can('DEVELOPER', 'users.manage')).toBe(false);
    expect(can('DEVELOPER', 'settings.manage')).toBe(true);
    expect(can('MANAGER', 'settings.manage')).toBe(false);
    expect(can('OPERATOR', 'leads.edit_any')).toBe(false);
    expect(can('MANAGER', 'leads.delete')).toBe(false);
  });

  it('пользователей создаёт только админ', async () => {
    const payload = { email: 'new@t.local', password: 'secret1', name: 'N' };
    expect((await app.inject({ method: 'POST', url: '/api/users', headers: h('DEVELOPER'), payload })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/users', headers: h('ADMIN'), payload })).statusCode).toBe(200);
  });

  it('воронки правит админ и программист, менеджер нет', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/pipelines', headers: h('MANAGER'), payload: { name: 'X' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/pipelines', headers: h('DEVELOPER'), payload: { name: 'X' } })).statusCode).toBe(200);
  });

  it('оператор правит только свои лиды и не может переназначать', async () => {
    const c = await prisma.contact.create({ data: { name: 'C' } });
    const mine = await prisma.lead.create({ data: { title: 'mine', contactId: c.id, pipelineId, stageId, ownerId: ids.OPERATOR } });
    const other = await prisma.lead.create({ data: { title: 'other', contactId: c.id, pipelineId, stageId, ownerId: ids.MANAGER } });
    const free = await prisma.lead.create({ data: { title: 'free', contactId: c.id, pipelineId, stageId } });
    expect((await app.inject({ method: 'PATCH', url: `/api/leads/${mine.id}`, headers: h('OPERATOR'), payload: { title: 'ok' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/leads/${other.id}`, headers: h('OPERATOR'), payload: { title: 'no' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: `/api/leads/${mine.id}`, headers: h('OPERATOR'), payload: { ownerId: ids.MANAGER } })).statusCode).toBe(403);
    // взять свободный лид себе можно
    expect((await app.inject({ method: 'PATCH', url: `/api/leads/${free.id}`, headers: h('OPERATOR'), payload: { ownerId: ids.OPERATOR } })).statusCode).toBe(200);
    // менеджер правит чужие
    expect((await app.inject({ method: 'PATCH', url: `/api/leads/${mine.id}`, headers: h('MANAGER'), payload: { title: 'by manager' } })).statusCode).toBe(200);
    // удаляет только админ
    expect((await app.inject({ method: 'DELETE', url: `/api/leads/${mine.id}`, headers: h('MANAGER') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/leads/${mine.id}`, headers: h('ADMIN') })).statusCode).toBe(200);
  });

  it('оператор при создании лида становится владельцем, даже если указал другого', async () => {
    const c = await prisma.contact.create({ data: { name: 'C' } });
    const res = await app.inject({ method: 'POST', url: '/api/leads', headers: h('OPERATOR'), payload: { contactId: c.id, ownerId: ids.MANAGER } });
    expect(res.json().ownerId).toBe(ids.OPERATOR);
  });

  it('язык интерфейса сохраняется в профиле', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/me', headers: h('OPERATOR'), payload: { locale: 'sk' } });
    expect(res.json().locale).toBe('sk');
    expect((await app.inject({ method: 'PATCH', url: '/api/me', headers: h('OPERATOR'), payload: { locale: 'de' } })).statusCode).toBe(400);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: h('OPERATOR') });
    expect(me.json().permissions).toContain('contacts.edit');
    expect(me.json().permissions).not.toContain('settings.manage');
  });
});
