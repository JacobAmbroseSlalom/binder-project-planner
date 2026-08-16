import {
  POKEMONTCG_REQUEST_TIMEOUT_MS,
  POKEMONTCG_RETRY_DELAY_MS,
} from '@binder-project-planner/shared';

import { PokemonTcgAbortedError, PokemonTcgProviderError } from './errors.js';

export const API_BASE_URL = 'https://api.pokemontcg.io/v2';

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (header === null) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

// Waits `delayMs`, rejecting early (without ever resolving) if `signal` is
// aborted first, mirroring tcgdex.ts's own `delay` helper.
function delay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new PokemonTcgAbortedError());
      return;
    }

    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new PokemonTcgAbortedError());
      },
      { once: true },
    );
  });
}

// Performs one `fetch` bounded by `POKEMONTCG_REQUEST_TIMEOUT_MS` and the
// caller's own abort signal, retrying exactly once after a network error,
// timeout, 429, or 5xx response (never for other 4xx responses, since a 404
// is a meaningful "no match" result rather than a transient failure) -
// mirrors tcgdex.ts's `fetchWithRetry`. Sends the optional API key as
// pokemontcg.io's documented `X-Api-Key` header; the provider works
// unauthenticated but enforces a much lower rate limit without one.
export async function fetchWithRetry(
  url: string,
  apiKey: string | undefined,
  callerSignal: AbortSignal | undefined,
  attempt = 0,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), POKEMONTCG_REQUEST_TIMEOUT_MS);

  function abortListener() {
    timeoutController.abort();
  }
  callerSignal?.addEventListener('abort', abortListener);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: timeoutController.signal,
      headers: apiKey ? { 'X-Api-Key': apiKey } : undefined,
    });
  } catch {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortListener);

    if (callerSignal?.aborted) {
      throw new PokemonTcgAbortedError();
    }

    const isTimeout = timeoutController.signal.aborted;
    if (attempt === 0) {
      await delay(POKEMONTCG_RETRY_DELAY_MS, callerSignal ?? new AbortController().signal);
      return fetchWithRetry(url, apiKey, callerSignal, attempt + 1);
    }

    throw new PokemonTcgProviderError(
      isTimeout ? 'The pokemontcg.io request timed out.' : 'The pokemontcg.io request failed.',
      isTimeout,
    );
  }
  clearTimeout(timeout);
  callerSignal?.removeEventListener('abort', abortListener);

  if (response.ok || response.status === 404) {
    return response;
  }

  if (attempt === 0 && isRetryableStatus(response.status)) {
    const retryAfterMs = parseRetryAfterMs(response) ?? POKEMONTCG_RETRY_DELAY_MS;
    await delay(retryAfterMs, callerSignal ?? new AbortController().signal);
    return fetchWithRetry(url, apiKey, callerSignal, attempt + 1);
  }

  throw new PokemonTcgProviderError(`pokemontcg.io responded with status ${response.status}.`);
}
