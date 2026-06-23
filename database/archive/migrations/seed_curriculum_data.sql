-- =============================================================
-- COC-LMS: Comprehensive Curriculum Sample Data
-- Programs: BSIT (program_id=1), BSCS (program_id=2)
--
-- PREREQUISITE: Run add_subject_curriculum_columns.sql first
-- (ensures program_id, year_level, semester columns exist on subject table)
--
-- SAFE: Only removes subjects listed in this file plus their linked
-- lessons, quizzes, and offerings. All other data is left untouched.
-- Run this in phpMyAdmin on the cit_lms database.
-- =============================================================

-- All subject codes managed by this seed file
-- Used to target deletes so nothing outside this list is touched
SET @seed_codes = (
    SELECT GROUP_CONCAT(QUOTE(subject_code)) FROM subject
    WHERE subject_code IN (
        'CC 101','CC 102','CC 103','CC 104',
        'GE 101','GE 102','GE 103','GE 104','GE 105','GE 106','GE 107','GE 108','GE 109','GE 110',
        'PE 101','PE 102','PE 103','PE 104',
        'NSTP 101','NSTP 102',
        'IT 201','IT 202','IT 203','IT 204','IT 205','IT 206','IT 207','IT 208',
        'IT 301','IT 302','IT 303','IT 304','IT 305','IT 306',
        'IT 307','IT 308','IT 309','IT 310','IT 311','IT 312',
        'IT 401','IT 402','IT 403','IT 404','IT 405','IT 406',
        'CS 101','CS 102','CS 103','CS 104',
        'MATH 101','MATH 102','MATH 201','MATH 202',
        'GE 111','GE 112','GE 113','GE 114','GE 115','GE 116','GE 117','GE 118','GE 119',
        'PE 111','PE 112','PE 113','PE 114',
        'NSTP 111','NSTP 112',
        'CS 201','CS 202','CS 203','CS 204','CS 205','CS 206','CS 207',
        'CS 301','CS 302','CS 303','CS 304','CS 305',
        'CS 306','CS 307','CS 308','CS 309','CS 310',
        'CS 401','CS 402','CS 403','CS 404','CS 405','CS 406'
    )
);

-- Step 1: Remove quiz answers linked to quizzes of these subjects
DELETE qa FROM student_quiz_attempts qa
    JOIN quiz q ON qa.quiz_id = q.quiz_id
    JOIN subject s ON q.subject_id = s.subject_id
    WHERE s.subject_code IN (
        'CC 101','CC 102','CC 103','CC 104',
        'GE 101','GE 102','GE 103','GE 104','GE 105','GE 106','GE 107','GE 108','GE 109','GE 110',
        'PE 101','PE 102','PE 103','PE 104','NSTP 101','NSTP 102',
        'IT 201','IT 202','IT 203','IT 204','IT 205','IT 206','IT 207','IT 208',
        'IT 301','IT 302','IT 303','IT 304','IT 305','IT 306',
        'IT 307','IT 308','IT 309','IT 310','IT 311','IT 312',
        'IT 401','IT 402','IT 403','IT 404','IT 405','IT 406',
        'CS 101','CS 102','CS 103','CS 104','MATH 101','MATH 102','MATH 201','MATH 202',
        'GE 111','GE 112','GE 113','GE 114','GE 115','GE 116','GE 117','GE 118','GE 119',
        'PE 111','PE 112','PE 113','PE 114','NSTP 111','NSTP 112',
        'CS 201','CS 202','CS 203','CS 204','CS 205','CS 206','CS 207',
        'CS 301','CS 302','CS 303','CS 304','CS 305',
        'CS 306','CS 307','CS 308','CS 309','CS 310',
        'CS 401','CS 402','CS 403','CS 404','CS 405','CS 406'
    );

