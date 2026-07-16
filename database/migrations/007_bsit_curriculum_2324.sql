-- ============================================================
-- Migration 007: BSIT Curriculum 2023-2024 (Official)
-- Replaces existing BSIT subjects with the official 53-subject
-- curriculum. Safe to re-run — deletes BSIT data first.
-- BSIT = program_id 1
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Clear dependent records for BSIT subjects
DELETE FROM subject_prerequisite
WHERE subject_id IN (SELECT subject_id FROM subject WHERE program_id = 1)
   OR prerequisite_subject_id IN (SELECT subject_id FROM subject WHERE program_id = 1);

DELETE FROM subject_offered
WHERE subject_id IN (SELECT subject_id FROM subject WHERE program_id = 1);

DELETE FROM curriculum WHERE program_id = 1;
DELETE FROM subject   WHERE program_id = 1;

SET FOREIGN_KEY_CHECKS = 1;

-- ── INSERT SUBJECTS ───────────────────────────────────────────────────────────
-- Columns: subject_code, subject_name, units, lecture_hours, lab_hours,
--          semester (1=1st, 2=2nd, 3=summer), year_level, program_id, status

INSERT INTO `subject`
    (subject_code, subject_name, units, lecture_hours, lab_hours, semester, year_level, program_id, status)
VALUES

-- ── FIRST YEAR · 1st Semester ────────────────────────────────────────────────
('ITE 366', 'Introduction to Computing (including IT Fundamentals)', 3, 3, 0, 1, 1, 1, 'active'),
('ITE 260', 'Computer Programming 1',                               3, 2, 3, 1, 1, 1, 'active'),
('GEN 002', 'Understanding the Self',                               3, 3, 0, 1, 1, 1, 'active'),
('MAT 152', 'Mathematics in the Modern World',                      3, 3, 0, 1, 1, 1, 'active'),
('GEN 001', 'Purposive Communication',                              3, 3, 0, 1, 1, 1, 'active'),
('GEN 006', 'Ethics',                                               3, 3, 0, 1, 1, 1, 'active'),
('PED 030', 'PATHFit 1',                                            2, 0, 2, 1, 1, 1, 'active'),
('NST 021', 'National Service Training Program 1',                  3, 3, 0, 1, 1, 1, 'active'),

-- ── FIRST YEAR · 2nd Semester ────────────────────────────────────────────────
('ITE 186', 'Computer Programming 2',                               3, 2, 3, 2, 1, 1, 'active'),
('ITE 399', 'Human Computer Interaction 1',                         3, 3, 0, 2, 1, 1, 'active'),
('ITE 048', 'Discrete Structures',                                  3, 3, 0, 2, 1, 1, 'active'),
('GEN 008', 'Living in IT Era',                                     3, 3, 0, 2, 1, 1, 'active'),
('ART 002', 'Art Appreciation',                                     3, 3, 0, 2, 1, 1, 'active'),
('GEN 005', 'The Contemporary World',                               3, 3, 0, 2, 1, 1, 'active'),
('PED 031', 'PATHFit 2',                                            2, 0, 2, 2, 1, 1, 'active'),
('NST 022', 'National Service Training Program 2',                  3, 3, 0, 2, 1, 1, 'active'),

-- ── SECOND YEAR · 1st Semester ───────────────────────────────────────────────
('ITE 298', 'Information Management (Including Fundamentals of Database Systems)', 3, 2, 3, 1, 2, 1, 'active'),
('ITE 300', 'Object-Oriented Programming',                          3, 2, 3, 1, 2, 1, 'active'),
('ITE 292', 'Networking 1',                                         3, 2, 3, 1, 2, 1, 'active'),
('ITE 031', 'Data Structures and Algorithms',                       3, 2, 3, 1, 2, 1, 'active'),
('ITE 083', 'IT Project Management',                                3, 3, 0, 1, 2, 1, 'active'),
('HIS 007', 'Life and Works of Rizal',                              3, 3, 0, 1, 2, 1, 'active'),
('GEN 003', 'Science, Technology and Society',                      3, 3, 0, 1, 2, 1, 'active'),
('PED 032', 'PATHFit 3',                                            2, 0, 2, 1, 2, 1, 'active'),
('SSP 005', 'Student Success Program 1',                            1, 1, 0, 1, 2, 1, 'active'),

-- ── SECOND YEAR · 2nd Semester ───────────────────────────────────────────────
('ITE 393', 'Application Development and Emerging Technologies (Including Event Driven Programming)', 3, 2, 3, 2, 2, 1, 'active'),
('ITE 400', 'Systems Integration and Architecture',                 3, 3, 0, 2, 2, 1, 'active'),
('ITE 308', 'Web Systems and Technologies',                         3, 2, 3, 2, 2, 1, 'active'),
('ITE 380', 'Human Computer Interaction 2',                         3, 3, 0, 2, 2, 1, 'active'),
('GEN 004', 'Readings in Philippine History',                       3, 3, 0, 2, 2, 1, 'active'),
('GEN 009', 'The Entrepreneurial Mind',                             3, 3, 0, 2, 2, 1, 'active'),
('GEN 013', 'People and Earth\'s Ecosystem',                        3, 3, 0, 2, 2, 1, 'active'),
('PED 033', 'PATHFit 4',                                            2, 0, 2, 2, 2, 1, 'active'),
('SSP 006', 'Student Success Program 2',                            1, 1, 0, 2, 2, 1, 'active'),

