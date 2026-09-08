CREATE TABLE `activity_context` (
	`id` integer PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text,
	`group_id` text,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_events_event_key_unique` ON `activity_events` (`event_key`);--> statement-breakpoint
CREATE INDEX `idx_activity_group` ON `activity_events` (`group_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_activity_actor` ON `activity_events` (`actor_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER audit_group_create AFTER INSERT ON gatherings WHEN (1) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NEW.id,actor_id,actor_name,'group.create',NEW.name,json_object('after',json_object('name',NEW.name,'date',NEW.date,'location',NEW.location,'member_permission',NEW.member_permission,'visibility',NEW.visibility)),created_at FROM activity_context WHERE id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_group_update AFTER UPDATE ON gatherings WHEN (OLD.name IS NOT NEW.name OR OLD.date IS NOT NEW.date OR OLD.location IS NOT NEW.location OR OLD.member_permission IS NOT NEW.member_permission OR OLD.visibility IS NOT NEW.visibility OR OLD.password_hash IS NOT NEW.password_hash) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NEW.id,actor_id,actor_name,'group.update',NEW.name,json_object('before',json_object('name',OLD.name,'date',OLD.date,'location',OLD.location,'member_permission',OLD.member_permission,'visibility',OLD.visibility),'after',json_object('name',NEW.name,'date',NEW.date,'location',NEW.location,'member_permission',NEW.member_permission,'visibility',NEW.visibility),'passwordChanged',OLD.password_hash IS NOT NEW.password_hash),created_at FROM activity_context WHERE id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_member_join AFTER INSERT ON members WHEN (1) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NEW.group_id,actor_id,actor_name,'member.join',NEW.name,'{}',created_at FROM activity_context WHERE id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_member_rename AFTER UPDATE ON members WHEN (OLD.name IS NOT NEW.name) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NEW.group_id,actor_id,actor_name,'member.rename',NEW.name,json_object('before',json_object('name',OLD.name),'after',json_object('name',NEW.name)),created_at FROM activity_context WHERE id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_item_create AFTER INSERT ON items WHEN (1) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NEW.group_id,actor_id,actor_name,'item.create',NEW.name,json_object('after',json_object('name',NEW.name,'quantity',NEW.quantity,'unit',NEW.unit,'category',NEW.category,'note',NEW.note,'packed',NEW.packed,'assignee',NEW.assignee,'assignedTo',CASE WHEN NEW.assignee='everyone' THEN 'Everyone' ELSE COALESCE((SELECT name FROM members WHERE group_id=NEW.group_id AND user_id=NEW.assignee),'Unassigned') END)),created_at FROM activity_context WHERE id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_item_update AFTER UPDATE ON items WHEN (OLD.name IS NOT NEW.name OR OLD.quantity IS NOT NEW.quantity OR OLD.unit IS NOT NEW.unit OR OLD.category IS NOT NEW.category OR OLD.note IS NOT NEW.note OR OLD.packed IS NOT NEW.packed OR OLD.assignee IS NOT NEW.assignee) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NEW.group_id,actor_id,actor_name,'item.update',NEW.name,json_object('before',json_object('name',OLD.name,'quantity',OLD.quantity,'unit',OLD.unit,'category',OLD.category,'note',OLD.note,'packed',OLD.packed,'assignee',OLD.assignee,'assignedTo',CASE WHEN OLD.assignee='everyone' THEN 'Everyone' ELSE COALESCE((SELECT name FROM members WHERE group_id=OLD.group_id AND user_id=OLD.assignee),'Unassigned') END),'after',json_object('name',NEW.name,'quantity',NEW.quantity,'unit',NEW.unit,'category',NEW.category,'note',NEW.note,'packed',NEW.packed,'assignee',NEW.assignee,'assignedTo',CASE WHEN NEW.assignee='everyone' THEN 'Everyone' ELSE COALESCE((SELECT name FROM members WHERE group_id=NEW.group_id AND user_id=NEW.assignee),'Unassigned') END)),created_at FROM activity_context WHERE id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_item_delete AFTER DELETE ON items WHEN (1) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT OLD.group_id,actor_id,actor_name,'item.delete',OLD.name,json_object('before',json_object('name',OLD.name,'quantity',OLD.quantity,'unit',OLD.unit,'category',OLD.category,'note',OLD.note,'packed',OLD.packed,'assignee',OLD.assignee,'assignedTo',CASE WHEN OLD.assignee='everyone' THEN 'Everyone' ELSE COALESCE((SELECT name FROM members WHERE group_id=OLD.group_id AND user_id=OLD.assignee),'Unassigned') END)),created_at FROM activity_context WHERE id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_packing_insert AFTER INSERT ON item_packing WHEN (EXISTS(SELECT 1 FROM items WHERE id=NEW.item_id)) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT (SELECT group_id FROM items WHERE id=NEW.item_id),actor_id,actor_name,'packing.check',(SELECT name FROM items WHERE id=NEW.item_id),json_object('person',COALESCE((SELECT name FROM members WHERE user_id=NEW.user_id AND group_id=(SELECT group_id FROM items WHERE id=NEW.item_id)),'Member')),created_at FROM activity_context WHERE id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_packing_delete AFTER DELETE ON item_packing WHEN (EXISTS(SELECT 1 FROM items WHERE id=OLD.item_id)) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT (SELECT group_id FROM items WHERE id=OLD.item_id),actor_id,actor_name,'packing.uncheck',(SELECT name FROM items WHERE id=OLD.item_id),json_object('person',COALESCE((SELECT name FROM members WHERE user_id=OLD.user_id AND group_id=(SELECT group_id FROM items WHERE id=OLD.item_id)),'Member')),created_at FROM activity_context WHERE id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_profile_insert AFTER INSERT ON avatar_profiles WHEN (1) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NULL,actor_id,actor_name,'profile.update','Profile icon',json_object('after',json_object('icon',NEW.avatar_text,'color',NEW.color)),created_at FROM activity_context WHERE id=1;
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT m.group_id,actor_id,actor_name,'profile.update','Profile icon',json_object('after',json_object('icon',NEW.avatar_text,'color',NEW.color)),created_at FROM activity_context c JOIN members m ON m.user_id=c.actor_id WHERE c.id=1;
END;

--> statement-breakpoint
CREATE TRIGGER audit_profile_update AFTER UPDATE ON avatar_profiles WHEN (OLD.avatar_text IS NOT NEW.avatar_text OR OLD.color IS NOT NEW.color) AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NULL,actor_id,actor_name,'profile.update','Profile icon',json_object('before',json_object('icon',OLD.avatar_text,'color',OLD.color),'after',json_object('icon',NEW.avatar_text,'color',NEW.color)),created_at FROM activity_context WHERE id=1;
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT m.group_id,actor_id,actor_name,'profile.update','Profile icon',json_object('before',json_object('icon',OLD.avatar_text,'color',OLD.color),'after',json_object('icon',NEW.avatar_text,'color',NEW.color)),created_at FROM activity_context c JOIN members m ON m.user_id=c.actor_id WHERE c.id=1;
END;
