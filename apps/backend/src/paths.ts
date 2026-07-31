import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const migrationsDirectory = resolve(backendDirectory, 'drizzle');
export const openApiSpecificationPath = resolve(
  backendDirectory,
  '../../packages/api-contract/openapi.yaml',
);
