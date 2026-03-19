#!/usr/bin/env node
// bin/nodewatchr.js
import { program } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootstrap } from '../src/bootstrap.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url))
);

program
  .name('nodewatchr')
  .version(version)
  .option('-c, --config <path>', 'config file path', './nodewatchr.config.js')
  .option('--no-hot-reload', 'disable hot config reload')
  .option('--dead-letter-dir <path>', 'directory for failed alerts', '.nodewatchr/failed')
  .parse();

const opts = program.opts();

await bootstrap({
  configPath:    resolve(opts.config),
  hotReload:     opts.hotReload,
  deadLetterDir: opts.deadLetterDir,
});