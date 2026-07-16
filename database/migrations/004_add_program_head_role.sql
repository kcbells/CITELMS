-- ============================================================
-- Migration 004: Add program_head role
-- Run after 003_post_recovery.sql
-- Safe to run once — ALTER ENUM is idempotent via MODIFY.
-- ============================================================

-- ── Extend ENUM columns ──────────────────────────────────────
ALTER TABLE `users`
    MODIFY `role` ENUM('admin','dean','program_head','instructor','student') NOT NULL DEFAULT 'student';

ALTER TABLE `role_permissions`
    MODIFY `role` ENUM('admin','dean','program_head','instructor','student') NOT NULL;

-- ── Seed program_head permissions ────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'program_head', `id` FROM `permissions` WHERE `name` IN (
    'users.view',
    'curriculum.view',
    'subjects.view',
    'subject_offerings.view',
    'faculty_assignments.view',
    'enrollment.view',
    'announcements.view','announcements.create','announcements.edit','announcements.delete',
    'content_bank.view','content_bank.edit',
    'progress.view',
    'messaging.view','messaging.send',
    'grades.view',
    'reports.view',
    'analytics.view',
    'lessons.view',
    'video.view'
);
