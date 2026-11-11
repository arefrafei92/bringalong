ALTER TABLE `gatherings` ADD `member_limit` integer;--> statement-breakpoint
CREATE TRIGGER audit_member_limit_update AFTER UPDATE ON gatherings WHEN OLD.member_limit IS NOT NEW.member_limit AND EXISTS(SELECT 1 FROM activity_context WHERE id=1) BEGIN
 INSERT INTO activity_events (group_id,actor_id,actor_name,action,subject,details,created_at) SELECT NEW.id,actor_id,actor_name,'group.update',NEW.name,json_object('before',json_object('memberLimit',OLD.member_limit),'after',json_object('memberLimit',NEW.member_limit)),created_at FROM activity_context WHERE id=1;
END;
