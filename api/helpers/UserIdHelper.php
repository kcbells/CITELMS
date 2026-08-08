<?php
/**
 * Login ID format rules:
 * - Students: numbers only (dashes/dots allowed, no letters)
 * - Instructors/Staff: ID must contain at least one letter
 */
class UserIdHelper {

    public static function hasLetters($id) {
        return preg_match('/[A-Za-z]/', (string)$id) === 1;
    }

    public static function isValidStudentId($id) {
        $id = trim((string)$id);
        if ($id === '' || strlen($id) < 3) {
            return false;
        }
        if (self::hasLetters($id)) {
            return false;
        }
        return preg_match('/^[0-9.\-]+$/', $id) === 1;
    }

    public static function isValidStaffId($id) {
        $id = trim((string)$id);
        if ($id === '' || strlen($id) < 3) {
            return false;
        }
        return self::hasLetters($id) && preg_match('/^[A-Za-z0-9.\-]+$/', $id) === 1;
    }

    public static function findUserForLogin($userId) {
        $userId = trim((string)$userId);
        if ($userId === '') {
            return null;
        }

        // Email address — look up any active user by email
        if (filter_var($userId, FILTER_VALIDATE_EMAIL)) {
            return db()->fetchOne(
                "SELECT * FROM users WHERE email = ? AND status = 'active' LIMIT 1",
                [$userId]
            );
        }

        // Try staff/admin/dean/program head first — employee IDs aren't guaranteed to
        // contain letters (e.g. "02-2424"), so check this regardless of ID format.
        $user = db()->fetchOne(
            "SELECT * FROM users
             WHERE employee_id = ?
               AND role IN ('instructor', 'admin', 'dean', 'program_head')
             LIMIT 1",
            [$userId]
        );
        if ($user) return $user;

        // Fall back to student lookup — some student IDs contain letters (e.g. "02-2324-bj")
        return db()->fetchOne(
            "SELECT * FROM users WHERE student_id = ? AND role = 'student' LIMIT 1",
            [$userId]
        );
    }

    public static function loginIdHint($userId) {
        if (self::hasLetters($userId)) {
            return 'Use your Employee ID (must include letters) for instructor/staff login.';
        }
        return 'Student IDs must be numbers only — no letters. Example: 02-2324-08200';
    }

    public static function loginIdErrorMessage($userId) {
        if (filter_var($userId, FILTER_VALIDATE_EMAIL)) {
            return 'No active account found for this email address.';
        }
        if (self::hasLetters($userId)) {
            if (!self::isValidStaffId($userId)) {
                return 'Invalid ID format.';
            }
            return 'No account found for this ID. Please check your Student ID or Employee ID.';
        }
        if (!self::isValidStudentId($userId) && !self::isValidStaffId($userId)) {
            return 'Invalid ID format.';
        }
        return 'No account found for this ID. Please check your Student ID or Employee ID.';
    }
}
