CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`salt` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`event_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`last_op` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`event_id`, `id`)
);
