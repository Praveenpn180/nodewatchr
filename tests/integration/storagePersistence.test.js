import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHarness } from '../helpers/testHarness.js';

describe('storage persistence', () => {
  let harness;
  const tempDirs = [];

  afterEach(async () => {
    await harness?.cleanup();
    harness = null;

    while (tempDirs.length) {
      await rm(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  async function createStoragePath() {
    const dir = await mkdtemp(join(tmpdir(), 'alertengine-storage-'));
    tempDirs.push(dir);
    return join(dir, 'alerts.ndjson');
  }

  it('persists fired alerts through the file storage adapter', async () => {
    const storagePath = await createStoragePath();
    harness = await createHarness(
      [{ name: 'persisted-alert', match: /ERROR/, cooldownMs: 0 }],
      [],
      {
        storage: {
          adapter: 'file',
          path: storagePath,
          batchSize: 1,
          flushIntervalMs: 10_000,
        },
      }
    );

    await harness.writeLine('ERROR stored alert');

    await vi.waitFor(async () => {
      const persisted = await readFile(storagePath, 'utf8');
      const lines = persisted.trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({
        line: 'ERROR stored alert',
        rule: { name: 'persisted-alert' },
      });
    }, { timeout: 2_000, interval: 50 });
  });

  it('flushes buffered alerts on shutdown even when the batch is not full', async () => {
    const storagePath = await createStoragePath();
    const fired = [];

    harness = await createHarness(
      [{ name: 'shutdown-flush', match: /FATAL/, cooldownMs: 0 }],
      [],
      {
        storage: {
          adapter: 'file',
          path: storagePath,
          batchSize: 10,
          flushIntervalMs: 60_000,
        },
      }
    );
    harness.monitor.on('alert', alert => fired.push(alert));

    await harness.writeLine('FATAL flush me on stop');
    await vi.waitFor(() => expect(fired).toHaveLength(1), {
      timeout: 2_000,
      interval: 50,
    });

    await expect(readFile(storagePath, 'utf8')).rejects.toThrow();

    await harness.cleanup();
    harness = null;

    const persisted = await readFile(storagePath, 'utf8');
    const lines = persisted.trim().split('\n').filter(Boolean);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      line: 'FATAL flush me on stop',
      rule: { name: 'shutdown-flush' },
    });
  });
});
