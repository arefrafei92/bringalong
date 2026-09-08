CREATE TABLE `item_packing` (
	`item_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `user_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `join_attempts` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `gatherings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `gatherings` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `gatherings` ADD `member_permission` text DEFAULT 'edit' NOT NULL;--> statement-breakpoint
ALTER TABLE `gatherings` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `gatherings` ADD `password_hash` text;