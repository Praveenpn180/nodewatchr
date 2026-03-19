// src/config/ConfigLoader.js
import { z } from 'zod';
import { pathToFileURL } from 'url';

const RuleSchema = z.object({
  name: z.string(),
  match: z.union([z.instanceof(RegExp), z.string()]).transform((val) => {
    if (val instanceof RegExp) return val;
    return new RegExp(val);
  }),
  watchers: z.array(z.object({
  type: z.enum(['stream', 'file']),
  path: z.string().optional(),
})).refine((watchers) =>
  watchers.every(w => w.type !== 'file' || w.path),
  { message: "File watcher requires 'path'" }
),
  threshold: z
    .object({
      count: z.number().int().positive(),
      windowMs: z.number().positive(),
    })
    .optional(),
  cooldownMs: z.number().positive().default(60_000),
});

const AdapterSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('telegram'),
    token: z.string(),
    chatId: z.string(),
  }),
  z.object({ type: z.literal('slack'), webhookUrl: z.string().url() }),
  z.object({ type: z.literal('discord'), webhookUrl: z.string().url() }),
  z.object({
    type: z.literal('email'),
    host: z.string(),
    port: z.number(),
    from: z.string(),
    to: z.string(),
  }),
]);

export const ConfigSchema = z.object({
  rules: z.array(RuleSchema).min(1),
  adapters: z.array(AdapterSchema).min(1),
  watchers: z.array(
    z.object({
      type: z.enum(['stream', 'file']),
      path: z.string().optional(),
    }),
  ),
});

export async function loadConfig(configPath) {
  const url = pathToFileURL(configPath).href;
  const mod = await import(url);
  const raw = mod.default ?? mod;
  return ConfigSchema.parse(raw); // throws ZodError with field-level messages if invalid
}
