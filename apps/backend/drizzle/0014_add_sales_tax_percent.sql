PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_finance_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`wagePerHourCents` integer NOT NULL,
	`errorMarginPercent` integer NOT NULL,
	`salesTaxPercent` integer NOT NULL,
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
	CONSTRAINT "finance_settings_sales_tax_range" CHECK("__new_finance_settings"."salesTaxPercent" >= 0 AND "__new_finance_settings"."salesTaxPercent" <= 100),
	CONSTRAINT "finance_settings_designing_rate_basis" CHECK("__new_finance_settings"."designingReferenceMinutes" >= 0 AND "__new_finance_settings"."designingReferencePages" > 0),
	CONSTRAINT "finance_settings_printing_rate_basis" CHECK("__new_finance_settings"."printingReferenceMinutes" >= 0 AND ("__new_finance_settings"."printingReferencePages" IS NULL OR "__new_finance_settings"."printingReferencePages" > 0)),
	CONSTRAINT "finance_settings_applying_holographic_paper_rate_basis" CHECK("__new_finance_settings"."applyingHolographicPaperReferenceMinutes" >= 0 AND "__new_finance_settings"."applyingHolographicPaperReferencePages" > 0),
	CONSTRAINT "finance_settings_cutting_rate_basis" CHECK("__new_finance_settings"."cuttingReferenceMinutes" >= 0 AND "__new_finance_settings"."cuttingReferencePages" > 0),
	CONSTRAINT "finance_settings_placing_rate_basis" CHECK("__new_finance_settings"."placingReferenceMinutes" >= 0 AND "__new_finance_settings"."placingReferencePages" > 0)
);
--> statement-breakpoint
-- The old `finance_settings` table has no `salesTaxPercent` column yet, so
-- the SELECT below supplies a literal `4` (Georgia's flat state sales tax
-- rate, this app's default) for every existing row instead of selecting a
-- nonexistent source column.
INSERT INTO `__new_finance_settings`("id", "wagePerHourCents", "errorMarginPercent", "salesTaxPercent", "designingReferenceMinutes", "designingReferencePages", "printingReferenceMinutes", "printingReferencePages", "applyingHolographicPaperReferenceMinutes", "applyingHolographicPaperReferencePages", "cuttingReferenceMinutes", "cuttingReferencePages", "placingReferenceMinutes", "placingReferencePages", "updatedAt") SELECT "id", "wagePerHourCents", "errorMarginPercent", 4, "designingReferenceMinutes", "designingReferencePages", "printingReferenceMinutes", "printingReferencePages", "applyingHolographicPaperReferenceMinutes", "applyingHolographicPaperReferencePages", "cuttingReferenceMinutes", "cuttingReferencePages", "placingReferenceMinutes", "placingReferencePages", "updatedAt" FROM `finance_settings`;--> statement-breakpoint
DROP TABLE `finance_settings`;--> statement-breakpoint
ALTER TABLE `__new_finance_settings` RENAME TO `finance_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;