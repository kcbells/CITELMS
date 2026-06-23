-- =============================================
-- Add Semester Management Tables & Remove Redundancy
-- Run this in phpMyAdmin (run each section separately if errors)
-- =============================================

-- 1. Create sem_type table (semester types: 1st, 2nd, summer)
CREATE TABLE IF NOT EXISTS sem_type (
    sem_type_id INT(11) NOT NULL AUTO_INCREMENT,
    sem_level INT(11) NOT NULL,
    PRIMARY KEY (sem_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert default semester types
INSERT INTO sem_type (sem_type_id, sem_level) VALUES
(1, 1),  -- 1st Semester
(2, 2),  -- 2nd Semester
(3, 3)   -- Summer/Midyear
ON DUPLICATE KEY UPDATE sem_level = VALUES(sem_level);

-- 2. Create semester table (actual semester instances)
CREATE TABLE IF NOT EXISTS semester (
    semester_id INT(11) NOT NULL AUTO_INCREMENT,
    semester_name VARCHAR(100) NOT NULL,
    academic_year VARCHAR(20) NOT NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    status ENUM('active', 'inactive', 'upcoming') DEFAULT 'inactive',
    sem_type_id INT(11) NOT NULL,
    PRIMARY KEY (semester_id),
    FOREIGN KEY (sem_type_id) REFERENCES sem_type(sem_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Insert sample semesters
INSERT INTO semester (semester_name, academic_year, start_date, end_date, status, sem_type_id) VALUES
('1st Semester', '2024-2025', '2024-08-15', '2024-12-20', 'active', 1),
('2nd Semester', '2024-2025', '2025-01-06', '2025-05-30', 'upcoming', 2),
('Summer', '2024-2025', '2025-06-01', '2025-07-31', 'inactive', 3)
ON DUPLICATE KEY UPDATE semester_name = VALUES(semester_name);

-- =============================================
-- 3. CLEAN UP subject_offered - Remove Redundant Columns
-- =============================================

-- Set semester_id = 1 for all existing records (simple approach)
UPDATE subject_offered SET semester_id = 1 WHERE semester_id IS NULL;

-- Now remove the redundant columns
ALTER TABLE subject_offered DROP COLUMN IF EXISTS academic_year;
ALTER TABLE subject_offered DROP COLUMN IF EXISTS semester;

-- =============================================
-- 4. Add semester_id to subject table (if not exists)
-- =============================================
ALTER TABLE subject ADD COLUMN IF NOT EXISTS semester_id INT(11) NULL;
UPDATE subject SET semester_id = 1 WHERE semester_id IS NULL;

-- =============================================
-- 5. Add semester_id to curriculum table (if not exists)
-- =============================================
ALTER TABLE curriculum ADD COLUMN IF NOT EXISTS semester_id INT(11) NULL;
UPDATE curriculum SET semester_id = 1 WHERE semester_id IS NULL;

-- =============================================
-- 6. Add Foreign Key Constraints (optional - run separately if needed)
-- =============================================
-- ALTER TABLE subject_offered ADD FOREIGN KEY (semester_id) REFERENCES semester(semester_id);
-- ALTER TABLE subject ADD FOREIGN KEY (semester_id) REFERENCES semester(semester_id);
-- ALTER TABLE curriculum ADD FOREIGN KEY (semester_id) REFERENCES semester(semester_id);
