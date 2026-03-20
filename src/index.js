// src/index.js
export { StreamWatcher }        from './ingestion/StreamWatcher.js';
export { FileWatcher }          from './ingestion/FileWatcher.js';
export { loadConfig }           from './config/ConfigLoader.js';
export { Monitor }              from './Monitor.js';

// Context lines & request middleware
export { createAlertEngine }    from './middleware/createAlertEngine.js';
export { RequestMonitor }       from './middleware/RequestMonitor.js';
export { LogInterceptor }       from './middleware/LogInterceptor.js';
export { requestContext, getCurrentRequestId } from './middleware/RequestContext.js';
export {
  buildRequestAlertRule,
  requestAlertToLogAlert,
} from './middleware/RequestAlertAdapter.js';
