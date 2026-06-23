# Dean Module - Security Fixes Implementation Guide

## Quick Start: Critical Fixes

This guide provides **copy-paste ready code** to fix all critical security issues in the dean module.

---

## Fix #1: Add CSRF Protection (CRITICAL)

### Step 1: Verify Auth Class Has CSRF Methods

Check that `config/auth.php` has these methods (lines 386-410):
```php
public static function csrfToken() { ... }
public static function verifyCsrfToken($token) { ... }
public static function csrfField() { ... }
```

✅ **Already included in your Auth class!**

### Step 2: Add CSRF to subject-offerings.php

**Location:** `pages/dean/subject-offerings.php`

**Find this code (around line 34):**
```php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';
```

**Replace with:**
```php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // CSRF Protection
    if (!Auth::verifyCsrfToken($_POST['csrf_token'] ?? '')) {
        $error = 'Security validation failed. Please try again.';
    } else {
        $postAction = $_POST['action'] ?? '';
```

**Then find the closing of the POST block and add:**
```php
        } // Close the else from CSRF check
    } // Close the POST check
}
```

**Find all forms in the file and add CSRF field:**

**Around line 270 (Create/Edit Form):**
```php
<form method="POST" class="form-card">
    <?= Auth::csrfField() ?>  <!-- ADD THIS LINE -->
    <input type="hidden" name="action" value="<?= $action === 'create' ? 'create' : 'update' ?>">
```

**Around line 190 (Delete Form):**
```php
<form method="POST" style="display:inline" onsubmit="return confirm('Delete this offering?')">
    <?= Auth::csrfField() ?>  <!-- ADD THIS LINE -->
    <input type="hidden" name="action" value="delete">
```

### Step 3: Add CSRF to faculty-assignments.php

**Location:** `pages/dean/faculty-assignments.php`

**Find this code (around line 35):**
```php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postAction = $_POST['action'] ?? '';
```

**Replace with:**
```php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // CSRF Protection
    if (!Auth::verifyCsrfToken($_POST['csrf_token'] ?? '')) {
        $error = 'Security validation failed. Please try again.';
    } else {
        $postAction = $_POST['action'] ?? '';
```

**Add closing braces at the end of POST block**

**Find all forms and add CSRF field:**

**Around line 215 (Assignment Form):**
```php
<form method="POST" class="add-assignment-form">
    <?= Auth::csrfField() ?>  <!-- ADD THIS LINE -->
    <input type="hidden" name="action" value="assign">
```

**Around line 245 (Status Update Form):**
```php
<form method="POST" style="display:inline">
    <?= Auth::csrfField() ?>  <!-- ADD THIS LINE -->
    <input type="hidden" name="action" value="update_status">
```

**Around line 255 (Unassign Form):**
```php
<form method="POST" style="display:inline" onsubmit="return confirm('Remove this assignment?')">
    <?= Auth::csrfField() ?>  <!-- ADD THIS LINE -->
    <input type="hidden" name="action" value="unassign">
```

### Step 4: Add CSRF to profile.php

**Location:** `pages/dean/profile.php`

**Find (around line 22):**
```php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
```

**Replace with:**
```php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // CSRF Protection
    if (!Auth::verifyCsrfToken($_POST['csrf_token'] ?? '')) {
        $error = 'Security validation failed. Please try again.';
    } else {
```

**Add closing brace before the final closing of POST block**

**Find forms (around lines 140 and 175) and add:**
```php
<form method="POST">
    <?= Auth::csrfField() ?>  <!-- ADD THIS LINE -->
    <input type="hidden" name="update_profile" value="1">
```

```php
<form method="POST">
    <?= Auth::csrfField() ?>  <!-- ADD THIS LINE -->
    <input type="hidden" name="change_password" value="1">
```

---

## Fix #2: Validate Status Input (CRITICAL)

### faculty-assignments.php

**Find this code (line 71):**
```php
if ($postAction === 'update_status') {
    $assignmentId = (int)$_POST['assignment_id'];
    $status = $_POST['status'];
    db()->execute("UPDATE faculty_subject SET status = ?, updated_at = NOW() WHERE faculty_subject_id = ?", [$status, $assignmentId]);
    $success = 'Status updated!';
}
```

