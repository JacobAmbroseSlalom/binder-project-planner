CREATE TABLE `mutation_idempotency` (
	`key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`responseStatus` integer NOT NULL,
	`responseBody` text NOT NULL,
	`locationHeader` text,
	`createdAt` text NOT NULL
);