-- Step 2: Remove quiz questions linked to these subjects' quizzes
DELETE qq FROM quiz_questions qq
    JOIN quiz q ON qq.quiz_id = q.quiz_id
    JOIN subject s ON q.subject_id = s.subject_id
    WHERE s.subject_code IN (
        'CC 101','CC 102','CC 103','CC 104',
        'GE 101','GE 102','GE 103','GE 104','GE 105','GE 106','GE 107','GE 108','GE 109','GE 110',
        'PE 101','PE 102','PE 103','PE 104','NSTP 101','NSTP 102',
        'IT 201','IT 202','IT 203','IT 204','IT 205','IT 206','IT 207','IT 208',
        'IT 301','IT 302','IT 303','IT 304','IT 305','IT 306',
        'IT 307','IT 308','IT 309','IT 310','IT 311','IT 312',
        'IT 401','IT 402','IT 403','IT 404','IT 405','IT 406',
        'CS 101','CS 102','CS 103','CS 104','MATH 101','MATH 102','MATH 201','MATH 202',
        'GE 111','GE 112','GE 113','GE 114','GE 115','GE 116','GE 117','GE 118','GE 119',
        'PE 111','PE 112','PE 113','PE 114','NSTP 111','NSTP 112',
        'CS 201','CS 202','CS 203','CS 204','CS 205','CS 206','CS 207',
        'CS 301','CS 302','CS 303','CS 304','CS 305',
        'CS 306','CS 307','CS 308','CS 309','CS 310',
        'CS 401','CS 402','CS 403','CS 404','CS 405','CS 406'
    );

-- Step 3: Remove quizzes for these subjects
DELETE q FROM quiz q
    JOIN subject s ON q.subject_id = s.subject_id
    WHERE s.subject_code IN (
        'CC 101','CC 102','CC 103','CC 104',
        'GE 101','GE 102','GE 103','GE 104','GE 105','GE 106','GE 107','GE 108','GE 109','GE 110',
        'PE 101','PE 102','PE 103','PE 104','NSTP 101','NSTP 102',
        'IT 201','IT 202','IT 203','IT 204','IT 205','IT 206','IT 207','IT 208',
        'IT 301','IT 302','IT 303','IT 304','IT 305','IT 306',
        'IT 307','IT 308','IT 309','IT 310','IT 311','IT 312',
        'IT 401','IT 402','IT 403','IT 404','IT 405','IT 406',
        'CS 101','CS 102','CS 103','CS 104','MATH 101','MATH 102','MATH 201','MATH 202',
        'GE 111','GE 112','GE 113','GE 114','GE 115','GE 116','GE 117','GE 118','GE 119',
        'PE 111','PE 112','PE 113','PE 114','NSTP 111','NSTP 112',
        'CS 201','CS 202','CS 203','CS 204','CS 205','CS 206','CS 207',
        'CS 301','CS 302','CS 303','CS 304','CS 305',
        'CS 306','CS 307','CS 308','CS 309','CS 310',
        'CS 401','CS 402','CS 403','CS 404','CS 405','CS 406'
    );

-- Step 4: Remove student progress for lessons of these subjects
DELETE sp FROM student_progress sp
    JOIN lessons l ON sp.lessons_id = l.lessons_id
    JOIN subject s ON l.subject_id = s.subject_id
    WHERE s.subject_code IN (
        'CC 101','CC 102','CC 103','CC 104',
        'GE 101','GE 102','GE 103','GE 104','GE 105','GE 106','GE 107','GE 108','GE 109','GE 110',
        'PE 101','PE 102','PE 103','PE 104','NSTP 101','NSTP 102',
        'IT 201','IT 202','IT 203','IT 204','IT 205','IT 206','IT 207','IT 208',
        'IT 301','IT 302','IT 303','IT 304','IT 305','IT 306',
        'IT 307','IT 308','IT 309','IT 310','IT 311','IT 312',
        'IT 401','IT 402','IT 403','IT 404','IT 405','IT 406',
        'CS 101','CS 102','CS 103','CS 104','MATH 101','MATH 102','MATH 201','MATH 202',
        'GE 111','GE 112','GE 113','GE 114','GE 115','GE 116','GE 117','GE 118','GE 119',
        'PE 111','PE 112','PE 113','PE 114','NSTP 111','NSTP 112',
        'CS 201','CS 202','CS 203','CS 204','CS 205','CS 206','CS 207',
        'CS 301','CS 302','CS 303','CS 304','CS 305',
        'CS 306','CS 307','CS 308','CS 309','CS 310',
        'CS 401','CS 402','CS 403','CS 404','CS 405','CS 406'
    );