**Replace with:**
```php
if ($postAction === 'update_status') {
    $assignmentId = (int)$_POST['assignment_id'];
    $status = $_POST['status'] ?? '';

    // Validate status against whitelist
    $allowedStatuses = ['active', 'inactive'];
    if (!in_array($status, $allowedStatuses, true)) {
        $error = 'Invalid status value.';
    } else {
        db()->execute(
            "UPDATE faculty_subject SET status = ?, updated_at = NOW() WHERE faculty_subject_id = ?",
            [$status, $assignmentId]
        );
        $success = 'Status updated successfully!';
    }
}
```

### subject-offerings.php

**Find (line 41):**
```php
$status = $_POST['status'] ?? 'active';
```

**Replace with:**
```php
$status = $_POST['status'] ?? 'active';

// Validate status
$allowedStatuses = ['active', 'inactive'];
if (!in_array($status, $allowedStatuses, true)) {
    $error = 'Invalid status value.';
    $status = 'active'; // Safe default
}
```

---

## Fix #3: Improve Password Validation (HIGH)

### profile.php

**Find this code (line 58):**
```php
} elseif (strlen($new) < 6) {
    $error = 'New password must be at least 6 characters long.';
}
```

**Replace with:**
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
    $error = 'Password must contain at least one special character (!@#$%^&*).';
}
```

---

## Fix #4: Add Input Validation (HIGH)

### profile.php - Validate Names and Email

**Find (line 26):**
```php
$firstName = trim($_POST['first_name'] ?? '');
$lastName = trim($_POST['last_name'] ?? '');
$email = trim($_POST['email'] ?? '');

if (empty($firstName) || empty($lastName) || empty($email)) {
    $error = 'Please fill in all required profile fields.';
}
```

**Replace with:**
```php
$firstName = trim($_POST['first_name'] ?? '');
$lastName = trim($_POST['last_name'] ?? '');
$email = trim($_POST['email'] ?? '');

if (empty($firstName) || empty($lastName) || empty($email)) {
    $error = 'Please fill in all required profile fields.';
} elseif (!preg_match('/^[a-zA-Z\s\'-]{2,50}$/u', $firstName)) {
    $error = 'First name can only contain letters, spaces, hyphens, and apostrophes (2-50 characters).';
} elseif (!preg_match('/^[a-zA-Z\s\'-]{2,50}$/u', $lastName)) {
    $error = 'Last name can only contain letters, spaces, hyphens, and apostrophes (2-50 characters).';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $error = 'Please enter a valid email address.';
} elseif (strlen($email) > 100) {
    $error = 'Email address is too long (maximum 100 characters).';
}
```

---

## Fix #5: Add Error Handling (HIGH)

### Example for subject-offerings.php

**Find (line 56):**
```php
if ($postAction === 'create') {
    db()->execute(
        "INSERT INTO subject_offered (subject_id, academic_year, semester, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())",
        [$subjectId, $academicYear, $semester, $status]
    );
    header("Location: subject-offerings.php?success=created");
    exit;
}
```

**Replace with:**
```php
if ($postAction === 'create') {
    try {
        $result = db()->execute(
            "INSERT INTO subject_offered (subject_id, academic_year, semester, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())",
            [$subjectId, $academicYear, $semester, $status]
        );

        if ($result) {
            // Log the action
            db()->execute(
                "INSERT INTO activity_logs (users_id, activity_type, activity_description, created_at)
                 VALUES (?, 'offering_created', ?, NOW())",
                [Auth::id(), "Created offering for subject ID $subjectId - $academicYear $semester"]
            );

            header("Location: subject-offerings.php?success=created");
            exit;
        } else {
            $error = 'Failed to create offering. Please try again.';
        }
    } catch (Exception $e) {
        error_log('Error creating offering: ' . $e->getMessage());
        $error = 'An error occurred while creating the offering. Please contact support.';
    }
}
```

---

## Fix #6: Add Null Checks

### subject-offerings.php

**Find (line 77):**
```php
$hasSections = db()->fetchOne("SELECT COUNT(*) as count FROM section WHERE subject_offered_id = ?", [$deleteId])['count'];
```

**Replace with:**
```php
$result = db()->fetchOne("SELECT COUNT(*) as count FROM section WHERE subject_offered_id = ?", [$deleteId]);
$hasSections = $result ? (int)$result['count'] : 0;
```

### dashboard.php

**Find (line 34):**
```php
$avgEnrollmentPerSection = $totalSections > 0 ? round($totalEnrollments / $totalSections, 1) : 0;
```

**Replace with:**
```php
$avgEnrollmentPerSection = ($totalSections > 0 && $totalEnrollments > 0) ?
    round($totalEnrollments / $totalSections, 1) : 'N/A';
