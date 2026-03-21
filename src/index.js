// src/index.js
export { StreamWatcher }        from './ingestion/StreamWatcher.js';
export { FileWatcher }          from './ingestion/FileWatcher.js';
export { loadConfig }           from './config/ConfigLoader.js';
export { loadLocalConfig }      from './config/ConfigLoader.js';
export { resolveConfig }        from './config/ConfigLoader.js';
export { fetchRemoteConfig }    from './config/ConfigLoader.js';
export { ConfigWatcher }        from './config/ConfigWatcher.js';
export { Monitor }              from './Monitor.js';
export { StorageSink }          from './storage/StorageSink.js';
export { FileStorageAdapter }   from './storage/FileStorageAdapter.js';
export { WebhookAdapter }       from './adapters/WebhookAdapter.js';

// Context lines & request middleware
export { createAlertEngine }    from './middleware/createAlertEngine.js';
export { RequestMonitor }       from './middleware/RequestMonitor.js';
export { LogInterceptor }       from './middleware/LogInterceptor.js';
export { requestContext, getCurrentRequestId } from './middleware/RequestContext.js';
export {
  buildRequestAlertRule,
  requestAlertToLogAlert,
} from './middleware/RequestAlertAdapter.js';
