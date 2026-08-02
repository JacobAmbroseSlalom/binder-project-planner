ALTER TABLE `card_image_assets` ADD `sha256Digest` text;--> statement-breakpoint
ALTER TABLE `card_image_assets` ADD `originalFilename` text;--> statement-breakpoint
CREATE UNIQUE INDEX `card_image_assets_sha256_digest_unique` ON `card_image_assets` (`sha256Digest`);