```

**Then update HTML (around line 142) to handle 'N/A':**
```php
<div class="stat-footer">
    <?php if ($avgEnrollmentPerSection === 'N/A'): ?>
    No sections yet
    <?php else: ?>
    Avg <?= $avgEnrollmentPerSection ?> students/section
    <?php endif; ?>
</div>
```

---

## Fix #7: Add Transaction Support

### subject-offerings.php - Delete Operation

**Find (line 75):**
```php
if ($postAction === 'delete') {
    $deleteId = (int)$_POST['offering_id'];
    $result = db()->fetchOne("SELECT COUNT(*) as count FROM section WHERE subject_offered_id = ?", [$deleteId]);
    $hasSections = $result ? (int)$result['count'] : 0;
    if ($hasSections > 0) {
        $error = "Cannot delete offering with $hasSections sections.";
    } else {
        db()->execute("DELETE FROM faculty_subject WHERE subject_offered_id = ?", [$deleteId]);
        db()->execute("DELETE FROM subject_offered WHERE subject_offered_id = ?", [$deleteId]);
        header("Location: subject-offerings.php?success=deleted");
        exit;
    }
}
```

**Replace with:**
```php
if ($postAction === 'delete') {
    $deleteId = (int)$_POST['offering_id'];
    $result = db()->fetchOne("SELECT COUNT(*) as count FROM section WHERE subject_offered_id = ?", [$deleteId]);
    $hasSections = $result ? (int)$result['count'] : 0;

    if ($hasSections > 0) {
        $error = "Cannot delete offering with $hasSections sections. Remove sections first.";
    } else {
        try {
            // Use transaction for atomicity
            db()->beginTransaction();

            // Delete related faculty assignments
            db()->execute("DELETE FROM faculty_subject WHERE subject_offered_id = ?", [$deleteId]);

            // Delete the offering
            db()->execute("DELETE FROM subject_offered WHERE subject_offered_id = ?", [$deleteId]);

            // Log the action
            db()->execute(
                "INSERT INTO activity_logs (users_id, activity_type, activity_description, created_at)
                 VALUES (?, 'offering_deleted', ?, NOW())",
                [Auth::id(), "Deleted offering ID $deleteId"]
            );

            db()->commit();

            header("Location: subject-offerings.php?success=deleted");
            exit;
        } catch (Exception $e) {
            db()->rollback();
            error_log('Error deleting offering: ' . $e->getMessage());
            $error = 'Failed to delete offering. Please try again.';
        }
    }
}
```

**Note:** You'll need to add these methods to your database class:
```php
public function beginTransaction() {
    return $this->pdo->beginTransaction();
}

public function commit() {
    return $this->pdo->commit();
}

public function rollback() {
    return $this->pdo->rollBack();
}
```

---

## New Feature #1: Add Audit Logging

### Create Audit Log Helper Function

Add to `config/helpers.php` (or create if doesn't exist):

```php
<?php
/**
 * Log dean activity
 */
function logDeanActivity($activityType, $description, $relatedId = null) {
    if (!Auth::check()) return;

    try {
        db()->execute(
            "INSERT INTO activity_logs (users_id, activity_type, activity_description, related_id, ip_address, user_agent, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())",
            [
                Auth::id(),
                $activityType,
                $description,
                $relatedId,
                $_SERVER['REMOTE_ADDR'] ?? 'unknown',
                $_SERVER['HTTP_USER_AGENT'] ?? 'unknown'
            ]
        );
    } catch (Exception $e) {
        error_log('Failed to log activity: ' . $e->getMessage());
    }
}
```

### Use in dean pages:

```php
// After creating offering
logDeanActivity('offering_created', "Created offering: $subjectCode - $academicYear $semester", $offeringId);

// After assigning faculty
logDeanActivity('faculty_assigned', "Assigned instructor ID $instructorId to offering ID $subjectOfferedId", $subjectOfferedId);