-- Step 5: Remove lessons for these subjects
DELETE l FROM lessons l
    JOIN subject s ON l.subject_id = s.subject_id
    WHERE s.subject_code IN (
        'CC 101','CC 102','CC 103','CC 104',
        'GE 101','GE 102','GE 103','GE 104','GE 105','GE 106','GE 107','GE 108','GE 109','GE 110',
        'PE 101','PE 102','PE 103','PE 104','NSTP 101','NSTP 102',
        'IT 201','IT 202','IT 203','IT 204','IT 205','IT 206','IT 207','IT 208',
        'IT 301','IT 302','IT 303','IT 304','IT 305','IT 306',
        'IT 307','IT 308','IT 309','IT 310','IT 311','IT 312',
        'IT 401','IT 402','IT 403','IT 404','IT 405','IT 406',
        'CS 101','CS 102','CS 103','CS 104','MATH 101','MATH 102','MATH 201','MATH 202',
        'GE 111','GE 112','GE 113','GE 114','GE 115','GE 116','GE 117','GE 118','GE 119',
        'PE 111','PE 112','PE 113','PE 114','NSTP 111','NSTP 112',
        'CS 201','CS 202','CS 203','CS 204','CS 205','CS 206','CS 207',
        'CS 301','CS 302','CS 303','CS 304','CS 305',
        'CS 306','CS 307','CS 308','CS 309','CS 310',
        'CS 401','CS 402','CS 403','CS 404','CS 405','CS 406'
    );

-- Step 6: Remove student enrollments for offerings of these subjects
DELETE ss FROM student_subject ss
    JOIN subject_offered so ON ss.subject_offered_id = so.subject_offered_id
    JOIN subject s ON so.subject_id = s.subject_id
    WHERE s.subject_code IN (
        'CC 101','CC 102','CC 103','CC 104',
        'GE 101','GE 102','GE 103','GE 104','GE 105','GE 106','GE 107','GE 108','GE 109','GE 110',
        'PE 101','PE 102','PE 103','PE 104','NSTP 101','NSTP 102',
        'IT 201','IT 202','IT 203','IT 204','IT 205','IT 206','IT 207','IT 208',
        'IT 301','IT 302','IT 303','IT 304','IT 305','IT 306',
        'IT 307','IT 308','IT 309','IT 310','IT 311','IT 312',
        'IT 401','IT 402','IT 403','IT 404','IT 405','IT 406',
        'CS 101','CS 102','CS 103','CS 104','MATH 101','MATH 102','MATH 201','MATH 202',
        'GE 111','GE 112','GE 113','GE 114','GE 115','GE 116','GE 117','GE 118','GE 119',
        'PE 111','PE 112','PE 113','PE 114','NSTP 111','NSTP 112',
        'CS 201','CS 202','CS 203','CS 204','CS 205','CS 206','CS 207',
        'CS 301','CS 302','CS 303','CS 304','CS 305',
        'CS 306','CS 307','CS 308','CS 309','CS 310',
        'CS 401','CS 402','CS 403','CS 404','CS 405','CS 406'
    );

-- Step 7: Remove subject offerings for these subjects
DELETE so FROM subject_offered so
    JOIN subject s ON so.subject_id = s.subject_id
    WHERE s.subject_code IN (
        'CC 101','CC 102','CC 103','CC 104',
        'GE 101','GE 102','GE 103','GE 104','GE 105','GE 106','GE 107','GE 108','GE 109','GE 110',
        'PE 101','PE 102','PE 103','PE 104','NSTP 101','NSTP 102',
        'IT 201','IT 202','IT 203','IT 204','IT 205','IT 206','IT 207','IT 208',
        'IT 301','IT 302','IT 303','IT 304','IT 305','IT 306',
        'IT 307','IT 308','IT 309','IT 310','IT 311','IT 312',
        'IT 401','IT 402','IT 403','IT 404','IT 405','IT 406',
        'CS 101','CS 102','CS 103','CS 104','MATH 101','MATH 102','MATH 201','MATH 202',
        'GE 111','GE 112','GE 113','GE 114','GE 115','GE 116','GE 117','GE 118','GE 119',
        'PE 111','PE 112','PE 113','PE 114','NSTP 111','NSTP 112',
        'CS 201','CS 202','CS 203','CS 204','CS 205','CS 206','CS 207',
        'CS 301','CS 302','CS 303','CS 304','CS 305',
        'CS 306','CS 307','CS 308','CS 309','CS 310',
        'CS 401','CS 402','CS 403','CS 404','CS 405','CS 406'
    );

