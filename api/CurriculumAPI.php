<?php
/**
 * Curriculum API - View and manage curriculum subjects + versions
 */
require_once __DIR__ . '/../config/cors.php';
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$action = $_GET['action'] ?? 'view';

$isDean = Auth::role() === 'dean';

$_currPerms = [
    'programs'          => 'curriculum.view',
    'view'              => 'curriculum.view',
    'available'         => 'curriculum.view',
    'add'               => 'curriculum.edit',
    'create_subject'    => 'curriculum.edit',
    'update'            => 'curriculum.edit',
    'archive'           => 'curriculum.edit',
    'add_program'       => 'curriculum.edit',
    'list_versions'     => 'curriculum.view',
    'add_version'       => 'curriculum.edit',
    'upload_version_file'    => 'curriculum.edit',
    'delete_version'         => 'curriculum.edit',
    'import_pdf_curriculum'  => 'curriculum.edit',
];
if (!$isDean && isset($_currPerms[$action]) && !Auth::can($_currPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_currPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'programs':            handlePrograms();         break;
    case 'view':                handleView();             break;
    case 'available':           handleAvailable();        break;
    case 'add':                 handleAdd();              break;
    case 'create_subject':      handleCreateSubject();    break;
    case 'update':              handleUpdate();           break;
    case 'archive':             handleArchive();          break;
    case 'add_program':         handleAddProgram();       break;
    case 'list_versions':       handleListVersions();     break;
    case 'add_version':         handleAddVersion();       break;
    case 'upload_version_file': handleUploadVersionFile(); break;
    case 'delete_version':         handleDeleteVersion();          break;
    case 'import_pdf_curriculum':  handleImportPdfCurriculum();    break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ─── Auto-migrate: curriculum_versions table ───────────────────────────────

function ensureCurriculumVersionsTable(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $pdo = pdo();
        $pdo->exec("CREATE TABLE IF NOT EXISTS curriculum_versions (
            version_id   INT AUTO_INCREMENT PRIMARY KEY,
            program_id   INT NOT NULL,
            version_label VARCHAR(120) NOT NULL,
            description  TEXT,
            file_path    VARCHAR(500),
            file_name    VARCHAR(255),
            file_type    VARCHAR(50),
            is_active    TINYINT(1) DEFAULT 1,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cv_program (program_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        // Add version_id FK to curriculum if not present
        $col = $pdo->query("SHOW COLUMNS FROM curriculum LIKE 'version_id'")->fetchAll();
        if (!$col) {
            $pdo->exec("ALTER TABLE curriculum ADD COLUMN version_id INT NULL AFTER program_id");
        }

        // Add sem_num: per-curriculum-entry semester override (1/2/3) not FK
        $col2 = $pdo->query("SHOW COLUMNS FROM curriculum LIKE 'sem_num'")->fetchAll();
        if (!$col2) {
            $pdo->exec("ALTER TABLE curriculum ADD COLUMN sem_num TINYINT NULL DEFAULT NULL AFTER semester_id");
        }
    } catch (Exception $e) {
        error_log('ensureCurriculumVersionsTable: ' . $e->getMessage());
    }
}

// ─── Helper: dean's department_id ─────────────────────────────────────────

function deanDeptId(): int {
    static $cached = null;
    if ($cached !== null) return $cached;
    $row    = db()->fetchOne("SELECT department_id FROM users WHERE users_id = ?", [Auth::id()]);
    $cached = (int)($row['department_id'] ?? 0);
    return $cached;
}

// ─── Helper: is the current dean CAS (College of Arts and Sciences)? ──────
// CAS teaches the 1st/2nd-year general-education subjects that sit inside
// EVERY other department's curriculum (BSIT's, BSA's, BSCrim's, etc.) —
// it doesn't own any programs of its own via department_program. So a CAS
// dean gets a special scope: every active program is visible (not just
// ones linked to their department), but only that program's Year 1/2
// subjects — Year 3/4 (each department's own major subjects) must stay
// invisible to CAS. Detected by department_code rather than a schema
// change since 'CAS' is a fixed, already-seeded department.
function isDeanCAS(): bool {
    if (Auth::role() !== 'dean') return false;
    static $cas = null;
    if ($cas === null) {
        $deptId = deanDeptId();
        $code = $deptId ? db()->fetchOne("SELECT department_code FROM department WHERE department_id = ?", [$deptId])['department_code'] ?? '' : '';
        $cas = strtoupper($code) === 'CAS';
    }
    return $cas;
}

/** Year levels 3 and 4 are hidden for CAS wherever this SQL snippet is appended. */
function casYearLevelClause(string $col = 'c.year_level'): string {
    return isDeanCAS() ? " AND $col <= 2" : '';
}

// ─── Helper: verify dean can access a program (dept-scoped) ───────────────

function deanCanAccessProgram(int $programId): bool {
    if (Auth::role() !== 'dean') return true;
    if (isDeanCAS()) {
        return (bool)db()->fetchOne("SELECT 1 FROM program WHERE program_id = ? AND status = 'active'", [$programId]);
    }
    $deptId = deanDeptId();
    if (!$deptId) return false;
    $link = db()->fetchOne(
        "SELECT 1 FROM department_program WHERE department_id = ? AND program_id = ?",
        [$deptId, $programId]
    );
    return (bool)$link;
}

// ─── Programs list (all dept programs for dean) ───────────────────────────

function handlePrograms() {
    global $isDean;
    if ($isDean && isDeanCAS()) {
        // CAS: every active program, campus-wide — they teach general
        // education subjects into all of them, not just their own.
        $programs = db()->fetchAll(
            "SELECT p.program_id, p.program_name, p.program_code, p.department_id
             FROM program p
             WHERE p.status = 'active'
             ORDER BY p.program_code"
        );
    } elseif ($isDean) {
        $deptId = deanDeptId();
        $programs = $deptId ? db()->fetchAll(
            "SELECT p.program_id, p.program_name, p.program_code, dp.department_id
             FROM program p
             JOIN department_program dp ON dp.program_id = p.program_id
             WHERE dp.department_id = ? AND p.status = 'active'
             ORDER BY p.program_code",
            [$deptId]
        ) : [];
    } else {
        $programs = db()->fetchAll(
            "SELECT p.program_id, p.program_name, p.program_code,
                    COALESCE(dp.department_id, p.department_id) AS department_id
             FROM program p
             LEFT JOIN department_program dp ON dp.program_id = p.program_id
             WHERE p.status = 'active'
             ORDER BY p.program_code"
        );
    }
    echo json_encode(['success' => true, 'data' => $programs]);
}

// ─── View curriculum for a program (optionally filtered by version) ────────

function handleView() {
    $programId = (int)($_GET['program_id'] ?? 0);
    $versionId = (int)($_GET['version_id'] ?? 0);
    if (!$programId) { echo json_encode(['success' => false, 'message' => 'Program ID required']); return; }

    if (!deanCanAccessProgram($programId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied: program not in your department']);
        return;
    }

    ensureCurriculumVersionsTable();

    $versionFilter = $versionId ? " AND c.version_id = {$versionId}" : '';

    $subjects = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units,
                c.year_level, s.description, s.lecture_hours,
                s.lab_hours, s.status, c.version_id,
                (SELECT ps.subject_code FROM subject ps
                 JOIN subject_prerequisite sprq ON sprq.prerequisite_subject_id = ps.subject_id
                 WHERE sprq.subject_id = s.subject_id LIMIT 1) AS pre_requisite,
                COALESCE(c.sem_num, s.semester, c.semester_id, 1) AS semester
         FROM curriculum c
         JOIN subject s ON s.subject_id = c.course_id
         WHERE c.program_id = ? AND c.status = 'active' AND s.status = 'active'{$versionFilter}" . casYearLevelClause() . "
         ORDER BY c.year_level, COALESCE(c.sem_num, s.semester, c.semester_id, 1), s.subject_code",
        [$programId]
    );
    echo json_encode(['success' => true, 'data' => $subjects]);
}

// ─── All active subjects for Add modal ────────────────────────────────────

function handleAvailable() {
    $programId = (int)($_GET['program_id'] ?? 0);
    if (!$programId) { echo json_encode(['success' => false, 'message' => 'Program ID required']); return; }

    if (!deanCanAccessProgram($programId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $subjects = db()->fetchAll(
        "SELECT s.subject_id, s.subject_code, s.subject_name, s.units,
                s.status, s.description, s.year_level AS subject_year,
                CASE WHEN c.curriculum_id IS NOT NULL THEN 1 ELSE 0 END AS in_program
         FROM subject s
         LEFT JOIN curriculum c ON c.course_id = s.subject_id
                                AND c.program_id = ?
                                AND c.status = 'active'
         WHERE s.program_id = ?" . casYearLevelClause('s.year_level') . "
         ORDER BY s.year_level, s.subject_code",
        [$programId, $programId]
    );
    echo json_encode(['success' => true, 'data' => $subjects]);
}

// ─── Add a subject to this program's curriculum ───────────────────────────

function handleAdd() {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $programId = (int)($data['program_id'] ?? 0);
    $subjectId = (int)($data['subject_id'] ?? 0);
    $yearLevel = in_array($data['year_level'] ?? '', ['1','2','3','4']) ? (int)$data['year_level'] : null;

    if (!$programId || !$subjectId) {
        echo json_encode(['success' => false, 'message' => 'program_id and subject_id are required']);
        return;
    }

    if (!deanCanAccessProgram($programId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied: program not in your department']);
        return;
    }

    $subj = db()->fetchOne("SELECT subject_code FROM subject WHERE subject_id = ?", [$subjectId]);
    if (!$subj) {
        echo json_encode(['success' => false, 'message' => 'Subject not found']);
        return;
    }

    try {
        $pdo = pdo();

        $existing = db()->fetchOne(
            "SELECT curriculum_id FROM curriculum WHERE program_id = ? AND course_id = ?",
            [$programId, $subjectId]
        );

        if ($existing) {
            $pdo->prepare(
                "UPDATE curriculum SET year_level = ?, status = 'active' WHERE curriculum_id = ?"
            )->execute([$yearLevel, $existing['curriculum_id']]);
        } else {
            $pdo->prepare(
                "INSERT INTO curriculum (program_id, course_id, course_code, year_level, status)
                 VALUES (?, ?, ?, ?, 'active')"
            )->execute([$programId, $subjectId, $subj['subject_code'], $yearLevel]);
        }

        $pdo->prepare("UPDATE subject SET program_id = ?, year_level = ?, updated_at = NOW() WHERE subject_id = ?")
            ->execute([$programId, $yearLevel, $subjectId]);

        echo json_encode(['success' => true, 'message' => 'Subject added to curriculum']);
    } catch (Exception $e) {
        error_log('Curriculum add: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to add subject']);
    }
}

// ─── Create a new subject and add it to the curriculum ────────────────────

function handleCreateSubject() {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $programId = (int)($data['program_id'] ?? 0);
    $versionId = (int)($data['version_id'] ?? 0);
    if (!$programId) { echo json_encode(['success' => false, 'message' => 'program_id required']); return; }

    if (!deanCanAccessProgram($programId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $code      = trim($data['subject_code']  ?? '');
    $name      = trim($data['subject_name']  ?? '');
    $desc      = trim($data['description']   ?? '');
    $prereq    = trim($data['pre_requisite'] ?? '');
    $lec       = max(0, (int)($data['lecture_hours'] ?? 3));
    $lab       = max(0, (int)($data['lab_hours']     ?? 0));
    $units     = max(1, (int)($data['units']         ?? ($lec + $lab ?: 3)));
    $yearLevel = in_array((string)($data['year_level'] ?? ''), ['1','2','3','4']) ? (int)$data['year_level'] : null;
    $semester  = in_array((string)($data['semester']   ?? ''), ['1','2','3'])     ? (int)$data['semester']   : 1;

    if (!$code || !$name) {
        echo json_encode(['success' => false, 'message' => 'subject_code and subject_name are required']);
        return;
    }

    $existing = db()->fetchOne(
        "SELECT subject_id FROM subject WHERE subject_code = ? AND program_id = ?",
        [$code, $programId]
    );
    if ($existing) {
        echo json_encode(['success' => false, 'message' => "Subject code '{$code}' already exists in this program"]);
        return;
    }

    try {
        $pdo = pdo();
        $pdo->prepare(
            "INSERT INTO subject (program_id, subject_code, subject_name, description, year_level, semester, units, lecture_hours, lab_hours, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')"
        )->execute([$programId, $code, $name, $desc ?: null, $yearLevel, $semester, $units, $lec, $lab]);

        $subjectId = (int)$pdo->lastInsertId();

        if ($prereq) {
            $prereqSubj = db()->fetchOne("SELECT subject_id FROM subject WHERE subject_code = ?", [$prereq]);
            if ($prereqSubj) {
                $pdo->prepare("INSERT IGNORE INTO subject_prerequisite (subject_id, prerequisite_subject_id) VALUES (?,?)")
                    ->execute([$subjectId, $prereqSubj['subject_id']]);
            }
        }

        $vidCol = $versionId ? ', version_id' : '';
        $vidVal = $versionId ? ', ?' : '';
        $params = [$programId, $subjectId, $code, $yearLevel, $semester];
        if ($versionId) $params[] = $versionId;

        $pdo->prepare(
            "INSERT INTO curriculum (program_id, course_id, course_code, year_level, sem_num{$vidCol}, status)
             VALUES (?, ?, ?, ?, ?{$vidVal}, 'active')"
        )->execute($params);

        echo json_encode(['success' => true, 'message' => 'Subject created', 'subject_id' => $subjectId]);
    } catch (Exception $e) {
        error_log('create_subject: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to create subject']);
    }
}

// ─── Edit a subject's year/semester placement ─────────────────────────────

function handleUpdate() {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $subjectId = (int)($data['subject_id'] ?? 0);
    $programId = (int)($data['program_id'] ?? 0);
    if (!$subjectId) { echo json_encode(['success' => false, 'message' => 'subject_id required']); return; }

    if ($programId && !deanCanAccessProgram($programId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied: program not in your department']);
        return;
    }

    $yearLevel    = in_array($data['year_level'] ?? '', ['1','2','3','4']) ? (int)$data['year_level'] : null;
    $units        = max(1, (int)($data['units']         ?? 3));
    $lectureHours = max(0, (int)($data['lecture_hours'] ?? 3));
    $labHours     = max(0, (int)($data['lab_hours']     ?? 0));
    $preReq       = trim($data['pre_requisite'] ?? '');

    try {
        $pdo = pdo();

        if ($programId) {
            $curRow = db()->fetchOne(
                "SELECT curriculum_id FROM curriculum WHERE program_id = ? AND course_id = ?",
                [$programId, $subjectId]
            );
            if ($curRow) {
                $pdo->prepare(
                    "UPDATE curriculum SET year_level = ? WHERE curriculum_id = ?"
                )->execute([$yearLevel, $curRow['curriculum_id']]);
            }
        }

        $pdo->prepare(
            "UPDATE subject SET year_level = ?, units = ?, lecture_hours = ?, lab_hours = ?, updated_at = NOW() WHERE subject_id = ?"
        )->execute([$yearLevel, $units, $lectureHours, $labHours, $subjectId]);

        $pdo->prepare("DELETE FROM subject_prerequisite WHERE subject_id = ?")->execute([$subjectId]);
        if ($preReq !== '') {
            $prereqSubj = db()->fetchOne("SELECT subject_id FROM subject WHERE subject_code = ?", [$preReq]);
            if ($prereqSubj) {
                $pdo->prepare("INSERT INTO subject_prerequisite (subject_id, prerequisite_subject_id) VALUES (?,?)")
                    ->execute([$subjectId, $prereqSubj['subject_id']]);
            }
        }

        echo json_encode(['success' => true, 'message' => 'Subject updated']);
    } catch (Exception $e) {
        error_log('Curriculum update: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update subject']);
    }
}

// ─── Archive (deactivate) a subject from the curriculum ───────────────────

function handleArchive() {
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $subjectId = (int)($data['subject_id'] ?? 0);
    $programId = (int)($data['program_id'] ?? 0);
    if (!$subjectId) { echo json_encode(['success' => false, 'message' => 'subject_id required']); return; }

    if ($programId && !deanCanAccessProgram($programId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied: program not in your department']);
        return;
    }

    $inUse = db()->fetchOne(
        "SELECT COUNT(*) AS c FROM subject_offered WHERE subject_id = ? AND status != 'cancelled'",
        [$subjectId]
    )['c'] ?? 0;

    if ($inUse > 0) {
        echo json_encode(['success' => false, 'message' => "Cannot archive: subject has {$inUse} active offering(s)"]);
        return;
    }

    try {
        $pdo = pdo();

        if ($programId) {
            $pdo->prepare(
                "UPDATE curriculum SET status = 'inactive' WHERE program_id = ? AND course_id = ?"
            )->execute([$programId, $subjectId]);
        }

        $pdo->prepare("UPDATE subject SET status = 'inactive', updated_at = NOW() WHERE subject_id = ?")
            ->execute([$subjectId]);

        echo json_encode(['success' => true, 'message' => 'Subject archived']);
    } catch (Exception $e) {
        error_log('Curriculum archive: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to archive subject']);
    }
}

// ─── Dean: add a new program to their department ──────────────────────────

function handleAddProgram() {
    global $isDean;
    if (!$isDean) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Only deans can add programs via this endpoint']);
        return;
    }

    $data  = json_decode(file_get_contents('php://input'), true) ?? [];
    $code  = strtoupper(trim($data['program_code'] ?? ''));
    $name  = trim($data['program_name'] ?? '');
    $deptId = deanDeptId();

    if (!$code || !$name) {
        echo json_encode(['success' => false, 'message' => 'Program code and name are required']);
        return;
    }
    if (!$deptId) {
        echo json_encode(['success' => false, 'message' => 'Your account has no department assigned']);
        return;
    }

    $dup = db()->fetchOne("SELECT program_id FROM program WHERE program_code = ?", [$code]);
    if ($dup) {
        echo json_encode(['success' => false, 'message' => "Program code '{$code}' already exists"]);
        return;
    }

    try {
        $pdo = pdo();
        $pdo->prepare("INSERT INTO program (program_code, program_name, status) VALUES (?, ?, 'active')")
            ->execute([$code, $name]);
        $programId = (int)$pdo->lastInsertId();

        $pdo->prepare("INSERT INTO department_program (department_id, program_id) VALUES (?, ?)")
            ->execute([$deptId, $programId]);

        echo json_encode(['success' => true, 'message' => 'Program added', 'program_id' => $programId,
                          'program_code' => $code, 'program_name' => $name, 'department_id' => $deptId]);
    } catch (Exception $e) {
        error_log('add_program: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to add program']);
    }
}

// ─── Curriculum versions: list ────────────────────────────────────────────

function handleListVersions() {
    ensureCurriculumVersionsTable();
    $programId = (int)($_GET['program_id'] ?? 0);
    if (!$programId) { echo json_encode(['success' => false, 'message' => 'program_id required']); return; }

    if (!deanCanAccessProgram($programId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $versions = db()->fetchAll(
        "SELECT version_id, program_id, version_label, description, file_name, file_type, file_path, is_active, created_at
         FROM curriculum_versions WHERE program_id = ? AND is_active = 1
         ORDER BY created_at ASC",
        [$programId]
    );
    echo json_encode(['success' => true, 'data' => $versions]);
}

// ─── Curriculum versions: add ─────────────────────────────────────────────

function handleAddVersion() {
    ensureCurriculumVersionsTable();
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $programId = (int)($data['program_id'] ?? 0);
    $label     = trim($data['version_label'] ?? '');
    $desc      = trim($data['description']   ?? '');

    if (!$programId || !$label) {
        echo json_encode(['success' => false, 'message' => 'program_id and version_label are required']);
        return;
    }
    if (!deanCanAccessProgram($programId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $dup = db()->fetchOne(
        "SELECT version_id FROM curriculum_versions WHERE program_id = ? AND version_label = ?",
        [$programId, $label]
    );
    if ($dup) {
        echo json_encode(['success' => false, 'message' => "A version named '{$label}' already exists for this program"]);
        return;
    }

    try {
        pdo()->prepare(
            "INSERT INTO curriculum_versions (program_id, version_label, description) VALUES (?, ?, ?)"
        )->execute([$programId, $label, $desc ?: null]);
        $versionId = (int)pdo()->lastInsertId();
        echo json_encode(['success' => true, 'version_id' => $versionId,
                          'version_label' => $label, 'description' => $desc,
                          'message' => 'Curriculum version added']);
    } catch (Exception $e) {
        error_log('add_version: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to add curriculum version']);
    }
}

// ─── Curriculum versions: upload reference document ───────────────────────

function handleUploadVersionFile() {
    ensureCurriculumVersionsTable();

    // This endpoint receives multipart/form-data
    header('Content-Type: application/json');

    $versionId = (int)($_POST['version_id'] ?? 0);
    if (!$versionId) { echo json_encode(['success' => false, 'message' => 'version_id required']); return; }

    $version = db()->fetchOne(
        "SELECT * FROM curriculum_versions WHERE version_id = ?", [$versionId]
    );
    if (!$version) { echo json_encode(['success' => false, 'message' => 'Version not found']); return; }

    if (!deanCanAccessProgram((int)$version['program_id'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $file = $_FILES['file'] ?? null;
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $errMsg = match($file['error'] ?? UPLOAD_ERR_NO_FILE) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'File too large',
            UPLOAD_ERR_NO_FILE => 'No file selected',
            default => 'Upload error',
        };
        echo json_encode(['success' => false, 'message' => $errMsg]);
        return;
    }

    $allowed = ['jpg','jpeg','png','gif','webp','pdf','xls','xlsx','doc','docx'];
    $ext     = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed)) {
        echo json_encode(['success' => false, 'message' => "'.{$ext}' is not allowed. Use: " . implode(', ', $allowed)]);
        return;
    }
    if ($file['size'] > 20 * 1024 * 1024) {
        echo json_encode(['success' => false, 'message' => 'File too large (max 20 MB)']);
        return;
    }

    $uploadDir = __DIR__ . '/../uploads/curriculum_docs/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    // Remove old file
    if (!empty($version['file_path'])) {
        $oldPath = __DIR__ . '/../' . $version['file_path'];
        if (file_exists($oldPath)) @unlink($oldPath);
    }

    $safeName = 'cv_' . $versionId . '_' . time() . '.' . $ext;
    $destPath = $uploadDir . $safeName;
    $relPath  = 'uploads/curriculum_docs/' . $safeName;

    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        echo json_encode(['success' => false, 'message' => 'Failed to save file']);
        return;
    }

    $typeMap = [
        'jpg' => 'image', 'jpeg' => 'image', 'png' => 'image', 'gif' => 'image', 'webp' => 'image',
        'pdf' => 'pdf',
        'xls' => 'excel', 'xlsx' => 'excel',
        'doc' => 'word',  'docx' => 'word',
    ];
    $fileType = $typeMap[$ext] ?? 'document';

    try {
        pdo()->prepare(
            "UPDATE curriculum_versions SET file_path = ?, file_name = ?, file_type = ? WHERE version_id = ?"
        )->execute([$relPath, $file['name'], $fileType, $versionId]);

        echo json_encode([
            'success'   => true,
            'file_path' => $relPath,
            'file_name' => $file['name'],
            'file_type' => $fileType,
            'message'   => 'File uploaded',
        ]);
    } catch (Exception $e) {
        error_log('upload_version_file: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update version record']);
    }
}

// ─── Curriculum versions: delete ──────────────────────────────────────────

function handleDeleteVersion() {
    ensureCurriculumVersionsTable();
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $versionId = (int)($data['version_id'] ?? 0);
    if (!$versionId) { echo json_encode(['success' => false, 'message' => 'version_id required']); return; }

    $version = db()->fetchOne("SELECT * FROM curriculum_versions WHERE version_id = ?", [$versionId]);
    if (!$version) { echo json_encode(['success' => false, 'message' => 'Version not found']); return; }

    if (!deanCanAccessProgram((int)$version['program_id'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    try {
        // Remove file if exists
        if (!empty($version['file_path'])) {
            $p = __DIR__ . '/../' . $version['file_path'];
            if (file_exists($p)) @unlink($p);
        }
        pdo()->prepare("UPDATE curriculum_versions SET is_active = 0 WHERE version_id = ?")->execute([$versionId]);
        echo json_encode(['success' => true, 'message' => 'Curriculum version deleted']);
    } catch (Exception $e) {
        error_log('delete_version: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to delete version']);
    }
}

// ─── Import curriculum subjects parsed from PDF (client-side extraction) ──

function handleImportPdfCurriculum() {
    ensureCurriculumVersionsTable();
    $data      = json_decode(file_get_contents('php://input'), true) ?? [];
    $programId = (int)($data['program_id'] ?? 0);
    $versionId = isset($data['version_id']) && $data['version_id'] ? (int)$data['version_id'] : null;
    $subjects  = $data['subjects'] ?? [];

    if (!$programId) {
        echo json_encode(['success' => false, 'message' => 'program_id required']);
        return;
    }
    if (!is_array($subjects) || !count($subjects)) {
        echo json_encode(['success' => false, 'message' => 'No subjects to import']);
        return;
    }
    if (!deanCanAccessProgram($programId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied']);
        return;
    }

    $pdo      = pdo();
    $imported = 0;
    $updated  = 0;
    $skipped  = 0;

    foreach ($subjects as $s) {
        $code      = strtoupper(trim($s['code']   ?? ''));
        $name      = trim($s['name']    ?? '');
        $lec       = max(0, (int)($s['lec']    ?? 3));
        $lab       = max(0, (int)($s['lab']    ?? 0));
        $units     = max(0, (int)($s['units']  ?? ($lec + $lab ?: 3)));
        $yearLevel = in_array((string)($s['year'] ?? ''), ['1','2','3','4']) ? (int)$s['year'] : null;
        $semester  = in_array((string)($s['sem']  ?? ''), ['1','2','3'])     ? (int)$s['sem']  : 1;
        $prereq    = trim($s['prereq'] ?? '');

        if (!$code || !$name) { $skipped++; continue; }

        try {
            // Look up by subject_code alone — shared GEN/PED/NST subjects exist
            // under a different program_id and must not be re-inserted.
            $existing = db()->fetchOne(
                "SELECT subject_id, program_id FROM subject WHERE subject_code = ?",
                [$code]
            );

            if ($existing) {
                $subjectId = (int)$existing['subject_id'];
                // Only overwrite subject row data if the subject belongs to this program
                if ((int)$existing['program_id'] === $programId) {
                    $pdo->prepare(
                        "UPDATE subject SET subject_name = ?, year_level = ?, semester = ?, units = ?, lecture_hours = ?, lab_hours = ?, updated_at = NOW() WHERE subject_id = ?"
                    )->execute([$name, $yearLevel, $semester, $units, $lec, $lab, $subjectId]);
                }
                $updated++;
            } else {
                $pdo->prepare(
                    "INSERT INTO subject (program_id, subject_code, subject_name, year_level, semester, units, lecture_hours, lab_hours, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')"
                )->execute([$programId, $code, $name, $yearLevel, $semester, $units, $lec, $lab]);
                $subjectId = (int)$pdo->lastInsertId();
                $imported++;
            }

            // Set prerequisite (best-effort)
            if ($prereq) {
                $prereqSubj = db()->fetchOne("SELECT subject_id FROM subject WHERE subject_code = ?", [$prereq]);
                if ($prereqSubj) {
                    $pdo->prepare("INSERT IGNORE INTO subject_prerequisite (subject_id, prerequisite_subject_id) VALUES (?,?)")
                        ->execute([$subjectId, $prereqSubj['subject_id']]);
                }
            }

            // Upsert curriculum entry
            $curRow = db()->fetchOne(
                "SELECT curriculum_id FROM curriculum WHERE program_id = ? AND course_id = ?",
                [$programId, $subjectId]
            );

            if ($curRow) {
                $vidSql = $versionId ? ", version_id = {$versionId}" : '';
                $pdo->prepare(
                    "UPDATE curriculum SET year_level = ?, sem_num = ?, status = 'active'{$vidSql} WHERE curriculum_id = ?"
                )->execute([$yearLevel, $semester, $curRow['curriculum_id']]);
            } else {
                $vidCol = $versionId ? ', version_id' : '';
                $vidVal = $versionId ? ', ?' : '';
                $params = [$programId, $subjectId, $code, $yearLevel, $semester];
                if ($versionId) $params[] = $versionId;
                $pdo->prepare(
                    "INSERT INTO curriculum (program_id, course_id, course_code, year_level, sem_num{$vidCol}, status) VALUES (?, ?, ?, ?, ?{$vidVal}, 'active')"
                )->execute($params);
            }
        } catch (Exception $e) {
            error_log("import_pdf_curriculum [{$code}]: " . $e->getMessage());
            $skipped++;
        }
    }

    $msg = "Imported {$imported} new subject(s)";
    if ($updated > 0) $msg .= ", updated {$updated}";
    if ($skipped  > 0) $msg .= ", skipped {$skipped}";

    echo json_encode([
        'success'  => true,
        'message'  => $msg,
        'imported' => $imported,
        'updated'  => $updated,
        'skipped'  => $skipped,
    ]);
}
