CREATE TABLE `art` (
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
	CONSTRAINT "art_placement_all_or_none" CHECK(("art"."physicalPage" IS NULL AND "art"."row" IS NULL AND "art"."column" IS NULL) OR ("art"."physicalPage" IS NOT NULL AND "art"."row" IS NOT NULL AND "art"."column" IS NOT NULL)),
	CONSTRAINT "art_width_slots_positive" CHECK("art"."widthSlots" > 0),
	CONSTRAINT "art_height_slots_positive" CHECK("art"."heightSlots" > 0),
	CONSTRAINT "art_rotation_valid" CHECK("art"."imageRotationDegrees" IN (0, 90, 180, 270)),
	CONSTRAINT "art_scale_positive" CHECK("art"."scaleXTenThousandths" > 0 AND "art"."scaleYTenThousandths" > 0),
	CONSTRAINT "art_border_color_format" CHECK("art"."borderColor" IS NULL OR "art"."borderColor" GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
	CONSTRAINT "art_border_radius_range" CHECK("art"."borderRadiusHundredths" IS NULL OR ("art"."borderRadiusHundredths" >= 0 AND "art"."borderRadiusHundredths" <= 10000)),
	CONSTRAINT "art_border_width_range" CHECK("art"."borderWidthHundredths" IS NULL OR ("art"."borderWidthHundredths" >= 0 AND "art"."borderWidthHundredths" <= 10000))
);
--> statement-breakpoint
CREATE TABLE `art_image_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256Digest` text NOT NULL,
	`originalFilename` text,
	`storageFilename` text NOT NULL,
	`normalizedStorageFilename` text,
	`contentType` text NOT NULL,
	`fileExtension` text NOT NULL,
	`pixelWidth` integer NOT NULL,
	`pixelHeight` integer NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `art_image_assets_sha256Digest_unique` ON `art_image_assets` (`sha256Digest`);