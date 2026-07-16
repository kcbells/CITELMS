-- ============================================================
-- RBAC Patch: Add missing permissions to existing databases
-- Run this if your database already has the original RBAC tables
-- and you just need the new modules added.
-- Safe to run multiple times (INSERT IGNORE).
-- ============================================================

-- ── New permissions ───────────────────────────────────────────
INSERT IGNORE INTO `permissions` (`name`, `description`, `module`) VALUES

-- Enrollment
('enrollment.view',    'View student enrollments',               'enrollment'),
('enrollment.manage',  'Add, edit, or drop student enrollments', 'enrollment'),

-- Announcements
('announcements.view',   'View announcements',              'announcements'),
('announcements.create', 'Post new announcements',          'announcements'),
('announcements.edit',   'Edit existing announcements',     'announcements'),
('announcements.delete', 'Delete announcements',            'announcements'),

-- Content Bank
('content_bank.view',   'View files in the content bank',           'content_bank'),
('content_bank.create', 'Upload files to the content bank',         'content_bank'),
('content_bank.edit',   'Rename or update content bank entries',    'content_bank'),
('content_bank.delete', 'Delete files from the content bank',       'content_bank'),

-- Student Progress
('progress.view',  'View student learning progress and completion', 'progress'),

-- Messaging
('messaging.view', 'View messages and inbox',        'messaging'),
('messaging.send', 'Send messages to other users',  'messaging'),

-- AI Tools
('ai_tools.use',      'Access the AI learning assistant',          'ai_tools'),
('ai_tools.generate', 'Generate quizzes and content using AI',     'ai_tools'),

-- Campuses (CampusAPI.php — was missing from RBAC)
('campuses.view',   'View campuses and their details',          'campuses'),
('campuses.create', 'Add new campuses',                         'campuses'),
('campuses.edit',   'Edit campus information',                  'campuses'),
('campuses.delete', 'Delete campuses',                          'campuses'),

-- Elective Tracks (ElectiveAPI.php — was missing from RBAC)
('electives.view',   'View elective tracks and their subjects', 'electives'),
('electives.manage', 'Create, edit, and remove elective tracks','electives'),

-- Live Classes / Video (VideoAPI.php — was missing from RBAC)
('video.view', 'Join live class sessions',            'video'),
('video.host', 'Start and host live class sessions',  'video');

-- ── Grant new permissions to existing roles ───────────────────

-- ADMIN: gets everything new
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'admin', `id` FROM `permissions`
WHERE `module` IN ('enrollment','announcements','content_bank','progress','messaging',
                   'ai_tools','campuses','electives','video');

-- DEAN: enrollment, announcements, electives, progress
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'dean', `id` FROM `permissions` WHERE `name` IN (
    'enrollment.view',
    'announcements.view', 'announcements.create',
    'announcements.edit', 'announcements.delete',
    'electives.view', 'electives.manage',
    'progress.view',
    'video.view'
);

-- INSTRUCTOR: operational + live class hosting
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'instructor', `id` FROM `permissions` WHERE `name` IN (
    'enrollment.view',
    'announcements.view', 'announcements.create',
    'announcements.edit', 'announcements.delete',
    'content_bank.view', 'content_bank.create',
    'content_bank.edit', 'content_bank.delete',
    'progress.view',
    'messaging.view', 'messaging.send',
    'ai_tools.use', 'ai_tools.generate',
    'video.view', 'video.host'
);

-- STUDENT: read-only + messaging + AI + join live classes
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'student', `id` FROM `permissions` WHERE `name` IN (
    'enrollment.view',
    'announcements.view',
    'progress.view',
    'messaging.view', 'messaging.send',
    'ai_tools.use',
    'video.view'
);
