PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`binderId` text NOT NULL,
	`name` text NOT NULL,
	`setName` text,
	`localNumber` text,
	`source` text NOT NULL,
	`providerCardId` text,
	`providerSetId` text,
	`variation` text,
	`physicalPage` integer,
	`row` integer,
	`column` integer,
	`imageAssetId` text NOT NULL,
	`acquired` integer DEFAULT false NOT NULL,
	`priceCents` integer,
	`isManualPrice` integer DEFAULT false NOT NULL,
	`priceUpdatedAt` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`binderId`) REFERENCES `binders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`imageAssetId`) REFERENCES `card_image_assets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "card_placement_all_or_none" CHECK(("__new_cards"."physicalPage" IS NULL AND "__new_cards"."row" IS NULL AND "__new_cards"."column" IS NULL) OR ("__new_cards"."physicalPage" IS NOT NULL AND "__new_cards"."row" IS NOT NULL AND "__new_cards"."column" IS NOT NULL)),
	CONSTRAINT "card_source_valid" CHECK("__new_cards"."source" IN ('tcgdex', 'pokemontcg', 'custom')),
	CONSTRAINT "card_provider_identity_required" CHECK(("__new_cards"."source" NOT IN ('tcgdex', 'pokemontcg')) OR ("__new_cards"."providerCardId" IS NOT NULL AND "__new_cards"."providerSetId" IS NOT NULL)),
	CONSTRAINT "card_custom_identity_absent" CHECK(("__new_cards"."source" != 'custom') OR ("__new_cards"."providerCardId" IS NULL AND "__new_cards"."providerSetId" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_cards`("id", "binderId", "name", "setName", "localNumber", "source", "providerCardId", "providerSetId", "variation", "physicalPage", "row", "column", "imageAssetId", "acquired", "priceCents", "isManualPrice", "priceUpdatedAt", "createdAt", "updatedAt") SELECT "id", "binderId", "name", "setName", "localNumber", "source", "providerCardId", "providerSetId", "variation", "physicalPage", "row", "column", "imageAssetId", "acquired", "priceCents", "isManualPrice", "priceUpdatedAt", "createdAt", "updatedAt" FROM `cards`;--> statement-breakpoint
DROP TABLE `cards`;--> statement-breakpoint
ALTER TABLE `__new_cards` RENAME TO `cards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `cards_binder_placement_unique` ON `cards` (`binderId`,`physicalPage`,`row`,`column`);--> statement-breakpoint
CREATE TABLE `__new_watchlist_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`cardId` text,
	`sortOrder` integer NOT NULL,
	`name` text,
	`setName` text,
	`localNumber` text,
	`source` text,
	`providerCardId` text,
	`providerSetId` text,
	`variation` text,
	`imageAssetId` text,
	`priceCents` integer,
	`isManualPrice` integer DEFAULT false NOT NULL,
	`priceUpdatedAt` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`cardId`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`imageAssetId`) REFERENCES `card_image_assets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "watchlist_entry_standalone_or_referenced" CHECK(("__new_watchlist_entries"."cardId" IS NULL AND "__new_watchlist_entries"."name" IS NOT NULL AND "__new_watchlist_entries"."imageAssetId" IS NOT NULL AND "__new_watchlist_entries"."source" IS NOT NULL) OR ("__new_watchlist_entries"."cardId" IS NOT NULL AND "__new_watchlist_entries"."name" IS NULL AND "__new_watchlist_entries"."imageAssetId" IS NULL AND "__new_watchlist_entries"."source" IS NULL)),
	CONSTRAINT "watchlist_entry_name_length" CHECK("__new_watchlist_entries"."name" IS NULL OR length("__new_watchlist_entries"."name") <= 100),
	CONSTRAINT "watchlist_entry_set_name_length" CHECK("__new_watchlist_entries"."setName" IS NULL OR length("__new_watchlist_entries"."setName") <= 100),
	CONSTRAINT "watchlist_entry_local_number_length" CHECK("__new_watchlist_entries"."localNumber" IS NULL OR length("__new_watchlist_entries"."localNumber") <= 50),
	CONSTRAINT "watchlist_entry_variation_length" CHECK("__new_watchlist_entries"."variation" IS NULL OR length("__new_watchlist_entries"."variation") <= 50),
	CONSTRAINT "watchlist_entry_source_valid" CHECK("__new_watchlist_entries"."source" IS NULL OR "__new_watchlist_entries"."source" IN ('tcgdex', 'pokemontcg', 'custom')),
	CONSTRAINT "watchlist_entry_provider_identity_required" CHECK("__new_watchlist_entries"."source" NOT IN ('tcgdex', 'pokemontcg') OR ("__new_watchlist_entries"."providerCardId" IS NOT NULL AND "__new_watchlist_entries"."providerSetId" IS NOT NULL)),
	CONSTRAINT "watchlist_entry_custom_identity_absent" CHECK("__new_watchlist_entries"."source" != 'custom' OR ("__new_watchlist_entries"."providerCardId" IS NULL AND "__new_watchlist_entries"."providerSetId" IS NULL)),
	CONSTRAINT "watchlist_entry_price_positive" CHECK("__new_watchlist_entries"."priceCents" IS NULL OR "__new_watchlist_entries"."priceCents" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_watchlist_entries`("id", "cardId", "sortOrder", "name", "setName", "localNumber", "source", "providerCardId", "providerSetId", "variation", "imageAssetId", "priceCents", "isManualPrice", "priceUpdatedAt", "createdAt", "updatedAt") SELECT "id", "cardId", "sortOrder", "name", "setName", "localNumber", "source", "providerCardId", "providerSetId", "variation", "imageAssetId", "priceCents", "isManualPrice", "priceUpdatedAt", "createdAt", "updatedAt" FROM `watchlist_entries`;--> statement-breakpoint
DROP TABLE `watchlist_entries`;--> statement-breakpoint
ALTER TABLE `__new_watchlist_entries` RENAME TO `watchlist_entries`;--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_entries_card_id_unique` ON `watchlist_entries` (`cardId`);--> statement-breakpoint
DROP INDEX `card_image_assets_provider_card_id_unique`;--> statement-breakpoint
ALTER TABLE `card_image_assets` ADD `source` text;--> statement-breakpoint
-- Backfills every pre-existing provider-sourced asset's new `source` column
-- to 'tcgdex', since every asset row created before this migration was
-- necessarily TCGdex-sourced (pokemontcg.io as a source didn't exist yet,
-- story 43) - without this, the new (source, providerCardId) dedupe lookup
-- below would never find these rows and would re-download duplicates.
-- Custom-upload rows (providerCardId already NULL) are left untouched.
UPDATE `card_image_assets` SET `source` = 'tcgdex' WHERE `providerCardId` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `card_image_assets_source_provider_card_id_unique` ON `card_image_assets` (`source`,`providerCardId`);