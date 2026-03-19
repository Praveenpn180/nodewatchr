import { describe, it, expect } from 'vitest';
import { PassThrough } from 'stream';
import { StreamWatcher } from '../src/ingestion/StreamWatcher.js';

describe('StreamWatcher', () => {
  it('should emit lines', async () => {
    const stream = new PassThrough();
    const watcher = new StreamWatcher(stream).start();

    const lines = [];
    watcher.on('line', (data) => lines.push(data.line));

    stream.write('hello\n');
    stream.write('world\n');

    await new Promise(r => setTimeout(r, 50));

    expect(lines).toEqual(['hello', 'world']);
  });
});