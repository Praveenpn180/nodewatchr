import { FileStorageAdapter } from './FileStorageAdapter.js';
import { StorageSink } from './StorageSink.js';

const BUILT_IN = {
  file: FileStorageAdapter,
};

const PACKAGE_ALIASES = {
  s3: '@alertengine-js/storage-s3',
  postgres: '@alertengine-js/storage-postgres',
  clickhouse: '@alertengine-js/storage-clickhouse',
};

export async function resolveStorageAdapter(storageConfig) {
  if (!storageConfig) return null;

  if (typeof storageConfig.writeBatch === 'function') {
    return storageConfig;
  }

  if (storageConfig.adapter && typeof storageConfig.adapter.writeBatch === 'function') {
    return storageConfig.adapter;
  }

  if (typeof storageConfig.adapter === 'function') {
    return new storageConfig.adapter(storageConfig);
  }

  let AdapterClass = BUILT_IN[storageConfig.adapter];

  if (!AdapterClass) {
    const packageName = PACKAGE_ALIASES[storageConfig.adapter] ?? storageConfig.adapter;
    const mod = await import(packageName).catch(() => {
      throw new Error(
        `Unknown storage adapter "${storageConfig.adapter}". ` +
        `Is it installed? Run: pnpm add ${packageName}`
      );
    });
    AdapterClass = mod.default ?? mod[Object.keys(mod)[0]];
  }

  return new AdapterClass(storageConfig);
}

export async function createStorageSink(storageConfig) {
  if (!storageConfig) return null;
  const adapter = await resolveStorageAdapter(storageConfig);
  return new StorageSink(adapter, storageConfig);
}
