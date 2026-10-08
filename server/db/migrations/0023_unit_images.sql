-- Business unit cover photo, picked from the built-in gallery (/demo/unit-*.webp).
ALTER TABLE "business_units" ADD COLUMN IF NOT EXISTS "image_url" text;
