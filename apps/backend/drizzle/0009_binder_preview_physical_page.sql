PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_binders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalizedName` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`pages` integer NOT NULL,
	`widthPerSlotHundredths` integer NOT NULL,
	`widthBaseHundredths` integer NOT NULL,
	`heightPerSlotHundredths` integer NOT NULL,
	`heightBaseHundredths` integer NOT NULL,
	`borderColor` text NOT NULL,
	`borderRadiusHundredths` integer NOT NULL,
	`borderWidthHundredths` integer NOT NULL,
	`previewPhysicalPage` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "binder_name_length" CHECK(length("__new_binders"."name") <= 100),
	CONSTRAINT "binder_dimension_max" CHECK("__new_binders"."width" <= 8 AND "__new_binders"."height" <= 8),
	CONSTRAINT "binder_width_per_slot_positive" CHECK("__new_binders"."widthPerSlotHundredths" > 0),
	CONSTRAINT "binder_height_per_slot_positive" CHECK("__new_binders"."heightPerSlotHundredths" > 0),
	CONSTRAINT "binder_width_one_slot_positive" CHECK(("__new_binders"."widthPerSlotHundredths" + "__new_binders"."widthBaseHundredths") > 0),
	CONSTRAINT "binder_height_one_slot_positive" CHECK(("__new_binders"."heightPerSlotHundredths" + "__new_binders"."heightBaseHundredths") > 0),
	CONSTRAINT "binder_border_radius_range" CHECK("__new_binders"."borderRadiusHundredths" >= 0 AND "__new_binders"."borderRadiusHundredths" <= 10000),
	CONSTRAINT "binder_border_width_range" CHECK("__new_binders"."borderWidthHundredths" >= 0),
	CONSTRAINT "binder_border_color_format" CHECK("__new_binders"."borderColor" GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
	CONSTRAINT "binder_preview_physical_page_range" CHECK("__new_binders"."previewPhysicalPage" >= 1 AND "__new_binders"."previewPhysicalPage" <= ("__new_binders"."pages" * 2))
);
--> statement-breakpoint
INSERT INTO `__new_binders`("id", "name", "normalizedName", "width", "height", "pages", "widthPerSlotHundredths", "widthBaseHundredths", "heightPerSlotHundredths", "heightBaseHundredths", "borderColor", "borderRadiusHundredths", "borderWidthHundredths", "previewPhysicalPage", "createdAt", "updatedAt") SELECT "id", "name", "normalizedName", "width", "height", "pages", "widthPerSlotHundredths", "widthBaseHundredths", "heightPerSlotHundredths", "heightBaseHundredths", "borderColor", "borderRadiusHundredths", "borderWidthHundredths", 2, "createdAt", "updatedAt" FROM `binders`;--> statement-breakpoint
DROP TABLE `binders`;--> statement-breakpoint
ALTER TABLE `__new_binders` RENAME TO `binders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `binders_normalizedName_unique` ON `binders` (`normalizedName`);