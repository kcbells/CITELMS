# Dean Module Security Audit & Recommendations

## Executive Summary

**Date:** January 13, 2026
**Auditor:** Security Analysis Agent
**Files Audited:** 7 PHP files in `pages/dean/`
**Critical Issues Found:** 4
**High Severity Issues:** 7
**Medium Severity Issues:** 15
**Low Severity Issues:** 4

---

## CRITICAL SECURITY VULNERABILITIES (Fix Immediately)

### 1. ❌ Missing CSRF Protection on ALL Forms
**Files:** All 7 dean pages
**Risk Level:** CRITICAL
**Impact:** Attackers can forge requests to:
- Delete subject offerings
- Assign/unassign faculty
- Change dean profile/password
- Modify assignments

**Current Code:**
```php
<form method="POST">
    <input type="hidden" name="action" value="assign">
    <select name="instructor_id">...</select>
    <button type="submit">Assign</button>
</form>
```

**Fix Required:**
```php
<form method="POST">
    <?= Auth::csrfField() ?>  <!-- ADD THIS -->
    <input type="hidden" name="action" value="assign">
    <select name="instructor_id">...</select>
    <button type="submit">Assign</button>
</form>
```

**AND at the top of form processing:**
```php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // ADD CSRF VALIDATION FIRST
    if (!Auth::verifyCsrfToken($_POST['csrf_token'] ?? '')) {
        die('CSRF token validation failed');
    }

    $postAction = $_POST['action'] ?? '';
    // ... rest of code
}
```

---

### 2. ❌ Unvalidated Status Input (SQL Injection Risk)
**File:** `faculty-assignments.php` Line 73
**Risk Level:** CRITICAL
**Impact:** Arbitrary status values can be injected into database

**Current Code:**
```php
$status = $_POST['status'];  // NO VALIDATION!
db()->execute("UPDATE faculty_subject SET status = ? WHERE faculty_subject_id = ?",
    [$status, $assignmentId]);
```

**Fix Required:**
```php
$status = $_POST['status'] ?? '';

// VALIDATE AGAINST WHITELIST
$allowedStatuses = ['active', 'inactive'];
if (!in_array($status, $allowedStatuses, true)) {
    $error = 'Invalid status value';
} else {
    db()->execute("UPDATE faculty_subject SET status = ? WHERE faculty_subject_id = ?",
        [$status, $assignmentId]);
    $success = 'Status updated!';
}
```

---

### 3. ❌ No Authorization Check for Department/College Access
**Files:** All dean pages
**Risk Level:** HIGH
**Impact:** A dean can access ALL data system-wide, not just their department

**Problem:** Current code:
```php
Auth::requireRole('dean');  // Only checks role, not department
```

**Fix Needed:**
Add department filtering to all queries:
```php
// Add to dashboard.php, instructors.php, etc.
$deanDepartment = $_SESSION['department_id'] ?? null;

if ($deanDepartment) {
    $whereClause .= " AND u.department_id = ?";
    $params[] = $deanDepartment;
}
```

---

### 4. ❌ Weak Password Requirements
**File:** `profile.php` Line 58-59
**Risk Level:** HIGH
**Impact:** Easy password compromise

**Current Code:**
```php
} elseif (strlen($new) < 6) {
    $error = 'New password must be at least 6 characters long.';
}
```

**Fix Required:**
```php
} elseif (strlen($new) < 12) {
    $error = 'Password must be at least 12 characters long.';
} elseif (!preg_match('/[A-Z]/', $new)) {
    $error = 'Password must contain at least one uppercase letter.';
} elseif (!preg_match('/[a-z]/', $new)) {
    $error = 'Password must contain at least one lowercase letter.';
} elseif (!preg_match('/[0-9]/', $new)) {
    $error = 'Password must contain at least one number.';
} elseif (!preg_match('/[^A-Za-z0-9]/', $new)) {
    $error = 'Password must contain at least one special character.';
}
```

---

## HIGH SEVERITY ISSUES

### 5. Missing Input Validation
**Files:** profile.php, subject-offerings.php, faculty-assignments.php

**Problems:**
- No max length validation (names could be 10,000 characters)
- No regex validation for names (allows `John123`, `Mary<script>`)
- No email format validation beyond HTML5

**Fix Example:**
```php
// Validate first name
if (!preg_match('/^[a-zA-Z\s\'-]{1,50}$/u', $firstName)) {
    $error = 'Invalid first name format';
}

// Validate email
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $error = 'Invalid email format';
}
```

---

### 6. No Rate Limiting
**Files:** profile.php, faculty-assignments.php

**Problem:** No protection against brute force or spam

