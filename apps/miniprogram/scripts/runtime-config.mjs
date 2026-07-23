import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'miniprogram/config/runtime.config.ts');
const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const separator = value.indexOf('=');
  if (!value.startsWith('--') || separator < 3) throw new Error(`Invalid argument: ${value}`);
  return [value.slice(2, separator), value.slice(separator + 1)];
}));

const environment = args.environment ?? '';
const apiBaseUrl = args['api-base-url'] ?? '';
if (environment && !['development', 'staging', 'production'].includes(environment)) throw new Error('environment must be development, staging, or production');
if (apiBaseUrl) {
  const url = new URL(apiBaseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('api-base-url must use HTTP or HTTPS');
  if (environment === 'production' && url.protocol !== 'https:') throw new Error('production api-base-url must use HTTPS');
}

const next = `export const runtimeConfig = {\n  environment: ${JSON.stringify(environment)},\n  apiBaseUrl: ${JSON.stringify(apiBaseUrl.replace(/\/$/, ''))},\n} as const;\n`;
const current = await readFile(target, 'utf8');
if (current !== next) {
  const temporary = `${target}.tmp`;
  await writeFile(temporary, next, 'utf8');
  await rename(temporary, target);
}
console.log(apiBaseUrl ? `Configured ${environment} API: ${apiBaseUrl.replace(/\/$/, '')}` : 'Restored automatic runtime configuration');
