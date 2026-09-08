ALTER TABLE `gatherings` ADD `remove_at` integer;--> statement-breakpoint
CREATE INDEX `idx_gatherings_remove_at` ON `gatherings` (`remove_at`);
--> statement-breakpoint
CREATE TRIGGER audit_removal_schedule_create AFTER INSERT ON gatherings WHEN NEW.remove_at IS NOT NULL AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NEW.id,actor_id,actor_name,'group.update',NEW.name,json_object('before',json_object('removeAt',NULL),'after',json_object('removeAt',NEW.remove_at)),created_at FROM activity_context WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER audit_removal_schedule_update AFTER UPDATE ON gatherings WHEN OLD.remove_at IS NOT NEW.remove_at AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NEW.id,actor_id,actor_name,'group.update',NEW.name,json_object('before',json_object('removeAt',OLD.remove_at),'after',json_object('removeAt',NEW.remove_at)),created_at FROM activity_context WHERE id=1;
END;
--> statement-breakpoint
CREATE TRIGGER auto_removal_receipt BEFORE DELETE ON gatherings BEGIN
 INSERT INTO activity_events (actor_id,actor_name,action,subject,details,created_at) SELECT user_id,'Bringalong','group.remove',OLD.name,json_object('after',json_object('removeAt',OLD.remove_at)),CAST(strftime('%s','now') AS INTEGER)*1000 FROM members WHERE group_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER remove_group_history AFTER DELETE ON gatherings BEGIN
 DELETE FROM activity_events WHERE group_id=OLD.id;
END;
