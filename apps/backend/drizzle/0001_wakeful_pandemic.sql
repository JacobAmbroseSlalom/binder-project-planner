CREATE TABLE `binders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalizedName` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`pages` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "binder_name_length" CHECK(length("binders"."name") <= 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `binders_normalizedName_unique` ON `binders` (`normalizedName`);