-- First-run tour progress per user (so a finished / skipped tour does not re-show on another device).
CREATE TABLE IF NOT EXISTS "user_onboarding" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tour_key" text NOT NULL,
  "completed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "tour_key")
);