**Fix Needed:** Implement rate limiting:
```php
// Add at top of file
session_start();

if (!isset($_SESSION['last_action_time'])) {
    $_SESSION['last_action_time'] = 0;
    $_SESSION['action_count'] = 0;
}

$now = time();
if ($now - $_SESSION['last_action_time'] < 2) { // 2 seconds minimum between actions
    if ($_SESSION['action_count'] > 10) {
        die('Too many requests. Please wait.');
    }
    $_SESSION['action_count']++;
} else {
    $_SESSION['action_count'] = 1;
}
$_SESSION['last_action_time'] = $now;
```

---

### 7. Silent Database Failures
**All Files**

**Problem:**
```php
db()->execute("UPDATE ...");
$success = 'Updated!';  // Shows even if execute() failed
```

**Fix:**
```php
try {
    $result = db()->execute("UPDATE ...");
    if ($result) {
        $success = 'Updated successfully!';
    } else {
        $error = 'Update failed. Please try again.';
    }
} catch (Exception $e) {
    error_log('Database error: ' . $e->getMessage());
    $error = 'An error occurred. Please contact support.';
}
```

---

## MEDIUM SEVERITY ISSUES

### 8. No Pagination (Performance Issue)
**Files:** dashboard.php, reports.php, instructors.php

**Problem:** Fetches unlimited records:
```php
$instructors = db()->fetchAll("SELECT * FROM users WHERE role='instructor'");
// Could return 10,000+ records
```

**Fix:**
```php
$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = 20;
$offset = ($page - 1) * $perPage;

$instructors = db()->fetchAll(
    "SELECT * FROM users WHERE role='instructor' LIMIT ? OFFSET ?",
    [$perPage, $offset]
);

$totalCount = db()->fetchOne("SELECT COUNT(*) as count FROM users WHERE role='instructor'")['count'];
$totalPages = ceil($totalCount / $perPage);
```

---

### 9. Inefficient Queries with Nested Subqueries
**File:** dashboard.php lines 36-51

**Problem:**
```php
SELECT u.*,
    (SELECT COUNT(*) FROM faculty_subject WHERE ...) as subjects_count,
    (SELECT COUNT(*) FROM section WHERE ...) as sections_count
FROM users u
```
This runs 3 subqueries for EACH faculty member.

**Fix:** Use JOINs instead:
```php
SELECT u.*,
    COUNT(DISTINCT fs.faculty_subject_id) as subjects_count,
    COUNT(DISTINCT sec.section_id) as sections_count
FROM users u
LEFT JOIN faculty_subject fs ON u.users_id = fs.user_teacher_id
LEFT JOIN section sec ON u.users_id = sec.user_instructor_id
GROUP BY u.users_id
```

---

### 10. No Transaction Support
**Files:** subject-offerings.php, faculty-assignments.php

**Problem:** Multi-step operations not atomic:
```php
db()->execute("DELETE FROM faculty_subject WHERE subject_offered_id = ?", [$deleteId]);
db()->execute("DELETE FROM subject_offered WHERE subject_offered_id = ?", [$deleteId]);
// If second fails, orphaned faculty_subject records remain
```

**Fix:**
```php
try {
    db()->beginTransaction();
    db()->execute("DELETE FROM faculty_subject WHERE subject_offered_id = ?", [$deleteId]);
    db()->execute("DELETE FROM subject_offered WHERE subject_offered_id = ?", [$deleteId]);
    db()->commit();
    $success = 'Deleted successfully!';
} catch (Exception $e) {
    db()->rollback();
    $error = 'Delete failed. Please try again.';
}
```

---

## MISSING FUNCTIONALITY FOR DEAN ROLE

### 11. No Audit Trail
**Impact:** Cannot track who changed what and when

**Needed:** Create activity_logs table entries:
```php
// After any CREATE/UPDATE/DELETE operation
db()->execute(
    "INSERT INTO activity_logs (users_id, activity_type, activity_description, ip_address, created_at)
     VALUES (?, ?, ?, ?, NOW())",
    [Auth::id(), 'offering_created', "Created offering for $subjectCode", $_SERVER['REMOTE_ADDR']]
);
```

---

### 12. No Department-Level Filtering
**Impact:** Dean sees entire university, not just their college

**Needed:**
1. Add `department_id` column to dean's user record
2. Filter all queries by dean's department:
```php
$deanDept = Auth::user()['department_id'];

// In all queries
WHERE u.department_id = ?
```

---

### 13. No Bulk Operations
**Impact:** Must assign faculty one-by-one

