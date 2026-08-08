// This module is the frontend's single entry point for talking to the
// backend REST API (OpenAPI-first, per `packages/api-contract`). It's split
// into domain files (client/types/binders/cards/art/imports) purely to keep
// each file a manageable size; every call site continues to import from
// `@/lib/api` (this barrel) rather than reaching into the individual
// domain files directly.
export * from './client';
export * from './types';
export * from './binders';
export * from './cards';
export * from './art';
export * from './imports';
