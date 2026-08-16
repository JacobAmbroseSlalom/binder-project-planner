// pokemontcg.io provider integration (story 43's second catalog/pricing
// provider), split into this focused-file `integrations/pokemontcg/`
// folder from what was previously one 668-line integrations/pokemontcg.ts
// file (story 48's "House cleaning"), following the same flat-domain-
// folder convention as routes/binders/, routes/cards/, etc. This barrel
// re-exports everything the rest of the app imports from
// `integrations/pokemontcg.js` today, so no call site needs to change
// beyond the import path itself.
export * from './catalogSearch.js';
export * from './errors.js';
export * from './imageDownload.js';
export * from './priceFetching.js';
export * from './types.js';
