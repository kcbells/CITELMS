-- ============================================================
-- Migration: Remove unused columns from users table
-- Date: 2026-02-15
-- Description: Drops suffix, address, gender, birth_date,
--              and profile_image columns that are not used
--              in the application.
-- Kept: section (student profile display),
--        contact_number (student profile form)
-- ============================================================

ALTER TABLE `users`
    DROP COLUMN `suffix`,
    DROP COLUMN `address`,
    DROP COLUMN `gender`,
    DROP COLUMN `birth_date`,
    DROP COLUMN `profile_image`;
