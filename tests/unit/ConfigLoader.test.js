import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from '../../src/config/ConfigLoader.js';

const TEMP_DIRS = [];

async function createConfigFile(source) {
  const dir = await mkdtemp(join(tmpdir(), 'alertengine-config-'));
  const file = join(dir, 'alertengine.config.js');
  TEMP_DIRS.push(dir);
  await writeFile(file, source, 'utf8');
  return file;
}

afterEach(async () => {
  while (TEMP_DIRS.length) {
    await rm(TEMP_DIRS.pop(), { recursive: true, force: true });
  }
});

describe('ConfigLoader', () => {
  it('merges remote rules and adapters into the local bootstrap config', async () => {
    const configPath = await createConfigFile(`
      export default {
        apiKey: 'test-key',
        remote: {
          endpoint: 'https://api.alertengine.dev',
          pollIntervalMs: 1000,
          fallbackToLocal: true,
        },
        watchers: [{ type: 'file', path: './app.log' }],
        rules: [{ name: 'local-rule', match: '/LOCAL/', cooldownMs: 0 }],
        adapters: [{ type: 'webhook', url: 'https://hooks.local.test' }],
        storage: {
          adapter: 'file',
          path: './history.ndjson',
          batchSize: 5,
          flushIntervalMs: 1000,
        },
      };
    `);

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rules: [{ name: 'remote-rule', match: '/ERROR/', cooldownMs: 0 }],
        adapters: [{ type: 'webhook', url: 'https://hooks.remote.test' }],
        plan: 'pro',
        limits: {
          watcherCount: 5,
          storageEnabled: true,
          storageRetentionDays: 30,
        },
      }),
    });

    const config = await loadConfig(configPath, { fetchImpl });

    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.alertengine.dev/v1/config');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
    expect(config.watchers).toHaveLength(1);
    expect(config.rules[0].name).toBe('remote-rule');
    expect(config.rules[0].match.test('ERROR boom')).toBe(true);
    expect(config.adapters[0].url).toBe('https://hooks.remote.test');
    expect(config.storage.path).toBe('./history.ndjson');
    expect(config.plan).toBe('pro');
  });

  it('falls back to the local config when remote fetch fails and fallback is enabled', async () => {
    const configPath = await createConfigFile(`
      export default {
        apiKey: 'test-key',
        remote: {
          endpoint: 'https://api.alertengine.dev',
          fallbackToLocal: true,
        },
        watchers: [{ type: 'file', path: './app.log' }],
        rules: [{ name: 'local-rule', match: '/LOCAL/', cooldownMs: 0 }],
        adapters: [{ type: 'webhook', url: 'https://hooks.local.test' }],
      };
    `);

    const config = await loadConfig(configPath, {
      fetchImpl: vi.fn().mockRejectedValue(new Error('network down')),
    });

    expect(config.rules[0].name).toBe('local-rule');
    expect(config.adapters[0].url).toBe('https://hooks.local.test');
  });

  it('throws when remote fetch fails and fallback is disabled', async () => {
    const configPath = await createConfigFile(`
      export default {
        apiKey: 'test-key',
        remote: {
          endpoint: 'https://api.alertengine.dev',
          fallbackToLocal: false,
        },
        watchers: [{ type: 'file', path: './app.log' }],
      };
    `);

    await expect(loadConfig(configPath, {
      fetchImpl: vi.fn().mockRejectedValue(new Error('network down')),
    })).rejects.toThrow('network down');
  });

  it('enforces remote plan limits after merging the runtime config', async () => {
    const configPath = await createConfigFile(`
      export default {
        apiKey: 'test-key',
        remote: {
          endpoint: 'https://api.alertengine.dev',
          fallbackToLocal: true,
        },
        watchers: [
          { type: 'file', path: './app.log' },
          { type: 'file', path: './worker.log' },
        ],
        storage: {
          adapter: 'file',
          path: './history.ndjson',
          retentionDays: 30,
          batchSize: 5,
          flushIntervalMs: 1000,
        },
      };
    `);

    await expect(loadConfig(configPath, {
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rules: [{ name: 'remote-rule', match: '/ERROR/', cooldownMs: 0 }],
          adapters: [],
          limits: {
            watcherCount: 1,
            storageEnabled: true,
            storageRetentionDays: 7,
          },
        }),
      }),
    })).rejects.toThrow('plan allows 1');
  });
});
