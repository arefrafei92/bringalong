CREATE TABLE `gatherings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`occasion` text NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`code` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gatherings_code_unique` ON `gatherings` (`code`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`category` text NOT NULL,
	`assignee` text,
	`packed` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `gatherings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_items_group` ON `items` (`group_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `gatherings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `members` (`user_id`);