-- Step 8: Remove the subjects themselves (includes original placeholder codes)
DELETE FROM subject WHERE subject_code IN (
    -- original placeholder subjects (no spaces in code)
    'CC101','CC102','CC103','CC104','CC105','CC106',
    'GE101','GE102','GE103','GE104','GE105','GE106','GE107','GE108','GE109',
    'IT101','IT102','IT103','IT104','IT105',
    'sample123','IT4ever',
    'CC 101','CC 102','CC 103','CC 104',
    'GE 101','GE 102','GE 103','GE 104','GE 105','GE 106','GE 107','GE 108','GE 109','GE 110',
    'PE 101','PE 102','PE 103','PE 104','NSTP 101','NSTP 102',
    'IT 201','IT 202','IT 203','IT 204','IT 205','IT 206','IT 207','IT 208',
    'IT 301','IT 302','IT 303','IT 304','IT 305','IT 306',
    'IT 307','IT 308','IT 309','IT 310','IT 311','IT 312',
    'IT 401','IT 402','IT 403','IT 404','IT 405','IT 406',
    'CS 101','CS 102','CS 103','CS 104','MATH 101','MATH 102','MATH 201','MATH 202',
    'GE 111','GE 112','GE 113','GE 114','GE 115','GE 116','GE 117','GE 118','GE 119',
    'PE 111','PE 112','PE 113','PE 114','NSTP 111','NSTP 112',
    'CS 201','CS 202','CS 203','CS 204','CS 205','CS 206','CS 207',
    'CS 301','CS 302','CS 303','CS 304','CS 305',
    'CS 306','CS 307','CS 308','CS 309','CS 310',
    'CS 401','CS 402','CS 403','CS 404','CS 405','CS 406'
);

-- =============================================
-- BSIT — Bachelor of Science in Information Technology
-- program_id = 1
-- =============================================

-- YEAR 1 · 1ST SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CC 101',   'Introduction to Computing',              'Fundamentals of computing concepts, computer systems, and digital technologies.',                        3, 2, 1, 'None',     1, 1, 1, 'active'),
('CC 102',   'Computer Programming 1',                 'Introduction to programming using structured programming concepts with Python.',                          3, 2, 1, 'None',     1, 1, 1, 'active'),
('GE 101',   'Understanding the Self',                 'Exploration of the self, identity, and personal development in the context of society.',                  3, 3, 0, 'None',     1, 1, 1, 'active'),
('GE 102',   'Mathematics in the Modern World',        'Application of mathematics in modern contexts including data analysis and problem-solving.',               3, 3, 0, 'None',     1, 1, 1, 'active'),
('GE 103',   'Purposive Communication',                'Development of communication skills for academic and professional contexts.',                              3, 3, 0, 'None',     1, 1, 1, 'active'),
('PE 101',   'Physical Education 1',                   'Movement competency training and physical wellness fundamentals.',                                         2, 2, 0, 'None',     1, 1, 1, 'active'),
('NSTP 101', 'National Service Training Program 1',   'Civic welfare training service component of the NSTP program.',                                            3, 3, 0, 'None',     1, 1, 1, 'active');

