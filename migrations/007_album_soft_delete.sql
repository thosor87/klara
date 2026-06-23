-- Soft-delete for albums.
-- A deleted album is hidden everywhere in the app, but its row stays so that
-- items moved to the trash keep their folder name (the trash list JOINs folders)
-- and can still be restored. Hard-deleting the folder is impossible without
-- losing the trashed photos, because items.folder_id is ON DELETE CASCADE.
alter table folders add column if not exists deleted_at timestamptz;
create index if not exists folders_deleted_idx on folders (deleted_at);
