import { appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export class FileStorageAdapter {
  constructor(config) {
    this.config = config;
  }

  async writeBatch(batch) {
    await mkdir(dirname(this.config.path), { recursive: true });
    const payload = batch.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    await appendFile(this.config.path, payload, 'utf8');
  }
}
