import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, name: 'Адміністратор', role: 'ADMIN', locale: 'uk', passwordHash: await bcrypt.hash(adminPass, 10) },
    update: {},
  });

  if ((await prisma.pipeline.count()) === 0) {
    await prisma.pipeline.create({
      data: {
        name: 'Продаж послуг',
        isDefault: true,
        stages: {
          create: [
            { name: 'Нова заявка', position: 0, color: '#3b82f6' },
            { name: 'Кваліфікація', position: 1, color: '#8b5cf6' },
            { name: 'Розрахунок / КП', position: 2, color: '#f59e0b' },
            { name: 'Перемовини', position: 3, color: '#f97316' },
            { name: 'Успішно', position: 4, color: '#22c55e', isWon: true },
            { name: 'Відмова', position: 5, color: '#ef4444', isLost: true },
          ],
        },
      },
    });
  }

  if ((await prisma.fieldDefinition.count()) === 0) {
    await prisma.fieldDefinition.createMany({
      data: [
        { entity: 'LEAD', key: 'service', label: 'Послуга', type: 'SELECT', options: ['Доставка', 'Митне оформлення', 'Складське зберігання', 'Інше'], position: 0 },
        { entity: 'LEAD', key: 'route', label: 'Маршрут', type: 'TEXT', position: 1 },
        { entity: 'LEAD', key: 'next_contact', label: 'Наступний контакт', type: 'DATE', position: 2 },
        { entity: 'CONTACT', key: 'city', label: 'Місто', type: 'TEXT', position: 0 },
      ],
    });
  }

  if ((await prisma.automation.count()) === 0) {
    await prisma.automation.createMany({
      data: [
        { name: 'Новий лід: призначити менеджера по колу', trigger: 'lead.created', conditions: [], actions: [{ type: 'assign_round_robin' }], position: 0 },
        { name: 'Новий лід: задача звʼязатися за 1 годину', trigger: 'lead.created', conditions: [], actions: [{ type: 'create_task', title: 'Звʼязатися з клієнтом: {{contact.name}}', dueInHours: 1, assignToOwner: true }], position: 1 },
        { name: 'Пропущений дзвінок: задача передзвонити', trigger: 'call.missed', conditions: [], actions: [{ type: 'create_task', title: 'Передзвонити {{contact.name}} (пропущений)', dueInHours: 0.5, assignToOwner: true }], position: 2 },
        { name: 'Автовідповідь у месенджер', trigger: 'message.in', conditions: [{ field: 'message.channel', op: 'in', value: ['TELEGRAM', 'VIBER', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM'] }, { field: 'leadCreated', op: 'eq', value: 'true' }], actions: [{ type: 'reply_same_channel', text: 'Вітаємо! Ми отримали ваше звернення, менеджер відповість найближчим часом.' }], position: 3, enabled: false },
      ],
    });
  }
  console.log(`Seed done. Admin: ${adminEmail} / ${adminPass}`);
}

main().finally(() => prisma.$disconnect());
