// tests/helpers/testHarness.js
import { mkdtemp, appendFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { Monitor }      from '../../src/Monitor.js';
import { FileWatcher }  from '../../src/ingestion/FileWatcher.js';

export async function createHarness(rules, adapterStubs = []) {
  const dir  = await mkdtemp(join(tmpdir(), 'nodewatchr-'));
  const file = join(dir, 'test.log');

  // Write the file first so FileWatcher has something to stat
  await appendFile(file, '');

  const monitor = new Monitor({ rules, adapters: [] });
  // Inject stubs directly — bypass AdapterRegistry
  monitor.dispatcher = { dispatch: async (alert) => {
    for (const stub of adapterStubs) await stub(alert);
  }};

  const watcher = new FileWatcher(file);
  monitor.attachWatcher(watcher);
  await monitor.start();
  await watcher.start();

  return {
    monitor,
    writeLine: (line) => appendFile(file, line + '\n'),
    cleanup: async () => {
      monitor.stop();
      watcher.stop();
      await rm(dir, { recursive: true });
    },
  };
}