-- YEAR 1 · 2ND SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CC 103',   'Computer Programming 2',                 'Advanced programming concepts including functions, arrays, and file handling.',                            3, 2, 1, 'CC 102',   1, 1, 2, 'active'),
('CC 104',   'Discrete Mathematics for IT',            'Mathematical foundations for computer science including logic, sets, and relations.',                      3, 3, 0, 'None',     1, 1, 2, 'active'),
('GE 104',   'Art Appreciation',                       'Survey of visual and performing arts traditions and their cultural significance.',                          3, 3, 0, 'None',     1, 1, 2, 'active'),
('GE 105',   'Science, Technology and Society',        'Critical examination of science and technology in social, ethical, and cultural contexts.',                3, 3, 0, 'None',     1, 1, 2, 'active'),
('GE 106',   'Readings in Philippine History',         'Analysis of primary sources and historical narratives in Philippine history.',                             3, 3, 0, 'None',     1, 1, 2, 'active'),
('PE 102',   'Physical Education 2',                   'Fitness exercises and rhythmic activities for physical development.',                                      2, 2, 0, 'PE 101',   1, 1, 2, 'active'),
('NSTP 102', 'National Service Training Program 2',   'Community engagement and service learning continuation of NSTP 1.',                                        3, 3, 0, 'NSTP 101', 1, 1, 2, 'active');

-- YEAR 2 · 1ST SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('IT 201',   'Platform Technologies',                  'Study of computing platforms, hardware, software, and system architecture.',                              3, 2, 1, 'CC 101',   1, 2, 1, 'active'),
('IT 202',   'Data Structures and Algorithms',         'Linear and non-linear data structures and fundamental algorithm design techniques.',                       3, 2, 1, 'CC 103',   1, 2, 1, 'active'),
('IT 203',   'Human-Computer Interaction 1',           'Principles of user interface design, usability, and user experience.',                                     3, 3, 0, 'None',     1, 2, 1, 'active'),
('IT 204',   'Networking 1',                           'Fundamentals of computer networks, TCP/IP protocols, and network topologies.',                             3, 2, 1, 'IT 201',   1, 2, 1, 'active'),
('GE 107',   'Ethics',                                 'Philosophical foundations of ethics and moral reasoning in professional contexts.',                         3, 3, 0, 'None',     1, 2, 1, 'active'),
('PE 103',   'Physical Education 3',                   'Team sports and cooperative physical activities for health and wellness.',                                  2, 2, 0, 'PE 102',   1, 2, 1, 'active');

-- YEAR 2 · 2ND SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('IT 205',   'Database Management Systems',            'Relational database design, SQL, normalization, and database administration.',                             3, 2, 1, 'IT 202',   1, 2, 2, 'active'),
('IT 206',   'Object-Oriented Programming',            'OOP concepts including classes, inheritance, polymorphism, and design patterns.',                          3, 2, 1, 'CC 103',   1, 2, 2, 'active'),
('IT 207',   'Operating Systems',                      'Operating system concepts, process management, memory, and file systems.',                                 3, 2, 1, 'IT 201',   1, 2, 2, 'active'),
('IT 208',   'Networking 2',                           'Advanced networking topics including routing, switching, and network security.',                            3, 2, 1, 'IT 204',   1, 2, 2, 'active'),
('GE 108',   'The Contemporary World',                 'Understanding globalization, international relations, and world affairs.',                                  3, 3, 0, 'None',     1, 2, 2, 'active'),
('PE 104',   'Physical Education 4',                   'Individual and dual sports for lifetime physical activity.',                                               2, 2, 0, 'PE 103',   1, 2, 2, 'active');

-- YEAR 3 · 1ST SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('IT 301',   'Application Dev and Emerging Technologies', 'Mobile and web application development using modern frameworks and technologies.',                    3, 2, 1, 'IT 206',   1, 3, 1, 'active'),
('IT 302',   'Systems Integration and Architecture 1', 'Integration of enterprise systems, middleware, and service-oriented architecture.',                        3, 2, 1, 'IT 207',   1, 3, 1, 'active'),
('IT 303',   'Information Assurance and Security 1',   'Fundamentals of cybersecurity, risk management, and security policies.',                                   3, 3, 0, 'IT 205',   1, 3, 1, 'active'),
('IT 304',   'Web Systems and Technologies 1',         'Front-end web development using HTML5, CSS3, JavaScript, and responsive design.',                         3, 2, 1, 'IT 206',   1, 3, 1, 'active'),
('IT 305',   'Social and Professional Issues in IT',   'Ethical, legal, and professional responsibilities of IT practitioners.',                                   3, 3, 0, 'None',     1, 3, 1, 'active'),
('IT 306',   'IT Elective 1',                          'Specialized topic in information technology (e.g., Cloud Computing, IoT).',                               3, 2, 1, 'IT 206',   1, 3, 1, 'active');

