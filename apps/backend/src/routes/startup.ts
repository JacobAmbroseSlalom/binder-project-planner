import { Router } from 'express';

// Story 53: "Sync data across laptops via cloud-sync folder". Shared
// shape for `/startup/status`, reused by both the temporary pre-database
// "gate" app (server.ts, when launch-time confirmation is needed) and the
// real application (app.ts, which always reports no confirmation
// pending) - see createStartupRouter below for why the same routes are
// mounted on both.
export type StartupConfirmationReason = 'incomplete-directory' | 'other-machine-recent';

export interface StartupStatus {
  needsConfirmation: boolean;
  reason?: StartupConfirmationReason;
  otherMachine?: { machineId: string; updatedAt: string };
}

export interface StartupConfirmDecision {
  startFresh: boolean;
}

export interface CreateStartupRouterOptions {
  // Called on every `GET /startup/status` request rather than captured
  // once, since the gate app's state can change while it's up (e.g. once
  // the user's decision has been recorded but before the real app has
  // taken over the port yet).
  getStatus: () => StartupStatus;
  // Invoked for `POST /startup/confirm`. The real app (app.ts) passes a
  // no-op here - by definition it never has a pending confirmation to
  // resolve, but mounting the same two routes on both apps lets the
  // desktop app's launch-time polling hit one consistent endpoint pair
  // throughout the whole startup sequence, regardless of which app
  // instance is currently listening on the port.
  onConfirm: (decision: StartupConfirmDecision) => void;
}

export function createStartupRouter(options: CreateStartupRouterOptions): Router {
  const router = Router();

  router.get('/startup/status', (_request, response) => {
    response.status(200).json(options.getStatus());
  });

  router.post('/startup/confirm', (request, response) => {
    const body = request.body as { startFresh?: unknown } | undefined;
    options.onConfirm({ startFresh: body?.startFresh === true });
    response.status(200).json({ acknowledged: true });
  });

  return router;
}
