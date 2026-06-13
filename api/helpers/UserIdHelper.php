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

        if (self::hasLetters($userId)) {
            if (!self::isValidStaffId($userId)) {
                return null;
            }
            return db()->fetchOne(
                "SELECT * FROM users
                 WHERE employee_id = ?
                   AND role IN ('instructor', 'admin', 'dean')
                 LIMIT 1",
                [$userId]
            );
        }

        if (!self::isValidStudentId($userId)) {
            return null;
        }

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
        if (self::hasLetters($userId)) {
            if (!self::isValidStaffId($userId)) {
                return 'Invalid Employee ID format. Staff IDs must contain letters.';
            }
            return 'No instructor/staff account found for this Employee ID.';
        }
        if (!self::isValidStudentId($userId)) {
            return 'Student IDs must contain numbers only (no letters).';
        }
        return 'No student account found for this Student ID.';
    }
}
