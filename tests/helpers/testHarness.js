import { appendFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Monitor } from '../../src/Monitor.js';
import { FileWatcher } from '../../src/ingestion/FileWatcher.js';

export async function createHarness(rules, adapterStubs = [], monitorOptions = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'alertengine-'));
  const file = join(dir, 'test.log');

  await appendFile(file, '');

  const monitor = new Monitor({ rules, adapters: [], ...monitorOptions });
  monitor.dispatcher = {
    dispatch: async (alert) => {
      await Promise.allSettled(adapterStubs.map(stub => stub(alert)));
    },
  };

  const watcher = new FileWatcher(file);
  monitor.attachWatcher(watcher);
  await monitor.start();
  await watcher.start();

  return {
    monitor,
    dir,
    file,
    writeLine: line => appendFile(file, `${line}\n`),
    cleanup: async () => {
      watcher.stop();
      await monitor.stop();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
