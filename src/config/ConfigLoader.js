// src/config/ConfigLoader.js
import { z } from 'zod';
import { pathToFileURL } from 'url';

const RuleSchema = z.object({
  name: z.string(),
  match: z.union([
    z.instanceof(RegExp),
    z.string()
  ]).transform((val) => {
    if (val instanceof RegExp) return val;
    const flagMatch = val.match(/^\/(.+)\/([gimsuy]*)$/);
    if (flagMatch) return new RegExp(flagMatch[1], flagMatch[2]);
    return new RegExp(val);
  }),
  threshold: z.object({
    count: z.number().int().positive(),
    windowMs: z.number().positive(),
  }).optional(),
  rateThreshold: z.object({
    shortWindowMs: z.number().positive(),
    longWindowMs:  z.number().positive(),
    multiplier:    z.number().positive(),
  }).optional(),
  cooldownMs: z.number().positive().default(60_000),
  severity:   z.enum(['critical', 'warning', 'info']).optional(),
  templates:  z.record(z.string()).optional(),
  resetOnFire: z.boolean().default(true),
});

const AdapterSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('telegram'), token: z.string(), chatId: z.string(), template: z.string().optional() }),
  z.object({ type: z.literal('slack'),    webhookUrl: z.string().url(), template: z.string().optional() }),
  z.object({ type: z.literal('discord'),  webhookUrl: z.string().url(), template: z.string().optional() }),
  z.object({ type: z.literal('email'),    host: z.string(), port: z.number(), user: z.string(), pass: z.string(), from: z.string(), to: z.string() }),
]);

const WatcherSchema = z.object({
  type: z.enum(['stream', 'file']),
  path: z.string().optional(),
}).refine(
  w => w.type !== 'file' || w.path,
  { message: "File watcher requires 'path'" }
);


export const ConfigSchema = z.object({
  watchers: z.array(WatcherSchema).min(1),
  rules:    z.array(RuleSchema).min(1),
  adapters: z.array(AdapterSchema).min(1),
});

export async function loadConfig(configPath) {
  const url = pathToFileURL(configPath).href;
  const mod = await import(url);
  const raw = mod.default ?? mod;
  return ConfigSchema.parse(raw); // throws ZodError with field-level messages if invalid
}
