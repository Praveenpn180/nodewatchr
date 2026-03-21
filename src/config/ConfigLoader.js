// src/config/ConfigLoader.js
import { z } from 'zod';
import { pathToFileURL } from 'url';

const BUILT_IN_ADAPTER_TYPES = new Set([
  'telegram',
  'slack',
  'discord',
  'email',
  'webhook',
]);

const BUILT_IN_STORAGE_ADAPTERS = new Set([
  'file',
]);

export const RuleSchema = z.object({
  name: z.string(),
  match: z.union([
    z.instanceof(RegExp),
    z.string(),
  ]).transform((value) => {
    if (value instanceof RegExp) return value;
    const flagMatch = value.match(/^\/(.+)\/([gimsuy]*)$/);
    if (flagMatch) return new RegExp(flagMatch[1], flagMatch[2]);
    return new RegExp(value);
  }),
  threshold: z.object({
    count: z.number().int().positive(),
    windowMs: z.number().positive(),
  }).optional(),
  rateThreshold: z.object({
    shortWindowMs: z.number().positive(),
    longWindowMs: z.number().positive(),
    multiplier: z.number().positive(),
  }).optional(),
  cooldownMs: z.number().min(0).default(60_000),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  templates: z.record(z.string()).optional(),
  resetOnFire: z.boolean().default(true),
  contextBefore: z.number().int().min(0).default(0),
  contextAfter: z.number().int().min(0).default(0),
});

const BuiltInAdapterSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('telegram'),
    token: z.string(),
    chatId: z.string(),
    template: z.string().optional(),
  }),
  z.object({
    type: z.literal('slack'),
    webhookUrl: z.string().url(),
    template: z.string().optional(),
  }),
  z.object({
    type: z.literal('discord'),
    webhookUrl: z.string().url(),
    template: z.string().optional(),
  }),
  z.object({
    type: z.literal('email'),
    host: z.string(),
    port: z.number(),
    user: z.string(),
    pass: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    type: z.literal('webhook'),
    url: z.string().url(),
    method: z.string().optional(),
    headers: z.record(z.string()).optional(),
    contentType: z.string().optional(),
    bodyTemplate: z.string().optional(),
    template: z.string().optional(),
  }),
]);

const CustomAdapterSchema = z.object({
  type: z.string().min(1),
}).passthrough().refine(
  config => !BUILT_IN_ADAPTER_TYPES.has(config.type),
  { message: 'Built-in adapter configs must include their required fields.' }
);

export const AdapterSchema = z.union([
  BuiltInAdapterSchema,
  CustomAdapterSchema,
]);

export const WatcherSchema = z.object({
  type: z.enum(['stream', 'file']),
  path: z.string().optional(),
}).refine(
  watcher => watcher.type !== 'file' || watcher.path,
  { message: "File watcher requires 'path'" }
);

const StorageCommonSchema = z.object({
  batchSize: z.number().int().positive().default(100),
  flushIntervalMs: z.number().positive().default(5_000),
  retentionDays: z.number().int().positive().optional(),
});

const FileStorageSchema = StorageCommonSchema.extend({
  adapter: z.literal('file'),
  path: z.string(),
});

const CustomStorageSchema = StorageCommonSchema.extend({
  adapter: z.string().min(1),
}).passthrough().refine(
  config => !BUILT_IN_STORAGE_ADAPTERS.has(config.adapter),
  { message: 'Built-in storage configs must include their required fields.' }
);

export const StorageSchema = z.union([
  FileStorageSchema,
  CustomStorageSchema,
]);

export const PlanLimitsSchema = z.object({
  watcherCount: z.number().int().positive().optional(),
  storageEnabled: z.boolean().optional(),
  storageRetentionDays: z.number().int().positive().optional(),
}).passthrough();

export const RemoteSchema = z.object({
  endpoint: z.string().url(),
  pollIntervalMs: z.number().positive().default(60_000),
  fallbackToLocal: z.boolean().default(true),
  headers: z.record(z.string()).optional(),
});

export const RemotePayloadSchema = z.object({
  rules: z.array(RuleSchema).min(1),
  adapters: z.array(AdapterSchema).default([]),
  storage: StorageSchema.optional(),
  plan: z.string().optional(),
  limits: PlanLimitsSchema.optional(),
}).passthrough();

