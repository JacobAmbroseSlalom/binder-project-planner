import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const migrationsDirectory = resolve(backendDirectory, 'drizzle');
export const openApiSpecificationPath = resolve(
  backendDirectory,
  '../../packages/api-contract/openapi.yaml',
);

// Where downloaded/uploaded card and art image bytes are stored (story 11:
// "Select a card for a binder slot"), nested under the configured
// application data directory alongside the SQLite database file.
export function getImagesDirectory(applicationDataDirectory: string): string {
  return resolve(applicationDataDirectory, 'images');
}
