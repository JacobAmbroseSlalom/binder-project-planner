// pokemontcg.io provider errors (story 43), mirroring tcgdex.ts's own
// error classes so route handlers can branch on a consistent shape
// regardless of which provider a card search/price-fetch call went
// through.
export class PokemonTcgProviderError extends Error {
  constructor(
    message: string,
    public readonly isTimeout = false,
  ) {
    super(message);
    this.name = 'PokemonTcgProviderError';
  }
}

// Thrown when the caller's own request was aborted (client disconnect),
// mirroring `TcgDexAbortedError` - distinguishes "the client gave up" from
// an actual provider failure.
export class PokemonTcgAbortedError extends Error {
  constructor() {
    super('The upstream pokemontcg.io request was aborted.');
    this.name = 'PokemonTcgAbortedError';
  }
}
