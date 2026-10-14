import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, name: 'Администратор', role: 'ADMIN', passwordHash: await bcrypt.hash(adminPass, 10) },
    update: {},
  });

  if ((await prisma.pipeline.count()) === 0) {
    await prisma.pipeline.create({
      data: {
        name: 'Продажи услуг',
        isDefault: true,
        stages: {
          create: [
            { name: 'Новая заявка', position: 0, color: '#3b82f6' },
            { name: 'Квалификация', position: 1, color: '#8b5cf6' },
            { name: 'Расчёт / КП', position: 2, color: '#f59e0b' },
            { name: 'Переговоры', position: 3, color: '#f97316' },
            { name: 'Успешно', position: 4, color: '#22c55e', isWon: true },
            { name: 'Отказ', position: 5, color: '#ef4444', isLost: true },
          ],
        },
      },
    });
  }

  if ((await prisma.fieldDefinition.count()) === 0) {
    await prisma.fieldDefinition.createMany({
      data: [
        { entity: 'LEAD', key: 'service', label: 'Услуга', type: 'SELECT', options: ['Доставка', 'Таможенное оформление', 'Складское хранение', 'Другое'], position: 0 },
        { entity: 'LEAD', key: 'route', label: 'Маршрут', type: 'TEXT', position: 1 },
        { entity: 'LEAD', key: 'next_contact', label: 'Следующий контакт', type: 'DATE', position: 2 },
        { entity: 'CONTACT', key: 'city', label: 'Город', type: 'TEXT', position: 0 },
      ],
    });
  }

  if ((await prisma.automation.count()) === 0) {
    await prisma.automation.createMany({
      data: [
        { name: 'Новый лид: назначить менеджера по кругу', trigger: 'lead.created', conditions: [], actions: [{ type: 'assign_round_robin' }], position: 0 },
        { name: 'Новый лид: задача связаться за 1 час', trigger: 'lead.created', conditions: [], actions: [{ type: 'create_task', title: 'Связаться с клиентом: {{contact.name}}', dueInHours: 1, assignToOwner: true }], position: 1 },
        { name: 'Пропущенный звонок: задача перезвонить', trigger: 'call.missed', conditions: [], actions: [{ type: 'create_task', title: 'Перезвонить {{contact.name}} (пропущенный)', dueInHours: 0.5, assignToOwner: true }], position: 2 },
        { name: 'Автоответ в мессенджер', trigger: 'message.in', conditions: [{ field: 'message.channel', op: 'in', value: ['TELEGRAM', 'VIBER', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM'] }, { field: 'leadCreated', op: 'eq', value: 'true' }], actions: [{ type: 'reply_same_channel', text: 'Здравствуйте! Мы получили ваше обращение, менеджер ответит в ближайшее время.' }], position: 3, enabled: false },
      ],
    });
  }
  console.log(`Seed done. Admin: ${adminEmail} / ${adminPass}`);
}

main().finally(() => prisma.$disconnect());
