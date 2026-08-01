CREATE TABLE `card_image_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`providerCardId` text,
	`providerSetId` text,
	`storageFilename` text NOT NULL,
	`contentType` text NOT NULL,
	`fileExtension` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_image_assets_provider_card_id_unique` ON `card_image_assets` (`providerCardId`);--> statement-breakpoint
CREATE TABLE `cards` (
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
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`binderId`) REFERENCES `binders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`imageAssetId`) REFERENCES `card_image_assets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "card_placement_all_or_none" CHECK(("cards"."physicalPage" IS NULL AND "cards"."row" IS NULL AND "cards"."column" IS NULL) OR ("cards"."physicalPage" IS NOT NULL AND "cards"."row" IS NOT NULL AND "cards"."column" IS NOT NULL)),
	CONSTRAINT "card_source_valid" CHECK("cards"."source" IN ('tcgdex', 'custom')),
	CONSTRAINT "card_tcgdex_identity_required" CHECK(("cards"."source" != 'tcgdex') OR ("cards"."providerCardId" IS NOT NULL AND "cards"."providerSetId" IS NOT NULL)),
	CONSTRAINT "card_custom_identity_absent" CHECK(("cards"."source" != 'custom') OR ("cards"."providerCardId" IS NULL AND "cards"."providerSetId" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_binder_placement_unique` ON `cards` (`binderId`,`physicalPage`,`row`,`column`);