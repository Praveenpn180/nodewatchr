// src/middleware/RequestContext.js
import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';

export const requestContext = new AsyncLocalStorage();

export function getCurrentRequestId() {
  return requestContext.getStore()?.requestId ?? null;
}

export function createRequestId() {
  return randomBytes(8).toString('hex');
}