-- YEAR 3 · 2ND SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('IT 307',   'Systems Integration and Architecture 2', 'Advanced system integration patterns, microservices, and cloud architecture.',                             3, 2, 1, 'IT 302',   1, 3, 2, 'active'),
('IT 308',   'Web Systems and Technologies 2',         'Back-end web development, server-side programming, and RESTful APIs.',                                    3, 2, 1, 'IT 304',   1, 3, 2, 'active'),
('IT 309',   'Information Assurance and Security 2',   'Advanced cybersecurity techniques, penetration testing, and incident response.',                           3, 2, 1, 'IT 303',   1, 3, 2, 'active'),
('IT 310',   'Capstone Project and Research 1',        'Research methodology and initial development of the capstone project.',                                    3, 1, 2, 'IT 301',   1, 3, 2, 'active'),
('IT 311',   'IT Elective 2',                          'Specialized topic in information technology (e.g., Data Analytics, AI Tools).',                           3, 2, 1, 'IT 306',   1, 3, 2, 'active'),
('IT 312',   'IT Elective 3',                          'Specialized topic in information technology (e.g., DevOps, Blockchain).',                                 3, 2, 1, 'IT 306',   1, 3, 2, 'active');

-- YEAR 4 · 1ST SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('IT 401',   'Systems Administration and Maintenance', 'System administration, server management, and IT infrastructure maintenance.',                             3, 2, 1, 'IT 307',   1, 4, 1, 'active'),
('IT 402',   'Capstone Project and Research 2',        'Completion, documentation, and oral defense of the capstone project.',                                    3, 1, 2, 'IT 310',   1, 4, 1, 'active'),
('IT 403',   'IT Elective 4',                          'Specialized topic in information technology (e.g., Project Management, ERP).',                            3, 2, 1, 'IT 311',   1, 4, 1, 'active'),
('IT 404',   'IT Elective 5',                          'Advanced specialized topic in information technology.',                                                    3, 2, 1, 'IT 312',   1, 4, 1, 'active'),
('GE 109',   'Life and Works of Rizal',                'Life, works, and writings of Jose P. Rizal in the context of Philippine nationalism.',                    3, 3, 0, 'None',     1, 4, 1, 'active');

-- YEAR 4 · 2ND SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('IT 405',   'IT Practicum (486 hours)',                'On-the-job training in industry setting applying IT knowledge and skills.',                               6, 0, 6, 'IT 402',   1, 4, 2, 'active'),
('IT 406',   'Technopreneurship',                      'Entrepreneurship in technology, business models, and startup fundamentals.',                               3, 3, 0, 'None',     1, 4, 2, 'active'),
('GE 110',   'Philippine Popular Culture',             'Analysis of popular culture, media, and cultural production in the Philippines.',                          3, 3, 0, 'None',     1, 4, 2, 'active');


-- =============================================
-- BSCS — Bachelor of Science in Computer Science
-- program_id = 2
-- =============================================

-- YEAR 1 · 1ST SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CS 101',   'Introduction to Computer Science',       'Overview of CS disciplines, problem solving, and computational thinking.',                                3, 3, 0, 'None',     2, 1, 1, 'active'),
('CS 102',   'Computer Programming 1',                 'Structured programming fundamentals using C++ with emphasis on algorithms.',                               3, 2, 1, 'None',     2, 1, 1, 'active'),
('MATH 101', 'Calculus 1',                             'Limits, derivatives, and their applications in scientific computing.',                                     3, 3, 0, 'None',     2, 1, 1, 'active'),
('GE 111',   'Understanding the Self',                 'Exploration of the self, identity, and personal development in the context of society.',                  3, 3, 0, 'None',     2, 1, 1, 'active'),
('GE 112',   'Purposive Communication',                'Development of communication skills for academic and professional contexts.',                              3, 3, 0, 'None',     2, 1, 1, 'active'),
('PE 111',   'Physical Education 1',                   'Movement competency training and physical wellness fundamentals.',                                         2, 2, 0, 'None',     2, 1, 1, 'active'),
('NSTP 111', 'National Service Training Program 1',   'Civic welfare training service component of the NSTP program.',                                            3, 3, 0, 'None',     2, 1, 1, 'active');

