-- Enable hard-deleting a user: null out their references instead of blocking the
-- delete on a foreign-key violation. Already-approved content stays with the class;
-- only the uploader/creator/approver attribution is cleared.
-- (documents.uploaded_by and audit_log.actor_id are already ON DELETE SET NULL.)

ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_created_by_fkey;
ALTER TABLE folders ADD CONSTRAINT folders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_uploaded_by_fkey;
ALTER TABLE items ADD CONSTRAINT items_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_approved_by_fkey;
ALTER TABLE items ADD CONSTRAINT items_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_reported_by_fkey;
ALTER TABLE reports ADD CONSTRAINT reports_reported_by_fkey
  FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL;
