ALTER TABLE `cards` ADD `priceCents` integer;--> statement-breakpoint
ALTER TABLE `cards` ADD `isManualPrice` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `priceUpdatedAt` text;