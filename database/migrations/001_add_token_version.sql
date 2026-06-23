-- Migration 001: Add token_version to users for JWT logout revocation
-- Run once against cit_lms database.
-- After a user logs out, token_version is incremented so any issued JWT
-- with an older tok_ver is rejected by JWT::validate().

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS token_version INT UNSIGNED NOT NULL DEFAULT 0
        COMMENT 'Bumped on logout; rejects JWTs with older tok_ver';
