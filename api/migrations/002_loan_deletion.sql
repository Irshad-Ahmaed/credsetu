-- Keep the submission key as a tombstone so an old create retry cannot resurrect a deleted entry.
ALTER TABLE loans ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX loans_active_user_status_due_idx ON loans(user_id, status, due_on) WHERE deleted_at IS NULL;
