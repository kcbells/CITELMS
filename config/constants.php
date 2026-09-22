<?php
/**
 * ============================================================
 * CIT-LMS Application Constants
 * ============================================================
 * Central location for all application settings and constants.
 * Change these values to configure the application.
 * ============================================================
 */

// Prevent direct access
if (!defined('BASE_URL')) {

    // Load .env (safe to call multiple times — env.php guards itself)
    require_once __DIR__ . '/env.php';

    // ============================================================
    // APPLICATION SETTINGS
    // ============================================================

    /**
     * Base URL — set via .env BASE_URL, otherwise derived from where the
     * project actually sits under the web root. Deriving it (instead of
     * hardcoding a folder name) means renaming the project folder does not
     * silently break login redirects, avatars and e-mail links.
     */
    if (!function_exists('cit_detect_base_url')) {
        function cit_detect_base_url(): string {
            $projectRoot = str_replace('\\', '/', realpath(__DIR__ . '/..') ?: dirname(__DIR__));
            $docRoot     = str_replace('\\', '/', realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '');

            // Served from inside the web root: use the sub-path ('' if it IS the root).
            if ($docRoot !== '' && stripos($projectRoot, $docRoot) === 0) {
                return rtrim(substr($projectRoot, strlen($docRoot)), '/');
            }
            // CLI (cron) or an aliased vhost: assume /<folder-name>.
            return '/' . basename($projectRoot);
        }
    }

    define('BASE_URL', envValue('BASE_URL') ?: cit_detect_base_url());
    
    /**
     * Application Information
     */
    define('APP_NAME', 'CIT-LMS');
    define('APP_FULL_NAME', 'PHINMA Cagayan de Oro College - Learning Management System');
    define('APP_VERSION', '1.0.0');
    define('APP_DESCRIPTION', 'A comprehensive Learning Management System for CIT students and instructors.');
    
    /**
     * School Information
     */
    define('SCHOOL_NAME', 'PHINMA Cagayan de Oro College');
    define('SCHOOL_SHORT', 'PHINMA-CDO');
    define('SCHOOL_ADDRESS', 'Max Suniel St., Carmen, Cagayan de Oro City');
    define('SCHOOL_EMAIL', 'info@phinma-cdo.edu.ph');
    define('SCHOOL_PHONE', '(088) 123-4567');
    
    
    // ============================================================
    // USER ROLES
    // ============================================================
    
    define('ROLE_ADMIN', 'admin');
    define('ROLE_DEAN', 'dean');
    define('ROLE_INSTRUCTOR', 'instructor');
    define('ROLE_STUDENT', 'student');
    
    /**
     * All available roles
     */
    define('ALL_ROLES', [
        ROLE_ADMIN,
        ROLE_DEAN,
        ROLE_INSTRUCTOR,
        ROLE_STUDENT
    ]);
    
    /**
     * Role display names
     */
    define('ROLE_NAMES', [
        ROLE_ADMIN => 'Administrator',
        ROLE_DEAN => 'Dean',
        ROLE_INSTRUCTOR => 'Instructor',
        ROLE_STUDENT => 'Student'
    ]);
    
    
    // ============================================================
    // STATUS CONSTANTS
    // ============================================================
    
    // User Status
    define('STATUS_ACTIVE', 'active');
    define('STATUS_INACTIVE', 'inactive');
    define('STATUS_SUSPENDED', 'suspended');
    
    // Content Status
    define('STATUS_DRAFT', 'draft');
    define('STATUS_PUBLISHED', 'published');
    define('STATUS_ARCHIVED', 'archived');
    
    // Enrollment Status
    define('ENROLLMENT_ENROLLED', 'enrolled');
    define('ENROLLMENT_DROPPED', 'dropped');
    define('ENROLLMENT_COMPLETED', 'completed');
    define('ENROLLMENT_FAILED', 'failed');
    
    // Quiz Attempt Status
    define('ATTEMPT_IN_PROGRESS', 'in_progress');
    define('ATTEMPT_COMPLETED', 'completed');
    define('ATTEMPT_ABANDONED', 'abandoned');
    
    // Progress Status
    define('PROGRESS_NOT_STARTED', 'not_started');
    define('PROGRESS_IN_PROGRESS', 'in_progress');
    define('PROGRESS_COMPLETED', 'completed');
    
    
    // ============================================================
    // QUIZ & ASSESSMENT SETTINGS
    // ============================================================
    
    /**
     * Default passing rate for quizzes (percentage)
     */
    define('DEFAULT_PASSING_RATE', 60);
    
    /**
     * Maximum quiz attempts allowed
     */
    define('MAX_QUIZ_ATTEMPTS', 3);
    
    /**
     * Default quiz time limit (minutes)
     */
    define('DEFAULT_QUIZ_TIME_LIMIT', 30);
    
    /**
     * Question types
     */
    define('QUESTION_MULTIPLE_CHOICE', 'multiple_choice');
    define('QUESTION_TRUE_FALSE', 'true_false');
    define('QUESTION_MULTIPLE_ANSWER', 'multiple_answer');
    define('QUESTION_SHORT_ANSWER', 'short_answer');
    define('QUESTION_ESSAY', 'essay');
    
    define('QUESTION_TYPES', [
        QUESTION_MULTIPLE_CHOICE => 'Multiple Choice',
        QUESTION_TRUE_FALSE => 'True or False',
        QUESTION_MULTIPLE_ANSWER => 'Multiple Answer',
        QUESTION_SHORT_ANSWER => 'Short Answer',
        QUESTION_ESSAY => 'Essay'
    ]);
    
    
    // ============================================================
    // GRADING SETTINGS
    // ============================================================
    
    /**
     * Grade equivalents
     */
    define('GRADE_SCALE', [
        ['min' => 97, 'max' => 100, 'grade' => '1.00', 'description' => 'Excellent'],
        ['min' => 94, 'max' => 96, 'grade' => '1.25', 'description' => 'Excellent'],
        ['min' => 91, 'max' => 93, 'grade' => '1.50', 'description' => 'Very Good'],
        ['min' => 88, 'max' => 90, 'grade' => '1.75', 'description' => 'Very Good'],
        ['min' => 85, 'max' => 87, 'grade' => '2.00', 'description' => 'Good'],
        ['min' => 82, 'max' => 84, 'grade' => '2.25', 'description' => 'Good'],
        ['min' => 79, 'max' => 81, 'grade' => '2.50', 'description' => 'Satisfactory'],
        ['min' => 76, 'max' => 78, 'grade' => '2.75', 'description' => 'Satisfactory'],
        ['min' => 75, 'max' => 75, 'grade' => '3.00', 'description' => 'Passing'],
        ['min' => 0, 'max' => 74, 'grade' => '5.00', 'description' => 'Failed']
    ]);
    
    /**
     * Proficiency levels based on percentage
     */
    define('PROFICIENCY_LEVELS', [
        ['min' => 90, 'max' => 100, 'level' => 'Outstanding', 'color' => '#10b981'],
        ['min' => 85, 'max' => 89, 'level' => 'Very Satisfactory', 'color' => '#3b82f6'],
        ['min' => 80, 'max' => 84, 'level' => 'Satisfactory', 'color' => '#8b5cf6'],
        ['min' => 75, 'max' => 79, 'level' => 'Fairly Satisfactory', 'color' => '#f59e0b'],
        ['min' => 0, 'max' => 74, 'level' => 'Did Not Meet Expectations', 'color' => '#ef4444']
    ]);
    
    
    // ============================================================
    // FILE UPLOAD SETTINGS
    // ============================================================
    
    /**
     * Maximum file upload size (in bytes)
     * 10MB = 10 * 1024 * 1024 = 10485760
     */
    define('MAX_FILE_SIZE', 10 * 1024 * 1024);
    
    /**
     * Maximum file size in human readable format
     */
    define('MAX_FILE_SIZE_TEXT', '10MB');
    
    /**
     * Allowed file extensions for lesson materials
     */
    define('ALLOWED_DOCUMENT_TYPES', ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt']);
    
    /**
     * Allowed image extensions
     */
    define('ALLOWED_IMAGE_TYPES', ['jpg', 'jpeg', 'png', 'gif', 'webp']);
    
    /**
     * Allowed video extensions
     */
    define('ALLOWED_VIDEO_TYPES', ['mp4', 'webm', 'mov', 'avi']);
    
    /**
     * All allowed file types
     */
    define('ALLOWED_FILE_TYPES', array_merge(
        ALLOWED_DOCUMENT_TYPES,
        ALLOWED_IMAGE_TYPES,
        ALLOWED_VIDEO_TYPES
    ));
    
    /**
     * Upload paths (relative to project root)
     */
    define('UPLOAD_PATH', __DIR__ . '/../uploads/');
    define('MATERIALS_PATH', UPLOAD_PATH . 'materials/');
    define('SUBMISSIONS_PATH', UPLOAD_PATH . 'submissions/');
    define('AVATARS_PATH', UPLOAD_PATH . 'avatars/');
    
    
    // ============================================================
    // PAGINATION SETTINGS
    // ============================================================
    
    /**
     * Default items per page
     */
    define('ITEMS_PER_PAGE', 10);
    
    /**
     * Maximum items per page
     */
    define('MAX_ITEMS_PER_PAGE', 100);
    
    
    // ============================================================
    // ACADEMIC SETTINGS
    // ============================================================
    
    /**
     * Current academic year — derived from today's date (school year starts July)
     */
    $_ay_month = (int)date('n');
    $_ay_year  = (int)date('Y');
    $_ay_start = $_ay_month >= 7 ? $_ay_year : $_ay_year - 1;
    define('CURRENT_ACADEMIC_YEAR', $_ay_start . '-' . ($_ay_start + 1));
    unset($_ay_month, $_ay_year, $_ay_start);

    /**
     * Current semester — derived from today's date
     * 1st: Jul–Nov | 2nd: Dec–Apr | summer: May–Jun
     */
    $_sem_month = (int)date('n');
    define('CURRENT_SEMESTER', ($_sem_month >= 7 && $_sem_month <= 11) ? '1st'
        : (($_sem_month == 12 || $_sem_month <= 4) ? '2nd' : 'summer'));
    unset($_sem_month);
    
    /**
     * Semesters
     */
    define('SEMESTERS', ['1st', '2nd', 'summer']);
    
    /**
     * Year levels
     */
    define('YEAR_LEVELS', [1, 2, 3, 4]);
    
    define('YEAR_LEVEL_NAMES', [
        1 => '1st Year',
        2 => '2nd Year',
        3 => '3rd Year',
        4 => '4th Year'
    ]);
    
    
    // ============================================================
    // DATE & TIME SETTINGS
    // ============================================================
    
    /**
     * Default timezone
     */
    define('APP_TIMEZONE', 'Asia/Manila');
    date_default_timezone_set(APP_TIMEZONE);
    
    /**
     * Date formats
     */
    define('DATE_FORMAT', 'F j, Y');           // January 1, 2024
    define('DATE_FORMAT_SHORT', 'M j, Y');     // Jan 1, 2024
    define('TIME_FORMAT', 'g:i A');            // 1:30 PM
    define('DATETIME_FORMAT', 'F j, Y g:i A'); // January 1, 2024 1:30 PM
    
    
    // ============================================================
    // SESSION SETTINGS
    // ============================================================
    
    /**
     * Session timeout in seconds (2 hours)
     */
    define('SESSION_TIMEOUT', 7200);
    
    /**
     * Remember me duration in days
     */
    define('REMEMBER_ME_DAYS', 30);
    
    
    // ============================================================
    // API SETTINGS
    // ============================================================
    
    /**
     * API base path
     */
    define('API_PATH', BASE_URL . '/api');
    
    /**
     * Enable/disable API logging
     */
    define('API_LOGGING', true);
    
    
    // ============================================================
    // ERROR HANDLING
    // ============================================================
    
    /**
     * Debug mode - set to false in production!
     */
    define('DEBUG_MODE', envValue('APP_ENV') === 'development');

    if (DEBUG_MODE) {
        error_reporting(E_ALL);
        ini_set('display_errors', 1);
    } else {
        error_reporting(0);
        ini_set('display_errors', 0);
        ini_set('log_errors', 1);
    }
    
    /**
     * Log file paths
     */
    define('ERROR_LOG_PATH', __DIR__ . '/../logs/error.log');
    define('ACCESS_LOG_PATH', __DIR__ . '/../logs/access.log');
    define('SECURITY_LOG_PATH', __DIR__ . '/../logs/security.log');
    
    
    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================
    
    /**
     * Get grade equivalent for a percentage
     * 
     * @param float $percentage
     * @return array
     */
    function getGradeEquivalent($percentage) {
        foreach (GRADE_SCALE as $grade) {
            if ($percentage >= $grade['min'] && $percentage <= $grade['max']) {
                return $grade;
            }
        }
        return GRADE_SCALE[count(GRADE_SCALE) - 1]; // Return failing grade
    }
    
    /**
     * Get proficiency level for a percentage
     * 
     * @param float $percentage
     * @return array
     */
    function getProficiencyLevel($percentage) {
        foreach (PROFICIENCY_LEVELS as $level) {
            if ($percentage >= $level['min'] && $percentage <= $level['max']) {
                return $level;
            }
        }
        return PROFICIENCY_LEVELS[count(PROFICIENCY_LEVELS) - 1];
    }
    
    /**
     * Format file size to human readable
     * 
     * @param int $bytes
     * @return string
     */
    function formatFileSize($bytes) {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }
        return round($bytes, 2) . ' ' . $units[$i];
    }
    
    /**
     * Check if file type is allowed
     * 
     * @param string $filename
     * @return bool
     */
    function isAllowedFileType($filename) {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        return in_array($ext, ALLOWED_FILE_TYPES);
    }
    
    /**
     * Get role display name
     * 
     * @param string $role
     * @return string
     */
    function getRoleName($role) {
        return ROLE_NAMES[$role] ?? ucfirst($role);
    }
    
    /**
     * Format date using app settings
     * 
     * @param string $date
     * @param string $format
     * @return string
     */
    function formatDate($date, $format = null) {
        if (empty($date)) return '';
        $format = $format ?? DATE_FORMAT;
        return date($format, strtotime($date));
    }
    
    /**
     * Format datetime using app settings
     * 
     * @param string $datetime
     * @return string
     */
    function formatDateTime($datetime) {
        if (empty($datetime)) return '';
        return date(DATETIME_FORMAT, strtotime($datetime));
    }
    
    /**
     * Generate a URL with base path
     * 
     * @param string $path
     * @return string
     */
    function url($path = '') {
        return BASE_URL . '/' . ltrim($path, '/');
    }
    
    /**
     * Generate asset URL
     * 
     * @param string $path
     * @return string
     */
    function asset($path) {
        return BASE_URL . '/assets/' . ltrim($path, '/');
    }
    
    /**
     * Escape HTML to prevent XSS
     * 
     * @param string $string
     * @return string
     */
    function e($string) {
        return htmlspecialchars($string ?? '', ENT_QUOTES, 'UTF-8');
    }
    
    /**
     * Redirect to a URL
     * 
     * @param string $url
     */
    function redirect($url) {
        header('Location: ' . $url);
        exit;
    }
    
    /**
     * Get current page name
     * 
     * @return string
     */
    function currentPage() {
        return basename($_SERVER['PHP_SELF'], '.php');
    }
    
    /**
     * Check if current page matches
     * 
     * @param string $page
     * @return bool
     */
    function isPage($page) {
        return currentPage() === $page;
    }
}