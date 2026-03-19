// src/bootstrap.js
import { loadConfig }    from './config/ConfigLoader.js';
import { Monitor }       from './Monitor.js';
import { FileWatcher }   from './ingestion/FileWatcher.js';
import { StreamWatcher } from './ingestion/StreamWatcher.js';
import { ConfigWatcher } from './config/ConfigWatcher.js';

export async function bootstrap({ configPath, hotReload, deadLetterDir }) {
  const config  = await loadConfig(configPath);
  const monitor = await createMonitor(config, deadLetterDir);

  if (hotReload) {
    const cw = new ConfigWatcher(configPath);
    cw.on('reload', async (newConfig) => {
      console.log('[alertengine-js] config reloaded');
      await monitor.swapRules(newConfig.rules);
    });
    cw.on('error', (err) => {
      console.error('[alertengine-js] config reload failed:', err.message);
      // Keep running with the previous valid config
    });
    cw.start();
  }

  attachSignalHandlers(monitor);
  console.log(`[alertengine-js] watching ${config.watchers.length} source(s)`);
}

async function createMonitor(config, deadLetterDir) {
  const monitor = new Monitor({ ...config, dispatcher: { deadLetterDir } });
  await monitor.start();

  for (const w of config.watchers) {
    const watcher = w.type === 'file'
      ? new FileWatcher(w.path)
      : new StreamWatcher(process.stdin);
    monitor.attachWatcher(watcher);
    await watcher.start();
  }

  return monitor;
}

function attachSignalHandlers(monitor) {
  const shutdown = async (signal) => {
    console.log(`\n[alertengine-js] ${signal} received, shutting down…`);
    monitor.stop();
    process.exit(0);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
