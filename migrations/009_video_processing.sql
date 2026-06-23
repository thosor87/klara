-- Video Phase B: async transcoding status.
-- A video item is `processing=true` from upload until the transcoder Lambda has
-- produced web.mp4 (then it flips to false). Photos are always false.
alter table items add column if not exists processing boolean not null default false;