export const LocalConfigSchema = z.object({
  apiKey: z.string().optional(),
  remote: RemoteSchema.optional(),
  watchers: z.array(WatcherSchema).min(1),
  rules: z.array(RuleSchema).optional(),
  adapters: z.array(AdapterSchema).default([]),
  storage: StorageSchema.optional(),
  plan: z.string().optional(),
  limits: PlanLimitsSchema.optional(),
}).superRefine((config, ctx) => {
  if (config.remote && !config.apiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['apiKey'],
      message: 'apiKey is required when remote config is enabled.',
    });
  }

  if (!config.remote && !config.rules?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rules'],
      message: 'At least one rule is required when remote config is not enabled.',
    });
  }
});

export const ConfigSchema = z.object({
  apiKey: z.string().optional(),
  remote: RemoteSchema.optional(),
  watchers: z.array(WatcherSchema).min(1),
  rules: z.array(RuleSchema).min(1),
  adapters: z.array(AdapterSchema).default([]),
  storage: StorageSchema.optional(),
  plan: z.string().optional(),
  limits: PlanLimitsSchema.optional(),
});

function appendConfigPath(endpoint) {
  const url = new URL(endpoint);
  const normalizedPath = url.pathname.replace(/\/$/, '');
  if (normalizedPath.endsWith('/v1/config')) {
    return url;
  }

  url.pathname = normalizedPath
    ? `${normalizedPath}/v1/config`
    : '/v1/config';

  return url;
}

function validatePlanLimits(config) {
  const limits = config.limits ?? {};

  if (
    typeof limits.watcherCount === 'number' &&
    config.watchers.length > limits.watcherCount
  ) {
    throw new Error(
      `Configured ${config.watchers.length} watcher(s), ` +
      `but plan allows ${limits.watcherCount}.`
    );
  }

  if (config.storage && limits.storageEnabled === false) {
    throw new Error('Storage is not enabled for the current plan.');
  }

  if (
    config.storage?.retentionDays &&
    typeof limits.storageRetentionDays === 'number' &&
    config.storage.retentionDays > limits.storageRetentionDays
  ) {
    throw new Error(
      `Storage retention of ${config.storage.retentionDays} day(s) exceeds ` +
      `the plan limit of ${limits.storageRetentionDays}.`
    );
  }

  return config;
}

function mergeConfig(localConfig, remoteConfig) {
  return {
    ...localConfig,
    ...remoteConfig,
    watchers: localConfig.watchers,
    rules: remoteConfig?.rules ?? localConfig.rules ?? [],
    adapters: remoteConfig?.adapters ?? localConfig.adapters ?? [],
    storage: remoteConfig?.storage ?? localConfig.storage,
    limits: {
      ...(localConfig.limits ?? {}),
      ...(remoteConfig?.limits ?? {}),
    },
  };
}

async function importConfigModule(configPath, { cacheBust = false } = {}) {
  const url = pathToFileURL(configPath);
  if (cacheBust) {
    url.searchParams.set('t', Date.now().toString());
  }

  const mod = await import(url.href);
  return mod.default ?? mod;
}

export async function loadLocalConfig(configPath, options = {}) {
  const raw = await importConfigModule(configPath, options);
  return LocalConfigSchema.parse(raw);
}

export async function fetchRemoteConfig(config, options = {}) {
  if (!config.remote) return null;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Remote config requires a global fetch implementation.');
  }

  const url = appendConfigPath(config.remote.endpoint);
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.remote.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Remote config request failed with status ${response.status}.`);
  }

  const body = await response.json();
  return RemotePayloadSchema.parse(body);
}

export async function resolveConfig(localConfig, options = {}) {
  let remoteConfig = null;

  if (localConfig.remote) {
    try {
      remoteConfig = await fetchRemoteConfig(localConfig, options);
    } catch (error) {
      if (!localConfig.remote.fallbackToLocal || options.allowRemoteFailureFallback === false) {
        throw error;
      }
    }
  }

  const merged = mergeConfig(localConfig, remoteConfig);
  return validatePlanLimits(ConfigSchema.parse(merged));
}

export async function loadConfig(configPath, options = {}) {
  const localConfig = await loadLocalConfig(configPath, options);
  return resolveConfig(localConfig, options);
}