// After updating profile
logDeanActivity('profile_updated', "Updated profile information");

// After changing password
logDeanActivity('password_changed', "Changed account password");
```

---

## New Feature #2: Add Pagination

### Example for instructors.php

**Add at top of file (after line 20):**
```php
$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = 20;
$offset = ($page - 1) * $perPage;
```

**Update query to add LIMIT/OFFSET:**
```php
$instructors = db()->fetchAll(
    "SELECT u.*,
        (SELECT COUNT(DISTINCT fs.faculty_subject_id) ...)
     FROM users u
     $whereClause
     ORDER BY u.last_name, u.first_name
     LIMIT ? OFFSET ?",  // ADD THIS
    array_merge($params, [$perPage, $offset])  // ADD LIMIT/OFFSET TO PARAMS
);

// Get total count for pagination
$totalQuery = "SELECT COUNT(*) as count FROM users u $whereClause";
$totalResult = db()->fetchOne($totalQuery, $params);
$totalInstructors = $totalResult ? (int)$totalResult['count'] : 0;
$totalPages = ceil($totalInstructors / $perPage);
```

**Add pagination HTML (before closing page-content div):**
```php
<?php if ($totalPages > 1): ?>
<div class="pagination">
    <?php if ($page > 1): ?>
    <a href="?page=<?= $page - 1 ?>&search=<?= urlencode($search) ?>&status=<?= urlencode($statusFilter) ?>" class="page-btn">Previous</a>
    <?php endif; ?>

    <?php for ($i = max(1, $page - 2); $i <= min($totalPages, $page + 2); $i++): ?>
    <a href="?page=<?= $i ?>&search=<?= urlencode($search) ?>&status=<?= urlencode($statusFilter) ?>"
       class="page-btn <?= $i === $page ? 'active' : '' ?>">
        <?= $i ?>
    </a>
    <?php endfor; ?>

    <?php if ($page < $totalPages): ?>
    <a href="?page=<?= $page + 1 ?>&search=<?= urlencode($search) ?>&status=<?= urlencode($statusFilter) ?>" class="page-btn">Next</a>
    <?php endif; ?>
</div>
<?php endif; ?>
```

**Add CSS:**
```css
.pagination {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 24px;
}
.page-btn {
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    text-decoration: none;
    color: #374151;
    font-size: 14px;
}
.page-btn:hover {
    background: #f3f4f6;
}
.page-btn.active {
    background: #2563eb;
    color: #ffffff;
    border-color: #2563eb;
}
```

---

## Testing Checklist

After implementing fixes:

### CSRF Protection
- [ ] Try submitting form without CSRF token (should fail)
- [ ] Try submitting with invalid token (should fail)
- [ ] Normal form submission works

### Input Validation
- [ ] Try entering numbers in name fields (should fail)
- [ ] Try invalid email format (should fail)
- [ ] Try weak password (should fail with specific message)
- [ ] Try invalid status value (should fail)

### Error Handling
- [ ] Database errors show user-friendly message
- [ ] Operations that fail don't show success message
- [ ] Errors are logged to error log

### Pagination
- [ ] Navigate between pages
- [ ] Filters persist across pages
- [ ] Last page shows correct number of items

### Audit Logging
- [ ] Check activity_logs table after each action
- [ ] Verify user_id, activity_type, and description are correct

---

## Summary

**Files to Modify:**
1. `pages/dean/subject-offerings.php` - Add CSRF, validation, error handling
2. `pages/dean/faculty-assignments.php` - Add CSRF, validation, error handling
3. `pages/dean/profile.php` - Add CSRF, strong password rules, input validation
4. `pages/dean/dashboard.php` - Fix null checks, add pagination
5. `pages/dean/instructors.php` - Add pagination
6. `pages/dean/subjects.php` - Add pagination
7. `pages/dean/reports.php` - Add export functionality
8. `config/database.php` - Add transaction methods
9. `config/helpers.php` - Add audit logging function (create if doesn't exist)

**Estimated Time:** 6-8 hours for all critical and high-priority fixes

**Next Steps:**
1. Backup current files
2. Implement fixes one file at a time
3. Test each fix thoroughly
4. Deploy to staging environment first
5. Run full security audit
6. Deploy to production
