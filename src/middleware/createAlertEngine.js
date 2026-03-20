// src/middleware/createAlertEngine.js
import { Monitor }        from '../Monitor.js';
import { LogInterceptor } from './LogInterceptor.js';
import { RequestMonitor } from './RequestMonitor.js';
import { FileWatcher }    from '../ingestion/FileWatcher.js';
import {
  buildRequestAlertRule,
  requestAlertToLogAlert,
} from './RequestAlertAdapter.js';

export async function createAlertEngine(config) {
  const {
    rules,
    adapters,
    request:     requestOpts = {},
    streams:     extraStreams = [],
    files        = [],
    passThrough  = true,
  } = config;

  const monitor = new Monitor({ rules, adapters });
  await monitor.start();

  const reqMonitor = requestOpts !== false
    ? new RequestMonitor(requestOpts)
    : null;

  const interceptor = new LogInterceptor({
    streams:    [process.stdout, process.stderr, ...extraStreams],
    passThrough,

    onLine: ({ line, timestamp }) => {
      monitor._ringBuffer.push({ line, timestamp });
      monitor.engine.evaluate({ line, timestamp });
      monitor.collector.collectLine({ line, timestamp });
    },

    onRequestLine: reqMonitor
      ? (entry) => reqMonitor.attachLine(entry)
      : undefined,
  });

  interceptor.install();

  if (reqMonitor) {
    const reqRule = buildRequestAlertRule(
      typeof requestOpts === 'object' ? requestOpts : {}
    );
    reqMonitor.on('request-alert', (requestAlert) => {
      const alert = requestAlertToLogAlert(requestAlert, reqRule);
      monitor.dispatcher.dispatch(alert);
    });
  }

  for (const filePath of files) {
    const watcher = new FileWatcher(filePath);
    monitor.attachWatcher(watcher);
    await watcher.start();
  }

  return {
    monitor,
    reqMonitor,
    interceptor,

    expressMiddleware: () => {
      if (!reqMonitor) throw new Error('Request monitoring is disabled (pass request: {} to enable)');
      return reqMonitor.express();
    },

    fastifyPlugin: () => {
      if (!reqMonitor) throw new Error('Request monitoring is disabled (pass request: {} to enable)');
      return reqMonitor.fastify();
    },

    stop: () => {
      interceptor.uninstall();
      monitor.stop();
    },
  };
}