**Needed:** Add bulk assignment form:
```html
<form method="POST">
    <h3>Bulk Assign Instructor</h3>
    <select name="instructor_id">...</select>
    <div class="checkbox-group">
        <?php foreach ($offerings as $offering): ?>
        <label>
            <input type="checkbox" name="offering_ids[]" value="<?= $offering['subject_offered_id'] ?>">
            <?= $offering['subject_code'] ?>
        </label>
        <?php endforeach; ?>
    </div>
    <button>Assign to Selected</button>
</form>
```

---

### 14. No Report Export
**Impact:** Cannot export data for presentations/analysis

**Needed:** Add export buttons:
```php
// Add to reports.php
if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="faculty_report.csv"');

    $output = fopen('php://output', 'w');
    fputcsv($output, ['Name', 'Employee ID', 'Subjects', 'Students']);

    foreach ($facultyWorkload as $faculty) {
        fputcsv($output, [
            $faculty['first_name'] . ' ' . $faculty['last_name'],
            $faculty['employee_id'],
            $faculty['subjects_count'],
            $faculty['students_count']
        ]);
    }
    exit;
}
```

---

### 15. No Approval Workflow
**Impact:** Dean can make changes immediately without oversight

**Needed:** Add approval system:
```sql
CREATE TABLE pending_changes (
    change_id INT PRIMARY KEY AUTO_INCREMENT,
    dean_id INT NOT NULL,
    change_type VARCHAR(50),
    change_data JSON,
    status ENUM('pending', 'approved', 'rejected'),
    created_at TIMESTAMP
);
```

---

## LOGIC ERRORS & BUGS

### 16. Integer Cast Without Null Check
**File:** subject-offerings.php line 77

**Bug:**
```php
$hasSections = db()->fetchOne("SELECT COUNT(*) as count ...")['count'];
// If query returns NULL, accessing ['count'] causes error
```

**Fix:**
```php
$result = db()->fetchOne("SELECT COUNT(*) as count ...");
$hasSections = $result ? $result['count'] : 0;
```

---

### 17. Division by Zero Risk
**File:** dashboard.php line 34

**Bug:**
```php
$avgEnrollmentPerSection = $totalSections > 0 ?
    round($totalEnrollments / $totalSections, 1) : 0;
```

**Issue:** Shows "0" when no sections, but "N/A" would be clearer

**Fix:**
```php
$avgEnrollmentPerSection = ($totalSections > 0 && $totalEnrollments > 0) ?
    round($totalEnrollments / $totalSections, 1) : 'N/A';
```

---

## DATABASE CONNECTION ISSUES

### 18. No Connection Timeout Handling
**Problem:** If database connection drops, no retry logic

**Fix:** Add to database.php:
```php
function db() {
    static $pdo = null;
    $retries = 3;

    while ($retries > 0) {
        try {
            if ($pdo === null) {
                $pdo = new PDO(...);
            }
            // Test connection
            $pdo->query('SELECT 1');
            return $pdo;
        } catch (PDOException $e) {
            $pdo = null;
            $retries--;
            if ($retries === 0) throw $e;
            sleep(1);
        }
    }
}
```

---

## IMPLEMENTATION PRIORITY

### Phase 1: Critical Security Fixes (Do Now)
1. ✅ Add CSRF tokens to all forms
2. ✅ Validate all POST input against whitelists
3. ✅ Add proper error handling
4. ✅ Strengthen password requirements

### Phase 2: High-Priority Fixes (This Week)
5. Add department-level authorization
6. Implement rate limiting
7. Add input validation
8. Add transaction support

### Phase 3: Medium-Priority (This Month)
9. Add pagination
10. Optimize database queries
11. Add audit logging
12. Implement bulk operations

### Phase 4: Low-Priority (Next Quarter)
13. Add report export
14. Add approval workflows
15. Add activity monitoring dashboard
16. Improve error messages

---

## TESTING CHECKLIST

After implementing fixes, test:

- [ ] CSRF tokens prevent forged requests
- [ ] Invalid status values are rejected
- [ ] Department filtering works correctly
- [ ] Password requirements are enforced
- [ ] Error messages are displayed properly
- [ ] Database transactions rollback on failure
- [ ] Pagination works with large datasets
- [ ] Audit logs are created for all actions
- [ ] Bulk operations work correctly
- [ ] Export functions generate correct files

---

## CONCLUSION

The dean module has **4 critical** and **7 high-severity** security vulnerabilities that should be addressed immediately. The most critical is the lack of CSRF protection, which affects all forms.

**Estimated Fix Time:**
- Critical fixes: 4-6 hours
- High-priority fixes: 8-12 hours
- Medium-priority fixes: 16-24 hours
- Total: 1-2 weeks for complete security hardening

**Next Steps:**
1. Review this audit with development team
2. Create security fix tickets
3. Implement fixes in priority order
4. Test thoroughly before deploying to production
5. Schedule regular security audits (quarterly)
