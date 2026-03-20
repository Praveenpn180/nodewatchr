// src/middleware/RequestAlertAdapter.js
export function buildRequestAlertRule(options = {}) {
  return {
    name:      options.name      ?? 'request-monitor',
    severity:  options.severity  ?? 'warning',
    templates: options.templates ?? {},
  };
}

export function requestAlertToLogAlert(requestAlert, rule) {
  const { method, path, statusCode, elapsedMs, logs, reason } = requestAlert;
  const summary = `${method} ${path} → ${statusCode} in ${elapsedMs}ms [${reason}]`;

  return {
    rule,
    line:        summary,
    timestamp:   requestAlert.finishedAt,
    count:       1,
    fingerprint: `req-${requestAlert.requestId}`,
    contextLines: [
      { line: summary, role: 'match', timestamp: requestAlert.finishedAt },
      ...logs.map(l => ({ line: l.line, role: 'after', timestamp: l.timestamp })),
    ],
    meta: requestAlert,
  };
}