-- ── THIRD YEAR · 1st Semester ────────────────────────────────────────────────
('ITE 359', 'Networking 2',                                         3, 2, 3, 1, 3, 1, 'active'),
('ITE 369', 'Information Assurance and Security 1',                 3, 2, 3, 1, 3, 1, 'active'),
('ITE 353', 'Data Scalability and Analytics',                       3, 2, 3, 1, 3, 1, 'active'),
('ITE 307', 'Quantitative Methods (Including Modeling and Simulation)', 3, 3, 0, 1, 3, 1, 'active'),
('ITE 397', 'Advanced Database Systems (Including Advanced Systems Integration and Architecture)', 3, 2, 3, 1, 3, 1, 'active'),
('ITE 383', 'Information Technology Elective 1',                    3, 3, 0, 1, 3, 1, 'active'),
('SSP 007', 'Student Success Program 3',                            1, 1, 0, 1, 3, 1, 'active'),

-- ── THIRD YEAR · 2nd Semester ────────────────────────────────────────────────
('ITE 309', 'Capstone Project and Research 1',                      3, 2, 3, 2, 3, 1, 'active'),
('ITE 293', 'System Administration and Maintenance',                3, 2, 3, 2, 3, 1, 'active'),
('ITE 370', 'Information Assurance and Security 2',                 3, 2, 3, 2, 3, 1, 'active'),
('ITE 401', 'Platform Technologies',                                3, 2, 3, 2, 3, 1, 'active'),
('ITE 384', 'Information Technology Elective 2',                    3, 3, 0, 2, 3, 1, 'active'),
('ITE 382', 'Information Technology Elective 3',                    3, 3, 0, 2, 3, 1, 'active'),
('SSP 008', 'Student Success Program 4',                            1, 1, 0, 2, 3, 1, 'active'),

-- ── FOURTH YEAR · 1st Semester ───────────────────────────────────────────────
('ITE 310', 'Capstone Project and Research 2',                      3, 2, 3, 1, 4, 1, 'active'),
('ITE 388', 'Information Technology Elective 4',                    3, 3, 0, 1, 4, 1, 'active'),
('ITE 381', 'IT Business Solutions',                                3, 3, 0, 1, 4, 1, 'active'),
('ITE 367', 'Managing IT Resources (Including Social and Professional Issues)', 3, 3, 0, 1, 4, 1, 'active'),

-- ── FOURTH YEAR · 2nd Semester ───────────────────────────────────────────────
('ITE 311', 'Information Technology Practicum (486 hrs)',            6, 0, 6, 2, 4, 1, 'active');

-- ── BUILD CURRICULUM ENTRIES ──────────────────────────────────────────────────
-- Derive curriculum rows directly from the subjects just inserted.
-- sem_num = subject.semester (1 or 2), year_level = subject.year_level

INSERT INTO `curriculum` (program_id, course_id, year_level, sem_num)
SELECT 1, subject_id, year_level, semester
FROM `subject`
WHERE program_id = 1 AND status = 'active';

-- ── PRE-REQUISITES ────────────────────────────────────────────────────────────
-- Only clearly-specified chains are recorded.

INSERT INTO `subject_prerequisite` (subject_id, prerequisite_subject_id)
SELECT s.subject_id, p.subject_id
FROM (VALUES
    -- ITE 186 requires ITE 260
    ROW('ITE 186', 'ITE 260'),
    -- ITE 399 requires ITE 366
    ROW('ITE 399', 'ITE 366'),
    -- ITE 048 requires MAT 152
    ROW('ITE 048', 'MAT 152'),
    -- PED 031 requires PED 030
    ROW('PED 031', 'PED 030'),
    -- NST 022 requires NST 021
    ROW('NST 022', 'NST 021'),
    -- ITE 298 requires ITE 186
    ROW('ITE 298', 'ITE 186'),
    -- ITE 300 requires ITE 186
    ROW('ITE 300', 'ITE 186'),
    -- ITE 292 requires ITE 366
    ROW('ITE 292', 'ITE 366'),
    -- ITE 031 requires ITE 186
    ROW('ITE 031', 'ITE 186'),
    -- ITE 083 requires ITE 366
    ROW('ITE 083', 'ITE 366'),
    -- PED 032 requires PED 031
    ROW('PED 032', 'PED 031'),
    -- ITE 400 requires ITE 366
    ROW('ITE 400', 'ITE 366'),
    -- ITE 308 requires ITE 260
    ROW('ITE 308', 'ITE 260'),
    -- ITE 380 requires ITE 399
    ROW('ITE 380', 'ITE 399'),
    -- ITE 307 requires MAT 152
    ROW('ITE 307', 'MAT 152'),
    -- PED 033 requires PED 032
    ROW('PED 033', 'PED 032')
) AS pairs(sc, pc)
JOIN `subject` s ON s.subject_code = pairs.sc AND s.program_id = 1
JOIN `subject` p ON p.subject_code = pairs.pc AND p.program_id = 1;

-- ── VERIFY ────────────────────────────────────────────────────────────────────
SELECT CONCAT('Subjects inserted: ', COUNT(*)) AS result FROM `subject` WHERE program_id = 1;
SELECT CONCAT('Curriculum rows: ',   COUNT(*)) AS result FROM `curriculum` WHERE program_id = 1;
SELECT CONCAT('Prerequisites: ',     COUNT(*)) AS result FROM `subject_prerequisite`
WHERE subject_id IN (SELECT subject_id FROM `subject` WHERE program_id = 1);
