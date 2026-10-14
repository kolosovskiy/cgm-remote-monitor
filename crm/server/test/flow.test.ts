import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { events } from '../src/events.js';
import { startAutomationEngine } from '../src/automation/engine.js';
import bcrypt from 'bcryptjs';

let app: FastifyInstance;
let token: string;
let pipelineId: string;
let stages: { id: string; name: string }[];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "Message","Conversation","Call","Task","Note","StageHistory","Lead","ContactIdentity","Contact","Stage","Pipeline","Automation","FieldDefinition","WebhookLog","Setting","MessageTemplate","User" CASCADE');
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }, stdio: 'ignore' });
  app = await buildApp();
  startAutomationEngine();
});

afterAll(async () => {
  events.removeAll();
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await reset();
  const admin = await prisma.user.create({ data: { email: 'admin@test.local', name: 'Admin', role: 'ADMIN', passwordHash: await bcrypt.hash('secret1', 4), binotelInternal: '101' } });
  await prisma.user.create({ data: { email: 'm2@test.local', name: 'Manager 2', passwordHash: await bcrypt.hash('secret1', 4) } });
  const p = await prisma.pipeline.create({
    data: { name: 'Main', isDefault: true, stages: { create: [{ name: 'New', position: 0 }, { name: 'Work', position: 1 }, { name: 'Won', position: 2, isWon: true }, { name: 'Lost', position: 3, isLost: true }] } },
    include: { stages: { orderBy: { position: 'asc' } } },
  });
  pipelineId = p.id;
  stages = p.stages;
  token = app.jwt.sign({ id: admin.id, role: 'ADMIN', name: 'Admin' });
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe('авторизация', () => {
  it('логин выдаёт токен, без токена API закрыт', async () => {
    const bad = await app.inject({ method: 'GET', url: '/api/leads' });
    expect(bad.statusCode).toBe(401);
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@test.local', password: 'secret1' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeTruthy();
  });
});

describe('заявка с сайта', () => {
  it('создаёт контакт, лид в первом этапе и диалог', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhooks/website', headers: { 'x-webhook-secret': 'wh-secret' }, payload: { name: 'Иван', phone: '067 123 45 67', email: 'ivan@example.com', message: 'Нужна доставка', form: 'Главная' } });
    expect(res.statusCode).toBe(200);
    const leadId = res.json().leadId as string;
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { contact: { include: { identities: true } }, conversations: { include: { messages: true } } } });
    expect(lead.source).toBe('WEBSITE');
    expect(lead.stageId).toBe(stages[0].id);
    expect(lead.contact.name).toBe('Иван');
    expect(lead.contact.identities.map((i) => `${i.type}:${i.value}`).sort()).toEqual(['EMAIL:ivan@example.com', 'PHONE:380671234567']);
    expect(lead.conversations[0].messages[0].text).toBe('Нужна доставка');
  });

  it('отклоняет неверный секрет', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhooks/website', headers: { 'x-webhook-secret': 'wrong' }, payload: { phone: '0671234567' } });
    expect(res.statusCode).toBe(401);
  });

  it('повторная заявка с того же телефона не создаёт второй открытый лид', async () => {
    await app.inject({ method: 'POST', url: '/webhooks/website', headers: { 'x-webhook-secret': 'wh-secret' }, payload: { phone: '+380671234567', message: 'раз' } });
    await app.inject({ method: 'POST', url: '/webhooks/website', headers: { 'x-webhook-secret': 'wh-secret' }, payload: { phone: '067-123-45-67', message: 'два' } });
    expect(await prisma.contact.count()).toBe(1);
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.message.count()).toBe(2);
  });
});

