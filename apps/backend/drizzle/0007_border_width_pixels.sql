PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_art` (
	`id` text PRIMARY KEY NOT NULL,
	`binderId` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`widthSlots` integer NOT NULL,
	`heightSlots` integer NOT NULL,
	`physicalPage` integer,
	`row` integer,
	`column` integer,
	`imageAssetId` text NOT NULL,
	`imageRotationDegrees` integer DEFAULT 0 NOT NULL,
	`focalXTenThousandths` integer NOT NULL,
	`focalYTenThousandths` integer NOT NULL,
	`scaleXTenThousandths` integer NOT NULL,
	`scaleYTenThousandths` integer NOT NULL,
	`borderColor` text,
	`borderRadiusHundredths` integer,
	`borderWidthHundredths` integer,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`binderId`) REFERENCES `binders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`imageAssetId`) REFERENCES `art_image_assets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "art_placement_all_or_none" CHECK(("__new_art"."physicalPage" IS NULL AND "__new_art"."row" IS NULL AND "__new_art"."column" IS NULL) OR ("__new_art"."physicalPage" IS NOT NULL AND "__new_art"."row" IS NOT NULL AND "__new_art"."column" IS NOT NULL)),
	CONSTRAINT "art_width_slots_positive" CHECK("__new_art"."widthSlots" > 0),
	CONSTRAINT "art_height_slots_positive" CHECK("__new_art"."heightSlots" > 0),
	CONSTRAINT "art_rotation_valid" CHECK("__new_art"."imageRotationDegrees" IN (0, 90, 180, 270)),
	CONSTRAINT "art_scale_positive" CHECK("__new_art"."scaleXTenThousandths" > 0 AND "__new_art"."scaleYTenThousandths" > 0),
	CONSTRAINT "art_border_color_format" CHECK("__new_art"."borderColor" IS NULL OR "__new_art"."borderColor" GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
	CONSTRAINT "art_border_radius_range" CHECK("__new_art"."borderRadiusHundredths" IS NULL OR ("__new_art"."borderRadiusHundredths" >= 0 AND "__new_art"."borderRadiusHundredths" <= 10000)),
	CONSTRAINT "art_border_width_range" CHECK("__new_art"."borderWidthHundredths" IS NULL OR "__new_art"."borderWidthHundredths" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_art`("id", "binderId", "title", "description", "widthSlots", "heightSlots", "physicalPage", "row", "column", "imageAssetId", "imageRotationDegrees", "focalXTenThousandths", "focalYTenThousandths", "scaleXTenThousandths", "scaleYTenThousandths", "borderColor", "borderRadiusHundredths", "borderWidthHundredths", "createdAt", "updatedAt") SELECT "id", "binderId", "title", "description", "widthSlots", "heightSlots", "physicalPage", "row", "column", "imageAssetId", "imageRotationDegrees", "focalXTenThousandths", "focalYTenThousandths", "scaleXTenThousandths", "scaleYTenThousandths", "borderColor", "borderRadiusHundredths", "borderWidthHundredths", "createdAt", "updatedAt" FROM `art`;--> statement-breakpoint
DROP TABLE `art`;--> statement-breakpoint
ALTER TABLE `__new_art` RENAME TO `art`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
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
	CONSTRAINT "binder_border_color_format" CHECK("__new_binders"."borderColor" GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]')
);
--> statement-breakpoint
INSERT INTO `__new_binders`("id", "name", "normalizedName", "width", "height", "pages", "widthPerSlotHundredths", "widthBaseHundredths", "heightPerSlotHundredths", "heightBaseHundredths", "borderColor", "borderRadiusHundredths", "borderWidthHundredths", "createdAt", "updatedAt") SELECT "id", "name", "normalizedName", "width", "height", "pages", "widthPerSlotHundredths", "widthBaseHundredths", "heightPerSlotHundredths", "heightBaseHundredths", "borderColor", "borderRadiusHundredths", "borderWidthHundredths", "createdAt", "updatedAt" FROM `binders`;--> statement-breakpoint
DROP TABLE `binders`;--> statement-breakpoint
ALTER TABLE `__new_binders` RENAME TO `binders`;--> statement-breakpoint
CREATE UNIQUE INDEX `binders_normalizedName_unique` ON `binders` (`normalizedName`);