-- YEAR 1 · 2ND SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CS 103',   'Computer Programming 2',                 'Advanced structured programming, functions, and introduction to OOP.',                                    3, 2, 1, 'CS 102',   2, 1, 2, 'active'),
('CS 104',   'Logic and Set Theory',                   'Propositional logic, predicate logic, proof techniques, and set theory.',                                  3, 3, 0, 'None',     2, 1, 2, 'active'),
('MATH 102', 'Calculus 2',                             'Integral calculus, sequences, series, and multivariable calculus.',                                        3, 3, 0, 'MATH 101', 2, 1, 2, 'active'),
('GE 113',   'Mathematics in the Modern World',        'Application of mathematics in modern contexts including data analysis.',                                   3, 3, 0, 'None',     2, 1, 2, 'active'),
('GE 114',   'Readings in Philippine History',         'Analysis of primary sources and historical narratives in Philippine history.',                             3, 3, 0, 'None',     2, 1, 2, 'active'),
('PE 112',   'Physical Education 2',                   'Fitness exercises and rhythmic activities for physical development.',                                      2, 2, 0, 'PE 111',   2, 1, 2, 'active'),
('NSTP 112', 'National Service Training Program 2',   'Community engagement and service learning continuation of NSTP 1.',                                        3, 3, 0, 'NSTP 111', 2, 1, 2, 'active');

-- YEAR 2 · 1ST SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CS 201',   'Data Structures',                        'Linear and non-linear data structures, trees, graphs, and hash tables.',                                   3, 2, 1, 'CS 103',   2, 2, 1, 'active'),
('CS 202',   'Discrete Mathematics',                   'Combinatorics, graph theory, recurrence relations, and formal languages.',                                 3, 3, 0, 'CS 104',   2, 2, 1, 'active'),
('CS 203',   'Computer Organization and Architecture', 'Digital logic, computer organization, instruction sets, and memory hierarchy.',                           3, 3, 0, 'CS 101',   2, 2, 1, 'active'),
('MATH 201', 'Linear Algebra',                         'Vector spaces, matrices, eigenvalues, and applications in computing.',                                     3, 3, 0, 'MATH 102', 2, 2, 1, 'active'),
('GE 115',   'Art Appreciation',                       'Survey of visual and performing arts traditions and their cultural significance.',                          3, 3, 0, 'None',     2, 2, 1, 'active'),
('PE 113',   'Physical Education 3',                   'Team sports and cooperative physical activities for health and wellness.',                                  2, 2, 0, 'PE 112',   2, 2, 1, 'active');

-- YEAR 2 · 2ND SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CS 204',   'Algorithm Analysis and Design',          'Algorithm complexity, design paradigms: divide-and-conquer, greedy, dynamic programming.',                3, 2, 1, 'CS 201',   2, 2, 2, 'active'),
('CS 205',   'Database Systems',                       'Relational model, SQL, query optimization, and transaction management.',                                   3, 2, 1, 'CS 201',   2, 2, 2, 'active'),
('CS 206',   'Object-Oriented Programming',            'OOP paradigms, design patterns, UML, and component-based development.',                                   3, 2, 1, 'CS 103',   2, 2, 2, 'active'),
('CS 207',   'Operating Systems',                      'Process scheduling, memory management, file systems, and virtualization.',                                 3, 3, 0, 'CS 203',   2, 2, 2, 'active'),
('MATH 202', 'Probability and Statistics',             'Probability theory, statistical inference, and applications in computing.',                                3, 3, 0, 'MATH 201', 2, 2, 2, 'active'),
('PE 114',   'Physical Education 4',                   'Individual and dual sports for lifetime physical activity.',                                               2, 2, 0, 'PE 113',   2, 2, 2, 'active');

