CREATE TABLE `binder_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`binderId` text NOT NULL,
	`tag` text NOT NULL,
	`normalizedTag` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`binderId`) REFERENCES `binders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "binder_tag_length" CHECK(length("binder_tags"."tag") <= 30)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `binder_tags_binder_id_normalized_tag_unique` ON `binder_tags` (`binderId`,`normalizedTag`);