CREATE TABLE `binder_cost_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`priceCents` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`pages` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "binder_cost_entry_name_length" CHECK(length("binder_cost_entries"."name") <= 100),
	CONSTRAINT "binder_cost_entry_price_positive" CHECK("binder_cost_entries"."priceCents" > 0),
	CONSTRAINT "binder_cost_entry_dimension_range" CHECK("binder_cost_entries"."width" >= 1 AND "binder_cost_entries"."width" <= 8 AND "binder_cost_entries"."height" >= 1 AND "binder_cost_entries"."height" <= 8),
	CONSTRAINT "binder_cost_entry_pages_positive" CHECK("binder_cost_entries"."pages" > 0)
);
--> statement-breakpoint
CREATE TABLE `finance_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`wagePerHourCents` integer NOT NULL,
	`errorMarginPercent` integer NOT NULL,
	`designingReferenceMinutes` integer NOT NULL,
	`designingReferencePages` integer NOT NULL,
	`printingReferenceMinutes` integer NOT NULL,
	`printingReferencePages` integer NOT NULL,
	`applyingHolographicPaperReferenceMinutes` integer NOT NULL,
	`applyingHolographicPaperReferencePages` integer NOT NULL,
	`cuttingReferenceMinutes` integer NOT NULL,
	`cuttingReferencePages` integer NOT NULL,
	`placingReferenceMinutes` integer NOT NULL,
	`placingReferencePages` integer NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "finance_settings_singleton_id" CHECK("finance_settings"."id" = 'singleton'),
	CONSTRAINT "finance_settings_wage_per_hour_non_negative" CHECK("finance_settings"."wagePerHourCents" >= 0),
	CONSTRAINT "finance_settings_error_margin_range" CHECK("finance_settings"."errorMarginPercent" >= 0 AND "finance_settings"."errorMarginPercent" <= 100),
	CONSTRAINT "finance_settings_designing_rate_basis" CHECK("finance_settings"."designingReferenceMinutes" >= 0 AND "finance_settings"."designingReferencePages" > 0),
	CONSTRAINT "finance_settings_printing_rate_basis" CHECK("finance_settings"."printingReferenceMinutes" >= 0 AND "finance_settings"."printingReferencePages" > 0),
	CONSTRAINT "finance_settings_applying_holographic_paper_rate_basis" CHECK("finance_settings"."applyingHolographicPaperReferenceMinutes" >= 0 AND "finance_settings"."applyingHolographicPaperReferencePages" > 0),
	CONSTRAINT "finance_settings_cutting_rate_basis" CHECK("finance_settings"."cuttingReferenceMinutes" >= 0 AND "finance_settings"."cuttingReferencePages" > 0),
	CONSTRAINT "finance_settings_placing_rate_basis" CHECK("finance_settings"."placingReferenceMinutes" >= 0 AND "finance_settings"."placingReferencePages" > 0)
);
--> statement-breakpoint
-- Story 34's one-time singleton seed row, per its "Technical requirements":
-- wagePerHour = 0, errorMarginPercent = 10, and every time-cost category's
-- referenceMinutes = 0 / referencePages = 1 (never 0, to avoid a
-- division-by-zero rate). Deliberately hand-written here rather than as
-- named constants in the shared `defaults.ts` - see this table's own
-- schema.ts comment for why. `updatedAt` uses `strftime` (not
-- `CURRENT_TIMESTAMP`, whose default `YYYY-MM-DD HH:MM:SS` format fails the
-- OpenAPI contract's `date-time` format check) to produce an ISO-8601
-- string matching the app's own `Date#toISOString()` output.
INSERT INTO `finance_settings` (`id`, `wagePerHourCents`, `errorMarginPercent`, `designingReferenceMinutes`, `designingReferencePages`, `printingReferenceMinutes`, `printingReferencePages`, `applyingHolographicPaperReferenceMinutes`, `applyingHolographicPaperReferencePages`, `cuttingReferenceMinutes`, `cuttingReferencePages`, `placingReferenceMinutes`, `placingReferencePages`, `updatedAt`) VALUES ('singleton', 0, 10, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
--> statement-breakpoint
CREATE TABLE `holographic_paper_cost_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`priceCents` integer NOT NULL,
	`pagesIncluded` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "holographic_paper_cost_entry_name_length" CHECK(length("holographic_paper_cost_entries"."name") <= 100),
	CONSTRAINT "holographic_paper_cost_entry_price_positive" CHECK("holographic_paper_cost_entries"."priceCents" > 0),
	CONSTRAINT "holographic_paper_cost_entry_pages_included_positive" CHECK("holographic_paper_cost_entries"."pagesIncluded" > 0)
);
--> statement-breakpoint
CREATE TABLE `printing_cost_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pricePerPageCents` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "printing_cost_entry_name_length" CHECK(length("printing_cost_entries"."name") <= 100),
	CONSTRAINT "printing_cost_entry_price_per_page_positive" CHECK("printing_cost_entries"."pricePerPageCents" > 0)
);
--> statement-breakpoint
ALTER TABLE `binders` ADD `selectedBinderCostEntryId` text REFERENCES binder_cost_entries(id);--> statement-breakpoint
ALTER TABLE `binders` ADD `selectedPrintingCostEntryId` text REFERENCES printing_cost_entries(id);--> statement-breakpoint
ALTER TABLE `binders` ADD `selectedHolographicPaperCostEntryId` text REFERENCES holographic_paper_cost_entries(id);--> statement-breakpoint
ALTER TABLE `binders` ADD `cachedArtPrintPageCount` integer;--> statement-breakpoint
ALTER TABLE `binders` ADD `cachedArtPrintPlacedArtCount` integer;--> statement-breakpoint
ALTER TABLE `binders` ADD `cachedArtPrintMaxArtUpdatedAt` text;--> statement-breakpoint
ALTER TABLE `binders` ADD `cachedArtPrintBinderUpdatedAt` text;