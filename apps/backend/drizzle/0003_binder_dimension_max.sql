PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_binders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalizedName` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`pages` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "binder_name_length" CHECK(length("__new_binders"."name") <= 100),
	CONSTRAINT "binder_dimension_max" CHECK("__new_binders"."width" <= 8 AND "__new_binders"."height" <= 8)
);
--> statement-breakpoint
INSERT INTO `__new_binders`("id", "name", "normalizedName", "width", "height", "pages", "createdAt", "updatedAt") SELECT "id", "name", "normalizedName", "width", "height", "pages", "createdAt", "updatedAt" FROM `binders`;--> statement-breakpoint
DROP TABLE `binders`;--> statement-breakpoint
ALTER TABLE `__new_binders` RENAME TO `binders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `binders_normalizedName_unique` ON `binders` (`normalizedName`);