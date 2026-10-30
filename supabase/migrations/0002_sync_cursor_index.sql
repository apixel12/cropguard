-- Incremental history sync (src/sync/historySync.ts) asks for "this user's rows uploaded
-- since <cursor>", ordered by created_at. This index answers that directly instead of
-- reading every row the user has. Safe to run more than once.
create index if not exists scans_user_created on public.scans (user_id, created_at);