describe('Binotel', () => {
  it('входящий пропущенный звонок создаёт лид, звонок и запускает автоматизацию с задачей', async () => {
    await prisma.automation.create({ data: { name: 'missed', trigger: 'call.missed', conditions: [], actions: [{ type: 'create_task', title: 'Перезвонить {{contact.name}}', dueInHours: 1 }] } });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/binotel/call-completed?secret=wh-secret',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'requestType=receiveCallCompleted&generalCallID=abc123&callType=0&internalNumber=101&externalNumber=0671234567&startTime=1700000000&billsec=0&waitsec=12&disposition=CANCEL',
    });
    expect(res.statusCode).toBe(200);
    await wait(150);
    const call = await prisma.call.findUniqueOrThrow({ where: { externalId: 'abc123' } });
    expect(call.status).toBe('MISSED');
    expect(call.direction).toBe('IN');
    expect(call.phone).toBe('380671234567');
    expect(call.userId).toBeTruthy();
    expect(call.leadId).toBeTruthy();
    const task = await prisma.task.findFirst();
    expect(task?.title).toBe('Перезвонить Без імені');
    expect(task?.leadId).toBe(call.leadId);
  });

  it('повторный вебхук того же звонка не дублирует запись', async () => {
    const body = 'generalCallID=dup1&callType=0&externalNumber=0671234567&startTime=1700000000&billsec=30&disposition=ANSWER';
    for (let i = 0; i < 2; i++) await app.inject({ method: 'POST', url: '/webhooks/binotel/call-completed?secret=wh-secret', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: body + '&linkToCallRecord=https://rec/1.mp3' });
    expect(await prisma.call.count()).toBe(1);
    expect((await prisma.call.findFirst())?.recordingUrl).toBe('https://rec/1.mp3');
  });
});

describe('воронка и автоматизации', () => {
  it('lead.created назначает менеджера по кругу, перенос в Won закрывает лид', async () => {
    await prisma.automation.create({ data: { name: 'rr', trigger: 'lead.created', conditions: [], actions: [{ type: 'assign_round_robin' }] } });
    const c = await app.inject({ method: 'POST', url: '/api/contacts', headers: auth(), payload: { name: 'Петр', identities: [{ type: 'PHONE', value: '0501112233' }] } });
    expect(c.statusCode).toBe(200);
    const l = await app.inject({ method: 'POST', url: '/api/leads', headers: auth(), payload: { contactId: c.json().id, title: 'Тест', ownerId: null } });
    expect(l.statusCode).toBe(200);
    await wait(150);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.json().id } });
    expect(lead.ownerId).toBeTruthy();

    const moved = await app.inject({ method: 'PATCH', url: `/api/leads/${lead.id}`, headers: auth(), payload: { stageId: stages[2].id } });
    expect(moved.json().status).toBe('WON');
    expect(await prisma.stageHistory.count({ where: { leadId: lead.id } })).toBe(2);
  });

  it('условие по источнику фильтрует правило', async () => {
    await prisma.automation.create({ data: { name: 'only tg', trigger: 'lead.created', conditions: [{ field: 'lead.source', op: 'eq', value: 'TELEGRAM' }], actions: [{ type: 'add_note', text: 'из телеграма' }] } });
    await app.inject({ method: 'POST', url: '/webhooks/website', headers: { 'x-webhook-secret': 'wh-secret' }, payload: { phone: '0671234567' } });
    await wait(150);
    expect(await prisma.note.count()).toBe(0);
  });
});

describe('контакты', () => {
  it('объединение дублей переносит лиды и идентификаторы', async () => {
    const a = await prisma.contact.create({ data: { name: 'A', identities: { create: [{ type: 'PHONE', value: '380671111111' }] } } });
    const b = await prisma.contact.create({ data: { name: 'B', identities: { create: [{ type: 'EMAIL', value: 'b@x.com' }] } } });
    await prisma.lead.create({ data: { title: 'L', contactId: b.id, pipelineId, stageId: stages[0].id } });
    const res = await app.inject({ method: 'POST', url: `/api/contacts/${a.id}/merge`, headers: auth(), payload: { otherId: b.id } });
    expect(res.statusCode).toBe(200);
    expect(res.json().identities).toHaveLength(2);
    expect(await prisma.contact.count()).toBe(1);
    expect((await prisma.lead.findFirst())?.contactId).toBe(a.id);
  });
});
