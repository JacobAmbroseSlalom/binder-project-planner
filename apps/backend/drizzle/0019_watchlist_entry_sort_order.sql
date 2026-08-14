ALTER TABLE `watchlist_entries` ADD `sortOrder` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Backfills every pre-existing row's new `sortOrder` from the ordering the
-- list used before this migration (createdAt descending, then id
-- ascending - see the old `GET /watchlist-entries` route), so an existing
-- watchlist doesn't collapse to a single tied position (all `0`) the
-- first time this column is read.
UPDATE `watchlist_entries`
SET `sortOrder` = `ordered`.`rank` - 1
FROM (
  SELECT `id`, ROW_NUMBER() OVER (ORDER BY `createdAt` DESC, `id` ASC) AS `rank`
  FROM `watchlist_entries`
) AS `ordered`
WHERE `watchlist_entries`.`id` = `ordered`.`id`;
