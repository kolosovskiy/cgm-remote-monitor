import type { Channel } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ChannelAdapter } from './types.js';
import { websiteChannel } from './website.js';
import { binotelChannel } from './binotel.js';
import { telegramChannel } from './telegram.js';
import { metaChannel, instagramChannel } from './meta.js';
import { whatsappChannel } from './whatsapp.js';
import { viberChannel } from './viber.js';
import { emailChannel } from './email.js';

const adapters: ChannelAdapter[] = [
  websiteChannel,
  binotelChannel,
  telegramChannel,
  metaChannel,
  instagramChannel,
  whatsappChannel,
  viberChannel,
  emailChannel,
];

export function getChannel(type: Channel): ChannelAdapter | undefined {
  return adapters.find((a) => a.type === type);
}

export function listChannels() {
  return adapters.map((a) => ({ type: a.type, configured: a.isConfigured(), canSend: !!a.send }));
}

export async function registerChannels(app: FastifyInstance) {
  for (const a of adapters) {
    if (a.registerRoutes) await a.registerRoutes(app);
  }
}

export async function startChannels() {
  for (const a of adapters) {
    if (a.isConfigured() && a.start) {
      try {
        await a.start();
      } catch (err) {
        console.error(`[channels] ${a.type} failed to start`, err);
      }
    }
  }
}

export async function stopChannels() {
  for (const a of adapters) if (a.stop) await a.stop();
}
