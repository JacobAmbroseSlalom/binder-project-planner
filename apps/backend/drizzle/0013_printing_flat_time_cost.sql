PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_finance_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`wagePerHourCents` integer NOT NULL,
	`errorMarginPercent` integer NOT NULL,
	`designingReferenceMinutes` integer NOT NULL,
	`designingReferencePages` integer NOT NULL,
	`printingReferenceMinutes` integer NOT NULL,
	`printingReferencePages` integer,
	`applyingHolographicPaperReferenceMinutes` integer NOT NULL,
	`applyingHolographicPaperReferencePages` integer NOT NULL,
	`cuttingReferenceMinutes` integer NOT NULL,
	`cuttingReferencePages` integer NOT NULL,
	`placingReferenceMinutes` integer NOT NULL,
	`placingReferencePages` integer NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "finance_settings_singleton_id" CHECK("__new_finance_settings"."id" = 'singleton'),
	CONSTRAINT "finance_settings_wage_per_hour_non_negative" CHECK("__new_finance_settings"."wagePerHourCents" >= 0),
	CONSTRAINT "finance_settings_error_margin_range" CHECK("__new_finance_settings"."errorMarginPercent" >= 0 AND "__new_finance_settings"."errorMarginPercent" <= 100),
	CONSTRAINT "finance_settings_designing_rate_basis" CHECK("__new_finance_settings"."designingReferenceMinutes" >= 0 AND "__new_finance_settings"."designingReferencePages" > 0),
	CONSTRAINT "finance_settings_printing_rate_basis" CHECK("__new_finance_settings"."printingReferenceMinutes" >= 0 AND ("__new_finance_settings"."printingReferencePages" IS NULL OR "__new_finance_settings"."printingReferencePages" > 0)),
	CONSTRAINT "finance_settings_applying_holographic_paper_rate_basis" CHECK("__new_finance_settings"."applyingHolographicPaperReferenceMinutes" >= 0 AND "__new_finance_settings"."applyingHolographicPaperReferencePages" > 0),
	CONSTRAINT "finance_settings_cutting_rate_basis" CHECK("__new_finance_settings"."cuttingReferenceMinutes" >= 0 AND "__new_finance_settings"."cuttingReferencePages" > 0),
	CONSTRAINT "finance_settings_placing_rate_basis" CHECK("__new_finance_settings"."placingReferenceMinutes" >= 0 AND "__new_finance_settings"."placingReferencePages" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_finance_settings`("id", "wagePerHourCents", "errorMarginPercent", "designingReferenceMinutes", "designingReferencePages", "printingReferenceMinutes", "printingReferencePages", "applyingHolographicPaperReferenceMinutes", "applyingHolographicPaperReferencePages", "cuttingReferenceMinutes", "cuttingReferencePages", "placingReferenceMinutes", "placingReferencePages", "updatedAt") SELECT "id", "wagePerHourCents", "errorMarginPercent", "designingReferenceMinutes", "designingReferencePages", "printingReferenceMinutes", "printingReferencePages", "applyingHolographicPaperReferenceMinutes", "applyingHolographicPaperReferencePages", "cuttingReferenceMinutes", "cuttingReferencePages", "placingReferenceMinutes", "placingReferencePages", "updatedAt" FROM `finance_settings`;--> statement-breakpoint
DROP TABLE `finance_settings`;--> statement-breakpoint
ALTER TABLE `__new_finance_settings` RENAME TO `finance_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- Printing's rate basis is amended to a flat, non-page-scaled cost (it's a
-- one-time cost for the whole binder): clear any previously stored
-- printingReferencePages value now that the column is nullable, so
-- computeTimeCost treats printingReferenceMinutes as the binder's total
-- minutes for this category directly, instead of dividing by a page count
-- that no longer means anything for Printing.
UPDATE `finance_settings` SET `printingReferencePages` = NULL WHERE `id` = 'singleton';