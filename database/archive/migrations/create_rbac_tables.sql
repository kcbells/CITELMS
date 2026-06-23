-- ============================================================
-- RBAC: Role-Based Access Control Tables
-- ============================================================

-- Permissions master list
CREATE TABLE IF NOT EXISTS `permissions` (
    `id`          INT(11) NOT NULL AUTO_INCREMENT,
    `name`        VARCHAR(80) NOT NULL COMMENT 'Slug e.g. users.create',
    `description` VARCHAR(200) NOT NULL,
    `module`      VARCHAR(50) NOT NULL COMMENT 'Grouping key e.g. users',
    `created_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_perm_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Role → Permission assignments
CREATE TABLE IF NOT EXISTS `role_permissions` (
    `id`           INT(11) NOT NULL AUTO_INCREMENT,
    `role`         ENUM('admin','dean','instructor','student') NOT NULL,
    `permission_id` INT(11) NOT NULL,
    `granted_by`   INT(11) DEFAULT NULL COMMENT 'users_id who last set this',
    `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_role_perm` (`role`, `permission_id`),
    FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`granted_by`)    REFERENCES `users`(`users_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Seed: All permissions
-- ============================================================
INSERT IGNORE INTO `permissions` (`name`, `description`, `module`) VALUES
-- Users
('users.view',                'View user accounts',                   'users'),
('users.create',              'Create new user accounts',             'users'),
('users.edit',                'Edit existing user accounts',          'users'),
('users.delete',              'Delete user accounts',                 'users'),
-- Departments
('departments.view',          'View departments',                     'departments'),
('departments.create',        'Create departments',                   'departments'),
('departments.edit',          'Edit departments',                     'departments'),
('departments.delete',        'Delete departments',                   'departments'),
-- Programs
('programs.view',             'View programs',                        'programs'),
('programs.create',           'Create programs',                      'programs'),
('programs.edit',             'Edit programs',                        'programs'),
('programs.delete',           'Delete programs',                      'programs'),
-- Subjects
('subjects.view',             'View subjects',                        'subjects'),
('subjects.create',           'Create subjects',                      'subjects'),
('subjects.edit',             'Edit subjects',                        'subjects'),
('subjects.delete',           'Delete subjects',                      'subjects'),
-- Curriculum
('curriculum.view',           'View curriculum',                      'curriculum'),
('curriculum.edit',           'Edit curriculum',                      'curriculum'),
-- Sections
('sections.view',             'View sections',                        'sections'),
('sections.create',           'Create sections',                      'sections'),
('sections.edit',             'Edit sections',                        'sections'),
('sections.delete',           'Delete sections',                      'sections'),
-- Subject Offerings
('subject_offerings.view',    'View subject offerings',               'subject_offerings'),
('subject_offerings.create',  'Create subject offerings',             'subject_offerings'),
('subject_offerings.edit',    'Edit subject offerings',               'subject_offerings'),
('subject_offerings.delete',  'Delete subject offerings',             'subject_offerings'),
-- Faculty Assignments
('faculty_assignments.view',  'View faculty assignments',             'faculty_assignments'),
('faculty_assignments.create','Assign instructors to offerings',      'faculty_assignments'),
('faculty_assignments.edit',  'Edit faculty assignments',             'faculty_assignments'),
('faculty_assignments.delete','Remove faculty assignments',           'faculty_assignments'),
-- Quizzes
('quizzes.view',              'View quizzes',                         'quizzes'),
('quizzes.create',            'Create quizzes',                       'quizzes'),
('quizzes.edit',              'Edit quizzes',                         'quizzes'),
('quizzes.delete',            'Delete quizzes',                       'quizzes'),
('quizzes.grade',             'Grade / review quiz attempts',         'quizzes'),
-- Lessons
('lessons.view',              'View lessons',                         'lessons'),
('lessons.create',            'Create lessons',                       'lessons'),
('lessons.edit',              'Edit lessons',                         'lessons'),
('lessons.delete',            'Delete lessons',                       'lessons'),
-- Question Bank
('question_bank.view',        'View question bank',                   'question_bank'),
('question_bank.create',      'Add questions to bank',                'question_bank'),
('question_bank.edit',        'Edit questions in bank',               'question_bank'),
('question_bank.delete',      'Delete questions from bank',           'question_bank'),
-- Grades
('grades.view',               'View grades',                          'grades'),
('grades.edit',               'Edit / override grades',               'grades'),
-- Reports & Analytics
('reports.view',              'View reports',                         'reports'),
('analytics.view',            'View analytics dashboards',            'analytics'),
-- Remedials
('remedials.view',            'View remedial activities',             'remedials'),
('remedials.create',          'Create remedial activities',           'remedials'),
('remedials.edit',            'Edit remedial activities',             'remedials'),
-- Settings
('settings.view',             'View system settings',                 'settings'),
('settings.edit',             'Edit system settings',                 'settings'),
-- RBAC
('rbac.view',                 'View role-permission matrix',          'rbac'),
('rbac.edit',                 'Edit role permissions',                'rbac');

-- ============================================================
-- Seed: Default role permissions
-- ============================================================

-- ADMIN: all permissions
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'admin', `id` FROM `permissions`;

-- DEAN
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'dean', `id` FROM `permissions` WHERE `name` IN (
    'departments.view',
    'programs.view',
    'subjects.view',
    'curriculum.view', 'curriculum.edit',
    'sections.view',
    'subject_offerings.view',
    'faculty_assignments.view', 'faculty_assignments.create',
    'faculty_assignments.edit', 'faculty_assignments.delete',
    'grades.view',
    'reports.view',
    'analytics.view'
);

-- INSTRUCTOR
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'instructor', `id` FROM `permissions` WHERE `name` IN (
    'subjects.view',
    'sections.view',
    'subject_offerings.view',
    'quizzes.view', 'quizzes.create', 'quizzes.edit',
    'quizzes.delete', 'quizzes.grade',
    'lessons.view', 'lessons.create', 'lessons.edit', 'lessons.delete',
    'question_bank.view', 'question_bank.create',
    'question_bank.edit', 'question_bank.delete',
    'grades.view', 'grades.edit',
    'analytics.view',
    'remedials.view', 'remedials.create', 'remedials.edit'
);

-- STUDENT
INSERT IGNORE INTO `role_permissions` (`role`, `permission_id`)
SELECT 'student', `id` FROM `permissions` WHERE `name` IN (
    'subjects.view',
    'quizzes.view',
    'lessons.view',
    'grades.view',
    'remedials.view'
);
