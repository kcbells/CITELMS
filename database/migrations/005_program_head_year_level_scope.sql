-- ============================================================
-- Migration 005: Year-level scope for Program Heads
-- Adds year_level_from and year_level_to to users so a
-- program head can be assigned e.g. From=2 To=4 (2nd–4th year)
-- or From=1 To=1 (1st year only).
-- Safe to run multiple times — ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE `users`
    ADD COLUMN IF NOT EXISTS `year_level_from` TINYINT UNSIGNED NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `year_level_to`   TINYINT UNSIGNED NULL DEFAULT NULL;
