import getPort from 'get-port';

// Story 47: "Package and export the application as an executable". Tries
// the app's fixed default port first (`DEFAULT_BACKEND_PORT` or
// `DEFAULT_FRONTEND_PORT`, per caller) and automatically falls back to
// another available port instead of failing to start when something else
// on the machine already holds that port.
export async function findAvailablePort(preferredPort: number): Promise<number> {
  return getPort({ port: [preferredPort] });
}
