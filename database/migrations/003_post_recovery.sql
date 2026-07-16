-- ============================================================
-- Migration 003: Post-recovery schema sync (run after MySQL
-- starts with the yh/ data directory)
-- Safe to run multiple times — all statements are idempotent.
-- ============================================================

USE cit_lms;

-- ── Users: token_version (JWT revocation on logout) ──────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS token_version INT UNSIGNED NOT NULL DEFAULT 0;

-- ── Users: last_active (online presence) ─────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_active TIMESTAMP NULL DEFAULT NULL;

-- ── Questions: media attachment support ──────────────────────
ALTER TABLE `questions`
    ADD COLUMN IF NOT EXISTS `media_type` ENUM('none','image','audio','link') NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS `media_url`  VARCHAR(500) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS `media_name` VARCHAR(200) DEFAULT NULL;

-- ── Elective tracks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `elective_track` (
    `track_id`      INT          AUTO_INCREMENT PRIMARY KEY,
    `department_id` INT          NOT NULL,
    `program_id`    INT          NOT NULL,
    `track_name`    VARCHAR(200) NOT NULL,
    `status`        ENUM('active','inactive') NOT NULL DEFAULT 'active',
    UNIQUE KEY `uq_program_track` (`program_id`, `track_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Elective subjects (subjects assigned to a track) ─────────
CREATE TABLE IF NOT EXISTS `elective_subject` (
    `id`         INT AUTO_INCREMENT PRIMARY KEY,
    `track_id`   INT NOT NULL,
    `subject_id` INT NOT NULL,
    UNIQUE KEY `uq_track_subject` (`track_id`, `subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── RBAC: add missing permissions (safe, INSERT IGNORE) ──────
INSERT IGNORE INTO `permissions` (`name`, `description`, `module`) VALUES
('enrollment.view',      'View student enrollments',               'enrollment'),
('enrollment.manage',    'Add, edit, or drop student enrollments', 'enrollment'),
('announcements.view',   'View announcements',                     'announcements'),
('announcements.create', 'Post new announcements',                 'announcements'),
('announcements.edit',   'Edit existing announcements',            'announcements'),
('announcements.delete', 'Delete announcements',                   'announcements'),
('content_bank.view',    'View files in the content bank',         'content_bank'),
('content_bank.create',  'Upload files to the content bank',       'content_bank'),
('content_bank.edit',    'Rename or update content bank entries',  'content_bank'),
('content_bank.delete',  'Delete files from the content bank',     'content_bank'),
('progress.view',        'View student learning progress',         'progress'),
('messaging.view',       'View messages and inbox',                'messaging'),
('messaging.send',       'Send messages to other users',           'messaging'),
('ai_tools.use',         'Access the AI learning assistant',       'ai_tools'),
('ai_tools.generate',    'Generate quizzes and content using AI',  'ai_tools'),
('campuses.view',        'View campuses and their details',        'campuses'),
('campuses.create',      'Add new campuses',                       'campuses'),
('campuses.edit',        'Edit campus information',                'campuses'),
('campuses.delete',      'Delete campuses',                        'campuses'),
('electives.view',       'View elective tracks and their subjects','electives'),
('electives.manage',     'Create, edit, and remove elective tracks','electives'),
('video.view',           'Join live class sessions',               'video'),
('video.host',           'Start and host live class sessions',     'video');

-- Grant new permissions to roles
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'admin', `id` FROM `permissions`
WHERE `module` IN ('enrollment','announcements','content_bank','progress',
                   'messaging','ai_tools','campuses','electives','video');

INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'dean', `id` FROM `permissions` WHERE `name` IN (
    'enrollment.view',
    'announcements.view','announcements.create','announcements.edit','announcements.delete',
    'electives.view','electives.manage',
    'progress.view','video.view'
);

INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'instructor', `id` FROM `permissions` WHERE `name` IN (
    'enrollment.view',
    'announcements.view','announcements.create','announcements.edit','announcements.delete',
    'content_bank.view','content_bank.create','content_bank.edit','content_bank.delete',
    'progress.view','messaging.view','messaging.send',
    'ai_tools.use','ai_tools.generate','video.view','video.host'
);

INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'student', `id` FROM `permissions` WHERE `name` IN (
    'enrollment.view','announcements.view','progress.view',
    'messaging.view','messaging.send','ai_tools.use','video.view'
);
-- Add campus_id to users (missing from June 15 backup)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS campus_id INT(11) DEFAULT NULL AFTER department_id,
  ADD KEY IF NOT EXISTS idx_users_campus (campus_id);
