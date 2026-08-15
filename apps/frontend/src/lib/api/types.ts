import type { components } from '@binder-project-planner/api-contract';

// Every backend schema type the frontend consumes, re-exported under this
// module's own names (rather than importing `components['schemas'][...]`
// at each call site) so callers depend on a stable local alias instead of
// the generated OpenAPI types module directly.
export type Binder = components['schemas']['Binder'];
export type BinderSummary = components['schemas']['BinderSummary'];
export type CreateBinderRequest = components['schemas']['CreateBinderRequest'];
export type UpdateBinderRequest = components['schemas']['UpdateBinderRequest'];
export type UpdateBinderResult = components['schemas']['UpdateBinderResult'];
export type ResizePreviewRequest = components['schemas']['ResizePreviewRequest'];
export type ResizePreviewResult = components['schemas']['ResizePreviewResult'];
export type Card = components['schemas']['Card'];
export type TcgDexCatalogCard = components['schemas']['TcgDexCatalogCard'];
export type CardSearchProvider = components['schemas']['CardSearchProvider'];
export type CardSearchLanguage = components['schemas']['CardSearchLanguage'];
export type CardSearchResponse = components['schemas']['CardSearchResponse'];
export type CardPositionUpdate = components['schemas']['CardPositionUpdate'];
export type BulkTargetPlacement = components['schemas']['BulkTargetPlacement'];
export type BulkCardOutcome = components['schemas']['BulkCardOutcome'];
export type Art = components['schemas']['Art'];
export type PlacementCoordinates = components['schemas']['PlacementCoordinates'];
export type BinderPreviewSpread = components['schemas']['BinderPreviewSpread'];
export type BinderPreviewCard = components['schemas']['BinderPreviewCard'];
export type BinderPreviewArt = components['schemas']['BinderPreviewArt'];
export type BinderPreview = components['schemas']['BinderPreview'];
export type ImportSummary = components['schemas']['ImportSummary'];
export type ImportValidateResponse = components['schemas']['ImportValidateResponse'];
export type ImportCommitResponse = components['schemas']['ImportCommitResponse'];
export type ArtPrintPageCountResult = components['schemas']['ArtPrintPageCountResult'];
export type FinanceSettings = components['schemas']['FinanceSettings'];
export type UpdateFinanceSettingsRequest = components['schemas']['UpdateFinanceSettingsRequest'];
export type TimeCostRateBasis = components['schemas']['TimeCostRateBasis'];
export type TimeCosts = components['schemas']['TimeCosts'];
export type BinderCostEntry = components['schemas']['BinderCostEntry'];
export type CreateBinderCostEntryRequest = components['schemas']['CreateBinderCostEntryRequest'];
export type UpdateBinderCostEntryRequest = components['schemas']['UpdateBinderCostEntryRequest'];
export type PrintingCostEntry = components['schemas']['PrintingCostEntry'];
export type CreatePrintingCostEntryRequest =
  components['schemas']['CreatePrintingCostEntryRequest'];
export type UpdatePrintingCostEntryRequest =
  components['schemas']['UpdatePrintingCostEntryRequest'];
export type HolographicPaperCostEntry = components['schemas']['HolographicPaperCostEntry'];
export type CreateHolographicPaperCostEntryRequest =
  components['schemas']['CreateHolographicPaperCostEntryRequest'];
export type UpdateHolographicPaperCostEntryRequest =
  components['schemas']['UpdateHolographicPaperCostEntryRequest'];
export type CardPriceVariant = components['schemas']['CardPriceVariant'];
export type CardPriceFetchResult = components['schemas']['CardPriceFetchResult'];
export type CardPriceUpdate = components['schemas']['CardPriceUpdate'];
export type CardPriceUpdateOutcome = components['schemas']['CardPriceUpdateOutcome'];
// Story 45's "What I'm Looking For" section.
export type WatchlistEntry = components['schemas']['WatchlistEntry'];
export type WatchlistEntryList = components['schemas']['WatchlistEntryList'];
export type BulkCreateWatchlistEntriesRequest =
  components['schemas']['BulkCreateWatchlistEntriesRequest'];
export type BulkWatchlistEntryOutcome = components['schemas']['BulkWatchlistEntryOutcome'];
export type BulkAddCardsToWatchlistOutcome =
  components['schemas']['BulkAddCardsToWatchlistOutcome'];
export type WatchlistEntryPriceFetchResult =
  components['schemas']['WatchlistEntryPriceFetchResult'];
export type WatchlistEntryPriceUpdate = components['schemas']['WatchlistEntryPriceUpdate'];
export type WatchlistEntryPriceUpdateOutcome =
  components['schemas']['WatchlistEntryPriceUpdateOutcome'];
// Story 52: persisted watchlist order + PDF export divider.
export type UpdateWatchlistEntryOrderRequest =
  components['schemas']['UpdateWatchlistEntryOrderRequest'];
export type UpdateWatchlistEntryOrderResponse =
  components['schemas']['UpdateWatchlistEntryOrderResponse'];