-- YEAR 3 · 1ST SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CS 301',   'Programming Languages',                  'Programming language paradigms, syntax, semantics, and implementation principles.',                       3, 3, 0, 'CS 206',   2, 3, 1, 'active'),
('CS 302',   'Software Engineering 1',                 'Software development lifecycle, requirements engineering, and software design.',                           3, 2, 1, 'CS 204',   2, 3, 1, 'active'),
('CS 303',   'Theory of Computation',                  'Automata theory, formal languages, computability, and complexity classes.',                                3, 3, 0, 'CS 202',   2, 3, 1, 'active'),
('CS 304',   'Computer Networks',                      'Network architectures, protocols, TCP/IP, routing, and network security basics.',                         3, 2, 1, 'CS 207',   2, 3, 1, 'active'),
('CS 305',   'CS Elective 1',                          'Specialized advanced topic in CS (e.g., Computer Vision, Natural Language Processing).',                  3, 2, 1, 'CS 206',   2, 3, 1, 'active'),
('GE 116',   'Ethics',                                 'Philosophical foundations of ethics and moral reasoning in professional contexts.',                         3, 3, 0, 'None',     2, 3, 1, 'active');

-- YEAR 3 · 2ND SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CS 306',   'Software Engineering 2',                 'Software testing, project management, software metrics, and quality assurance.',                           3, 2, 1, 'CS 302',   2, 3, 2, 'active'),
('CS 307',   'Artificial Intelligence',                'Search algorithms, knowledge representation, machine learning, and expert systems.',                       3, 2, 1, 'CS 304',   2, 3, 2, 'active'),
('CS 308',   'Compiler Design',                        'Lexical analysis, parsing, semantic analysis, and code generation techniques.',                            3, 2, 1, 'CS 303',   2, 3, 2, 'active'),
('CS 309',   'Research Methods in CS',                 'Research design, technical writing, and scholarly communication in computer science.',                     3, 3, 0, 'None',     2, 3, 2, 'active'),
('CS 310',   'CS Elective 2',                          'Specialized advanced topic in CS (e.g., Distributed Systems, Information Security).',                     3, 2, 1, 'CS 305',   2, 3, 2, 'active'),
('GE 117',   'Science, Technology and Society',        'Critical examination of science and technology in social, ethical, and cultural contexts.',                3, 3, 0, 'None',     2, 3, 2, 'active');

-- YEAR 4 · 1ST SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CS 401',   'Machine Learning',                       'Supervised and unsupervised learning, neural networks, and model evaluation.',                             3, 2, 1, 'CS 307',   2, 4, 1, 'active'),
('CS 402',   'Thesis Writing 1',                       'Research proposal, literature review, and initial system design and implementation.',                     3, 1, 2, 'CS 309',   2, 4, 1, 'active'),
('CS 403',   'CS Elective 3',                          'Specialized advanced topic in CS (e.g., Quantum Computing, Robotics).',                                   3, 2, 1, 'CS 310',   2, 4, 1, 'active'),
('CS 404',   'CS Elective 4',                          'Specialized advanced topic in CS (e.g., High-Performance Computing, Bioinformatics).',                    3, 2, 1, 'CS 310',   2, 4, 1, 'active'),
('GE 118',   'The Contemporary World',                 'Understanding globalization, international relations, and world affairs.',                                  3, 3, 0, 'None',     2, 4, 1, 'active');

-- YEAR 4 · 2ND SEMESTER
INSERT INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CS 405',   'Thesis Writing 2',                       'Final thesis completion, documentation, and oral defense.',                                                3, 1, 2, 'CS 402',   2, 4, 2, 'active'),
('CS 406',   'CS Practicum (300 hours)',                'Industry internship applying computer science principles in real-world settings.',                         6, 0, 6, 'CS 402',   2, 4, 2, 'active'),
('GE 119',   'Life and Works of Rizal',                'Life, works, and writings of Jose P. Rizal in the context of Philippine nationalism.',                    3, 3, 0, 'None',     2, 4, 2, 'active');


-- =============================================
-- VERIFICATION QUERIES (optional — run to check)
-- =============================================
-- SELECT program_id, year_level, semester, COUNT(*) AS subjects, SUM(units) AS total_units
-- FROM subject
-- GROUP BY program_id, year_level, semester
-- ORDER BY program_id, year_level, semester;
