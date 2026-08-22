<?php
/**
 * Bulk Import API — admin uploads one roster/curriculum file and the system
 * extracts and upserts everything it recognizes: employee/instructor id,
 * instructor email, student id, student email, name, section, subject
 * code/name/type, lect/lab hrs, lect/lab units, units, capacity,
 * program/course, department.
 *
 * Accepts several file formats, all normalized down to the same
 * array<int, array<int,string>> row shape before anything else runs — see
 * readRowsForUpload():
 *   .xlsx           → XlsxReader (real spreadsheet parsing)
 *   .csv / .txt      → DelimitedTextReader (comma/tab/semicolon-delimited text)
 *   .docx           → DocxTableReader (first table in the document)
 *   .jpg/.jpeg/.png/.bmp/.gif → OcrHelper (best-effort OCR via OCR.space —
 *       see OcrHelper.php's doc comment for why this is inherently less
 *       reliable than a real file and should always be preview-checked)
 *
 * Column headers are matched flexibly (case-insensitive, punctuation-
 * agnostic) against a known alias list — see detectColumnMap(). Missing
 * accounts are auto-created: employee_id/student_id becomes the login ID,
 * the last name (lowercased) becomes the temp password, and
 * users.must_change_password is set so AuthAPI.php forces a real password
 * before the account can reach its dashboard (same "set password" modal
 * already used for first-login dean accounts — see AuthAPI.php).
 *
 * Departments/programs are matched against existing rows only — never
 * auto-created, since a name string alone isn't enough to safely invent a
 * department (which needs a campus) or program (which needs a department).
 */
require_once __DIR__ . '/../config/cors.php';
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/XlsxReader.php';
require_once __DIR__ . '/helpers/DelimitedTextReader.php';
require_once __DIR__ . '/helpers/DocxTableReader.php';
require_once __DIR__ . '/helpers/OcrHelper.php';

// Declared up here, before the action dispatch below — a top-level `const`
// only takes effect once execution actually reaches its line, and the
// dispatch switch runs handlers (which need this) immediately after the
// auth checks, well before the file would otherwise reach this point.
const OCR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'gif'];

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

// The dean's own "Manage Faculty" page gets a scoped bulk-upload of just
// instructor accounts into their own department — everything else here
// (full Class Density, Class List, mark-as-Global) stays admin-only.
$_bulkDeanAllowed = ['faculty-list-import', 'preview'];
if (Auth::role() !== 'admin' && !(Auth::role() === 'dean' && in_array($action, $_bulkDeanAllowed, true))) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Only admin accounts can run a bulk import']);
    exit;
}

try {
    switch ($action) {
        case 'import':  handleImport();  break;
        case 'preview': handlePreview(); break;
        case 'preview-global': handlePreviewGlobal(); break;
        case 'apply-global':   handleApplyGlobal();   break;
        // Class List tab — enroll students from a roster that names its own
        // Subject + Section per row, matched against EXISTING classes only
        // (never created), instead of Class Density's "create everything
        // from one big roster" flow.
        case 'class-list-import':  handleClassListImport(); break;
        // Dean's "Manage Faculty" page — upload just a faculty list (Last
        // Name, First Name, Employee ID, Email), scoped to the dean's own
        // department. Never touches subjects/sections/students.
        case 'faculty-list-import': handleFacultyListImport(); break;
        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid action']);
    }
} catch (Throwable $e) {
    // Last-resort safety net so a missing PHP extension or any other
    // unexpected fatal always degrades to a JSON error instead of a raw
    // PHP error dump / blank body that breaks Api._handleResponse's
    // JSON.parse() on the frontend ("Server returned an invalid response").
    error_log('BulkImportAPI fatal: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Import failed unexpectedly: ' . $e->getMessage()]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Header recognition
// ─────────────────────────────────────────────────────────────────────────────

function fieldAliases(): array
{
    return [
        'employee_id'      => ['employee id', 'employee_id', 'instructor id', 'faculty id', 'emp id', 'emp no', 'employee no'],
        'instructor_email' => ['instructor email', 'employee email', 'faculty email'],
        'student_id'       => ['student id', 'student_id', 'student no', 'student number'],
        // A bare "ID" / "ID No." / "ID Number" column (no "student" or
        // "employee" in it) doesn't say up front which one it is — some
        // sheets use one shared ID column for both instructor and student
        // rows. Resolved per-row in processRow(): IDs containing letters
        // (e.g. "T-2024-015") are instructor IDs, purely numeric ones
        // (e.g. "21-0001" — a dash isn't a letter) are student IDs.
        'generic_id'       => ['id', 'id no', 'id number', 'id#'],
        'student_email'    => ['student email'],
        'instructor_name'  => ['instructor name', 'faculty name', 'teacher name'],
        'student_name'     => ['student name', 'name of student'],
        'name'             => ['name', 'full name'],
        // Sheets that split the name across two columns instead of one
        // combined "Name" column. Kept separate from instructor/student
        // first/last so a shared "First Name"/"Last Name" pair (used when a
        // sheet has only one person type per row) still resolves correctly.
        'instructor_first_name'  => ['instructor first name', 'faculty first name'],
        'instructor_last_name'   => ['instructor last name', 'faculty last name', 'instructor surname', 'faculty surname'],
        'instructor_middle_name' => ['instructor middle name', 'faculty middle name'],
        'student_first_name'     => ['student first name'],
        'student_last_name'      => ['student last name', 'student surname'],
        'student_middle_name'    => ['student middle name'],
        'first_name'       => ['first name', 'firstname', 'given name'],
        'last_name'        => ['last name', 'lastname', 'surname', 'family name'],
        'middle_name'      => ['middle name', 'middlename', 'middle initial', 'mi'],
        'section'          => ['section', 'section name', 'sections'],
        // A bare "Subject" column (no "code"/"name" in it — e.g. a registrar's
        // class-list export) is ambiguous about whether it holds a code
        // ("GEN 001") or a full title ("Purposive Communication"). Matched
        // against both subject_code and subject_name — see resolveSubject().
        'subject_code'     => ['subject code', 'subject'],
        'subject_name'     => ['subject name'],
        'subject_type'     => ['subject type'],
        'program'          => ['program', 'course', 'program/course', 'program / course', 'program course'],
        // "College" is how PHINMA COC refers to its departments — e.g. a
        // registrar's export column header, same table under the hood.
        'department'       => ['department', 'dept', 'college'],
        'campus'           => ['campus', 'campus name'],
        'lect_hrs'         => ['lect hrs', 'lecture hrs', 'lecture hours', 'lect hours'],
        'lab_hrs'          => ['lab hrs', 'laboratory hrs', 'laboratory hours', 'lab hours'],
        'total_hrs'        => ['total hrs', 'total hours'],
        'lect_units'       => ['lect units', 'lecture units'],
        'lab_units'        => ['lab units', 'laboratory units'],
        'units'            => ['units', 'total units'],
        'capacity'         => ['capacity', 'max students', 'slots', 'max capacity'],
    ];
}

function normalizeHeader(string $h): string
{
    $h = strtolower(trim($h));
    $h = preg_replace('/[^a-z0-9\s\/]+/', '', $h);
    $h = preg_replace('/\s+/', ' ', $h);
    return trim($h);
}

/**
 * @return array<string,int> canonical field name => 0-based column index
 *
 * Two passes: an exact match first (fast, unambiguous), then a fuzzy
 * "contains" pass for anything still unmatched — real spreadsheets rarely
 * use headers worded exactly like the alias list (e.g. "Employee No."
 * instead of "Employee ID", "Course" instead of "Program/Course"), so
 * requiring an exact match was rejecting columns that were obviously the
 * right ones to a human reader.
 */
function detectColumnMap(array $headerRow): array
{
    $aliases = fieldAliases();
    $map = [];
    $emailSeen = 0;
    $unmatched = [];

    // Pass 1 — exact match (after normalizing case/punctuation/whitespace)
    foreach ($headerRow as $colIdx => $raw) {
        $norm = normalizeHeader((string)$raw);
        if ($norm === '') continue;

        // A bare "Email" column is ambiguous — this sheet lists Employee ID,
        // Email, Student ID, Email in that order, so by position: the first
        // generic "email" column is the instructor's, the second is the
        // student's. Sheets with explicit "Instructor Email" / "Student
        // Email" headers are matched directly below instead.
        if ($norm === 'email') {
            $field = $emailSeen === 0 ? 'instructor_email' : 'student_email';
            $emailSeen++;
            if (!isset($map[$field])) $map[$field] = $colIdx;
            continue;
        }

        $matched = false;
        foreach ($aliases as $field => $names) {
            if (isset($map[$field])) continue; // first matching column wins
            if (in_array($norm, $names, true)) {
                $map[$field] = $colIdx;
                $matched = true;
                break;
            }
        }
        if (!$matched) $unmatched[$colIdx] = $norm;
    }

    // Pass 2 — fuzzy: does the header contain an alias phrase, or vice versa?
    // ("employee no" contains "employee", "prog/course" is contained by
    // "program/course" once slashes are treated loosely, etc.)
    foreach ($unmatched as $colIdx => $norm) {
        $bestField = null;
        $bestLen   = 0;
        foreach ($aliases as $field => $names) {
            if (isset($map[$field])) continue;
            foreach ($names as $alias) {
                // Skip short/generic aliases in the fuzzy pass — "name" (4
                // chars) would otherwise match ANY header containing that
                // word, e.g. "Session Name" or "Middle Name" getting
                // swallowed into the generic Name field. These still match
                // fine via the exact pass (pass 1) when a header really is
                // just "Name"/"Dept" — this only blocks the loose fuzzy net.
                if (strlen($alias) < 5) continue;
                if (str_contains($norm, $alias) || str_contains($alias, $norm)) {
                    if (strlen($alias) > $bestLen) {
                        $bestField = $field;
                        $bestLen   = strlen($alias);
                    }
                }
            }
        }
        if ($bestField) $map[$bestField] = $colIdx;
    }

    return $map;
}

function extractRowData(array $rawRow, array $colMap): array
{
    $out = [];
    foreach ($colMap as $field => $colIdx) {
        $out[$field] = trim((string)($rawRow[$colIdx] ?? ''));
    }
    return $out;
}

function isBlankRow(array $row): bool
{
    foreach ($row as $v) {
        if (trim((string)$v) !== '') return false;
    }
    return true;
}

/**
 * Finds which of the first several rows is the real header row, by scoring
 * each with detectColumnMap() and picking the one that recognizes the most
 * columns. Handles report templates with a title/date/logo banner row (or a
 * blank spacer row) above the actual column headers, instead of assuming
 * the header is always physically row 1.
 */
function findHeaderRowIndex(array $rows): int
{
    $bestIdx = 0;
    $bestScore = -1;
    $limit = min(count($rows), 10);
    for ($i = 0; $i < $limit; $i++) {
        if (isBlankRow($rows[$i])) continue;
        $score = count(detectColumnMap($rows[$i]));
        if ($score > $bestScore) {
            $bestScore = $score;
            $bestIdx = $i;
        }
    }
    return $bestIdx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads $_FILES['file'] into the common row shape, picking the reader by
 * file extension. See the file-level doc comment at the top of this file
 * for which extension maps to which reader.
 *
 * @return array<int, array<int, string>>
 */
function readRowsForUpload(array $file): array
{
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

    if ($ext === 'xlsx') {
        return XlsxReader::readFirstSheet($file['tmp_name']);
    }
    if ($ext === 'csv' || $ext === 'txt') {
        return DelimitedTextReader::readFile($file['tmp_name']);
    }
    if ($ext === 'docx') {
        return DocxTableReader::readFirstTable($file['tmp_name']);
    }
    if (in_array($ext, OCR_EXTENSIONS, true)) {
        return OcrHelper::readImage($file['tmp_name'], $file['name'], $file['type'] ?? 'application/octet-stream');
    }

    throw new Exception(
        'Unsupported file type ("' . ($ext !== '' ? ".$ext" : 'no extension') . '"). ' .
        'Supported: Excel (.xlsx), CSV/text (.csv, .txt), Word tables (.docx), or a clear photo of a table (.jpg, .png).'
    );
}

/**
 * Shared upload validation + parsing + header detection for both the
 * preview and the real import — keeps them reading the file identically so
 * "what preview shows" and "what import does" can never drift apart.
 *
 * @return array{header:array,colMap:array,headerRowIdx:int,dataRows:array}|null
 *         null means an error was already echoed and the caller should stop.
 */
function readAndMapUpload(): ?array
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return null;
    }
    if (!isset($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
        echo json_encode(['success' => false, 'message' => 'No file uploaded']);
        return null;
    }

    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['success' => false, 'message' => 'Upload failed (error code: ' . $file['error'] . ')']);
        return null;
    }
    if ($file['size'] > 15 * 1024 * 1024) {
        echo json_encode(['success' => false, 'message' => 'File too large. Maximum size is 15MB.']);
        return null;
    }
    try {
        $rows = readRowsForUpload($file);
    } catch (Throwable $e) {
        // Throwable (not just Exception) — a missing PHP extension (e.g. zip)
        // surfaces as a fatal \Error ("Class ZipArchive not found"), which a
        // plain `catch (Exception)` does NOT catch, so it would otherwise
        // crash the whole response into a blank/HTML body instead of JSON.
        error_log('BulkImport readRowsForUpload: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Could not read the file: ' . $e->getMessage()]);
        return null;
    }

    if (count($rows) < 2) {
        echo json_encode(['success' => false, 'message' => 'The file has no data rows below the header.']);
        return null;
    }

    // The header row isn't always row 1 — report templates often have a
    // title/logo/date banner above the real column headers. Scan the first
    // several rows and use whichever one actually recognizes the most
    // columns, instead of blindly assuming row 1.
    $headerRowIdx = findHeaderRowIndex($rows);
    $header = $rows[$headerRowIdx];
    $dataRows = array_slice($rows, $headerRowIdx + 1);
    $colMap = detectColumnMap($header);
    if (!$colMap) {
        // Show exactly what text WAS read from row 1 (and the best-guess
        // header row, if different) so a mismatch is diagnosable from the
        // error message alone instead of needing another screenshot round-trip.
        $seen = implode(' | ', array_filter($rows[0] ?? [], fn($v) => trim((string)$v) !== ''));
        $extra = $headerRowIdx > 0
            ? ' Best-guess header row (row ' . ($headerRowIdx + 1) . '): ' . implode(' | ', array_filter($header, fn($v) => trim((string)$v) !== ''))
            : '';
        echo json_encode(['success' => false, 'message' =>
            'None of the expected columns were recognized. Row 1 as read: ' . ($seen !== '' ? $seen : '(empty)') . '.' . $extra
        ]);
        return null;
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    return [
        'header' => $header, 'colMap' => $colMap, 'headerRowIdx' => $headerRowIdx, 'dataRows' => $dataRows,
        'is_ocr' => in_array($ext, OCR_EXTENSIONS, true),
    ];
}

/**
 * POST ?action=preview — parses the file and reports what WOULD happen,
 * without writing anything to the database. Lets the admin sanity-check
 * that the right columns were recognized before committing to a real import.
 */
function handlePreview(): void
{
    $parsed = readAndMapUpload();
    if ($parsed === null) return; // error already echoed

    ['header' => $header, 'colMap' => $colMap, 'headerRowIdx' => $headerRowIdx, 'dataRows' => $dataRows, 'is_ocr' => $isOcr] = $parsed;

    $fieldLabels = [
        'employee_id' => 'Employee ID', 'instructor_email' => 'Instructor Email',
        'student_id' => 'Student ID', 'student_email' => 'Student Email',
        'generic_id' => 'ID (auto: letters = instructor, numbers only = student)',
        'instructor_name' => 'Instructor Name', 'student_name' => 'Student Name', 'name' => 'Name',
        'instructor_first_name' => 'Instructor First Name', 'instructor_last_name' => 'Instructor Last Name',
        'instructor_middle_name' => 'Instructor Middle Name',
        'student_first_name' => 'Student First Name', 'student_last_name' => 'Student Last Name',
        'student_middle_name' => 'Student Middle Name',
        'first_name' => 'First Name', 'last_name' => 'Last Name', 'middle_name' => 'Middle Name',
        'section' => 'Section', 'subject_code' => 'Subject Code', 'subject_name' => 'Subject Name',
        'subject_type' => 'Subject Type', 'program' => 'Program/Course', 'department' => 'Department', 'campus' => 'Campus',
        'lect_hrs' => 'Lect Hrs', 'lab_hrs' => 'Lab Hrs', 'total_hrs' => 'Total Hrs',
        'lect_units' => 'Lect Units', 'lab_units' => 'Lab Units', 'units' => 'Units', 'capacity' => 'Capacity',
    ];

    $columns = [];
    foreach ($colMap as $field => $colIdx) {
        $columns[] = [
            'field'        => $field,
            'label'        => $fieldLabels[$field] ?? $field,
            'sheet_header' => $header[$colIdx] ?? '',
        ];
    }

    // Sample rows, keyed field => display value the same way processRow() reads them.
    $sampleRows = [];
    $nonBlankSeen = 0;
    foreach ($dataRows as $rawRow) {
        if (isBlankRow($rawRow)) continue;
        $row = [];
        foreach ($colMap as $field => $colIdx) {
            $row[$field] = trim((string)($rawRow[$colIdx] ?? ''));
        }
        $sampleRows[] = $row;
        $nonBlankSeen++;
        if ($nonBlankSeen >= 8) break;
    }

    $totalDataRows = count(array_filter($dataRows, fn($r) => !isBlankRow($r)));

    echo json_encode(['success' => true, 'data' => [
        'header_row'      => $headerRowIdx + 1,
        'columns'         => $columns,
        'sample_rows'     => $sampleRows,
        'total_data_rows' => $totalDataRows,
        // Read from a photo via OCR instead of a real file — the frontend
        // shows an extra "double-check this" warning, since OCR mistakes
        // (a misread digit in an ID, a merged/split column) are much more
        // likely than with an actual spreadsheet.
        'is_ocr' => $isOcr,
    ]]);
}

function handleImport(): void
{
    $parsed = readAndMapUpload();
    if ($parsed === null) return; // error already echoed

    ['colMap' => $colMap, 'headerRowIdx' => $headerRowIdx, 'dataRows' => $rows] = $parsed;

    $summary = [
        'created_instructors' => 0, 'updated_instructors' => 0,
        'created_students'    => 0, 'updated_students'    => 0,
        'created_subjects'    => 0, 'updated_subjects'    => 0,
        'created_sections'    => 0,
        'linked_offerings'    => 0, 'enrolled_students'   => 0,
        'rows_processed'      => 0, 'rows_skipped_blank'  => 0,
        'matched_columns'     => array_keys($colMap),
        'header_row'          => $headerRowIdx + 1, // 1-based, for display
        'notes'    => [],
        'warnings' => [],
        'errors'   => [],
    ];

    // One transaction for the whole file instead of autocommitting every
    // single INSERT/UPDATE individually. With autocommit on, MySQL fsyncs to
    // disk after every statement — a few hundred rows means a few thousand
    // separate disk syncs, which is where "slow" actually comes from, not
    // the lookups themselves (those are already covered by the indexes).
    // One commit at the end turns that into a single disk sync; the indexes
    // then do their job keeping each individual lookup fast inside it.
    // A bad row (bad data, a duplicate, etc.) is still caught and logged
    // per-row below without losing everything already processed — only a
    // truly fatal failure (e.g. the DB connection itself dying) rolls the
    // whole import back, since nothing safe could have committed anyway.
    db()->beginTransaction();
    try {
        foreach ($rows as $i => $rawRow) {
            $rowNum = $headerRowIdx + $i + 2; // +1 for the header row itself, +1 for 1-based display
            if (isBlankRow($rawRow)) { $summary['rows_skipped_blank']++; continue; }

            $data = extractRowData($rawRow, $colMap);
            try {
                processRow($data, $rowNum, $summary);
                $summary['rows_processed']++;
            } catch (Throwable $e) {
                $summary['errors'][] = "Row $rowNum: " . $e->getMessage();
            }
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollback();
        throw $e;
    }

    echo json_encode(['success' => true, 'message' => 'Import finished', 'data' => $summary]);
}

// ─────────────────────────────────────────────────────────────────────────────
// "Mark subjects as Global" — Subjects tab upload (separate from the main
// roster import above). Admin uploads a document/Excel/CSV/photo that just
// lists subject codes (e.g. a curriculum sheet) — every EXISTING subject it
// matches gets all of its class offerings switched to Global Gradebook
// grading. Nothing is created here; a code that doesn't match an existing
// subject is just reported back, not invented.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared by preview-global and apply-global: reads the upload, finds the
 * Subject Code column, and matches each distinct code against existing
 * subjects.
 *
 * @return array{matched:array,unmatched:array,is_ocr:bool}|null
 *         null means an error was already echoed and the caller should stop.
 */
function matchSubjectsFromUpload(): ?array
{
    $parsed = readAndMapUpload();
    if ($parsed === null) return null; // error already echoed

    ['colMap' => $colMap, 'dataRows' => $dataRows, 'is_ocr' => $isOcr] = $parsed;

    if (!isset($colMap['subject_code'])) {
        echo json_encode(['success' => false, 'message' =>
            'No "Subject Code" column was recognized in this file. This upload only needs a column of subject codes ' .
            '(e.g. from a curriculum sheet) — make sure one column is clearly labeled Subject Code / Code.'
        ]);
        return null;
    }
    $colIdx = $colMap['subject_code'];

    // Distinct, trimmed, case-insensitive-deduped codes in the order they first appear.
    $codes = [];
    $seen = [];
    foreach ($dataRows as $row) {
        $code = trim((string)($row[$colIdx] ?? ''));
        if ($code === '') continue;
        $key = strtolower($code);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $codes[] = $code;
    }

    if (!$codes) {
        echo json_encode(['success' => false, 'message' => 'No subject codes were found in that column.']);
        return null;
    }

    $matched = [];
    $unmatched = [];
    foreach ($codes as $code) {
        $subject = db()->fetchOne("SELECT subject_id, subject_code, subject_name FROM subject WHERE LOWER(subject_code) = ?", [strtolower($code)]);
        if (!$subject) {
            $unmatched[] = $code;
            continue;
        }
        $counts = db()->fetchOne(
            "SELECT COUNT(*) AS total,
                    SUM(CASE WHEN grading_type = 'global' THEN 1 ELSE 0 END) AS already_global
             FROM subject_offered WHERE subject_id = ? AND status != 'cancelled'",
            [$subject['subject_id']]
        );
        $matched[] = [
            'subject_id'     => (int)$subject['subject_id'],
            'subject_code'   => $subject['subject_code'],
            'subject_name'   => $subject['subject_name'],
            'offering_count' => (int)($counts['total'] ?? 0),
            'already_global' => (int)($counts['already_global'] ?? 0),
        ];
    }

    return ['matched' => $matched, 'unmatched' => $unmatched, 'is_ocr' => $isOcr];
}

/** POST ?action=preview-global — reports what WOULD be marked Global, without writing anything. */
function handlePreviewGlobal(): void
{
    $result = matchSubjectsFromUpload();
    if ($result === null) return; // error already echoed

    $toUpdate = array_filter($result['matched'], fn($m) => $m['offering_count'] > $m['already_global']);

    echo json_encode(['success' => true, 'data' => [
        'matched'           => $result['matched'],
        'unmatched'         => $result['unmatched'],
        'total_codes'       => count($result['matched']) + count($result['unmatched']),
        'offerings_to_update' => array_sum(array_map(fn($m) => $m['offering_count'] - $m['already_global'], $toUpdate)),
        'is_ocr'            => $result['is_ocr'],
    ]]);
}

/** POST ?action=apply-global — actually switches every matched subject's offerings to Global Gradebook grading. */
function handleApplyGlobal(): void
{
    $result = matchSubjectsFromUpload();
    if ($result === null) return; // error already echoed

    $offeringsUpdated = 0;
    db()->beginTransaction();
    try {
        foreach ($result['matched'] as $m) {
            $stmt = pdo()->prepare(
                "UPDATE subject_offered SET grading_type = 'global', updated_at = NOW()
                 WHERE subject_id = ? AND status != 'cancelled' AND grading_type != 'global'"
            );
            $stmt->execute([$m['subject_id']]);
            $offeringsUpdated += $stmt->rowCount();
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollback();
        throw $e;
    }

    echo json_encode(['success' => true, 'message' => 'Subjects marked Global', 'data' => [
        'subjects_matched'   => count($result['matched']),
        'subjects_unmatched' => count($result['unmatched']),
        'unmatched_codes'    => $result['unmatched'],
        'offerings_updated'  => $offeringsUpdated,
    ]]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Class List — enroll students from a roster that already names its own
// Subject + Section per row (e.g. a registrar's class-list export). Unlike
// Class Density, nothing about the class itself is created here — Subject
// and Section must already exist, matched exactly (never invented); only
// student accounts are upserted and enrolled.
// ─────────────────────────────────────────────────────────────────────────────

/** Matches a row's Subject value against subject_code first, then subject_name — never creates. */
function resolveSubjectForClassList(string $value): ?array
{
    $value = trim($value);
    if ($value === '') return null;
    static $cache = [];
    $key = strtolower($value);
    if (array_key_exists($key, $cache)) return $cache[$key];

    $row = db()->fetchOne("SELECT subject_id, subject_code FROM subject WHERE LOWER(subject_code) = ?", [$key])
        ?: db()->fetchOne("SELECT subject_id, subject_code FROM subject WHERE LOWER(subject_name) = ?", [$key]);

    return $cache[$key] = $row ? ['id' => (int)$row['subject_id'], 'code' => $row['subject_code']] : null;
}

/** Matches a row's Section value against an existing section — never creates. */
function resolveSectionForClassList(string $value, ?int $programId): ?int
{
    $value = trim($value);
    if ($value === '') return null;
    static $cache = [];
    $key = strtolower($value) . '|' . ($programId ?? '');
    if (array_key_exists($key, $cache)) return $cache[$key];

    $row = null;
    if ($programId) {
        $row = db()->fetchOne(
            "SELECT section_id FROM section WHERE LOWER(section_name) = ? AND (program_id = ? OR program_id IS NULL)
             ORDER BY (program_id IS NOT NULL) DESC LIMIT 1",
            [strtolower($value), $programId]
        );
    }
    // Fall back to matching by name alone — a Course column that doesn't
    // resolve to (or doesn't match) the section's actual program shouldn't
    // block an otherwise-unambiguous section name match. Real registrar
    // exports don't always agree with how sections were set up here.
    if (!$row) {
        $row = db()->fetchOne("SELECT section_id FROM section WHERE LOWER(section_name) = ? LIMIT 1", [strtolower($value)]);
    }

    return $cache[$key] = $row ? (int)$row['section_id'] : null;
}

/** Finds the existing subject_offered linking a subject to a section — never creates. */
function findExistingOffering(int $subjectId, ?int $sectionId): ?int
{
    if ($sectionId) {
        $row = db()->fetchOne(
            "SELECT so.subject_offered_id FROM subject_offered so
             JOIN section_subject ss ON ss.subject_offered_id = so.subject_offered_id AND ss.status != 'cancelled'
             WHERE so.subject_id = ? AND ss.section_id = ? AND so.status != 'cancelled' LIMIT 1",
            [$subjectId, $sectionId]
        );
        if ($row) return (int)$row['subject_offered_id'];
    }
    // No section match (or no section given) — fall back to any open
    // offering for that subject, same as Class Density's linkOffering().
    $row = db()->fetchOne(
        "SELECT subject_offered_id FROM subject_offered WHERE subject_id = ? AND status != 'cancelled' LIMIT 1",
        [$subjectId]
    );
    return $row ? (int)$row['subject_offered_id'] : null;
}

/** POST ?action=class-list-import — matches each row's Subject+Section and enrolls the student. */
function handleClassListImport(): void
{
    $parsed = readAndMapUpload();
    if ($parsed === null) return; // error already echoed
    ['colMap' => $colMap, 'headerRowIdx' => $headerRowIdx, 'dataRows' => $rows] = $parsed;

    $hasStudentCol = isset($colMap['student_id']) || isset($colMap['generic_id'])
        || isset($colMap['student_name']) || isset($colMap['name'])
        || isset($colMap['student_first_name']) || isset($colMap['first_name'])
        || isset($colMap['student_last_name'])  || isset($colMap['last_name']);
    if (!$hasStudentCol) {
        echo json_encode(['success' => false, 'message' =>
            'No Student ID or Student Name column was recognized in this file — a roster needs at least one of those.'
        ]);
        return;
    }
    if (!isset($colMap['subject_code']) && !isset($colMap['subject_name'])) {
        echo json_encode(['success' => false, 'message' =>
            'No Subject column was recognized — each row needs to say which existing subject/class it belongs to.'
        ]);
        return;
    }

    $summary = [
        'created_students'    => 0, 'updated_students'   => 0,
        'enrolled_students'   => 0, 'already_enrolled'   => 0,
        'rows_processed'      => 0, 'rows_skipped_blank' => 0,
        'matched_columns'     => array_keys($colMap),
        'header_row'          => $headerRowIdx + 1,
        'notes' => [], 'warnings' => [], 'errors' => [],
    ];

    db()->beginTransaction();
    try {
        foreach ($rows as $i => $rawRow) {
            $rowNum = $headerRowIdx + $i + 2;
            if (isBlankRow($rawRow)) { $summary['rows_skipped_blank']++; continue; }

            $d = extractRowData($rawRow, $colMap);
            // A bare "ID" column with no explicit Student ID header — same
            // per-row letters-vs-numbers heuristic processRow() uses.
            $genericId = trim($d['generic_id'] ?? '');
            if ($genericId !== '' && empty($d['student_id']) && !preg_match('/[A-Za-z]/', $genericId)) {
                $d['student_id'] = $genericId;
            }
            // A file built for students only (no instructor column at all)
            // still has one bare "Email" column, which detectColumnMap()
            // assigns to instructor_email by default (first email column
            // seen) — reclaim it as the student's when nothing else has it.
            if (!empty($d['instructor_email']) && empty($d['student_email'])) {
                $d['student_email'] = $d['instructor_email'];
            }

            try {
                $subjectValue = $d['subject_code'] ?? ($d['subject_name'] ?? '');
                if (trim($subjectValue) === '') {
                    throw new Exception('no Subject given for this row');
                }
                $subject = resolveSubjectForClassList($subjectValue);
                if (!$subject) {
                    throw new Exception("subject \"$subjectValue\" doesn't match any existing subject — skipped (Class List never creates subjects)");
                }

                $programId = resolveProgram($d['program'] ?? '');
                $sectionId = !empty($d['section']) ? resolveSectionForClassList($d['section'], $programId) : null;
                if (!empty($d['section']) && !$sectionId) {
                    $summary['warnings'][] = "Row $rowNum: section \"{$d['section']}\" doesn't match any existing section — matched by subject only";
                }

                $offeredId = findExistingOffering($subject['id'], $sectionId);
                if (!$offeredId) {
                    throw new Exception("no existing class found for subject \"{$subject['code']}\"" . ($sectionId ? " + that section" : '') . " — skipped (Class List never creates classes)");
                }

                ['id' => $stuId, 'name' => $stuName, 'email' => $stuEmail, 'middle' => $stuMiddle] = personIdentityFromRow($d, 'student');
                if ($stuId === '' && $stuEmail === '') {
                    throw new Exception('no Student ID, ID, or email — can\'t identify this student');
                }
                $campusId     = resolveCampus($d['campus'] ?? '');
                $departmentId = resolveDepartment($d['department'] ?? '');
                $res = upsertPerson('student', $stuId, $stuEmail, $stuName, $departmentId, $programId, $stuMiddle, $campusId);
                if ($res['created']) { $summary['created_students']++; $summary['notes'][] = "Row $rowNum: created student account — {$res['note']}"; }
                else                 { $summary['updated_students']++; }

                if (enrollStudent($res['users_id'], $offeredId, $sectionId)) {
                    $summary['enrolled_students']++;
                } else {
                    $summary['already_enrolled']++;
                }
                $summary['rows_processed']++;
            } catch (Throwable $e) {
                $summary['errors'][] = "Row $rowNum: " . $e->getMessage();
            }
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollback();
        throw $e;
    }

    echo json_encode(['success' => true, 'message' => 'Class list import finished', 'data' => $summary]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Faculty List — Dean's "Manage Faculty" page. Upload just a faculty roster
// (Last Name, First Name, Employee ID, Email) and every row becomes an
// instructor account in the dean's OWN department — never touches subjects,
// sections, or students. Department/campus are never read from the file;
// they're always the acting dean's own, so a dean can't (even accidentally)
// place a row's account somewhere outside their department.
// ─────────────────────────────────────────────────────────────────────────────

/** POST ?action=faculty-list-import — upserts one instructor account per row, all into the dean's own department. */
function handleFacultyListImport(): void
{
    $me = db()->fetchOne("SELECT department_id, campus_id FROM users WHERE users_id = ?", [Auth::id()]);
    $departmentId = $me['department_id'] ?? null;
    $campusId     = $me['campus_id'] ?? null;

    $parsed = readAndMapUpload();
    if ($parsed === null) return; // error already echoed
    ['colMap' => $colMap, 'headerRowIdx' => $headerRowIdx, 'dataRows' => $rows] = $parsed;

    $hasNameCol = isset($colMap['instructor_first_name']) || isset($colMap['first_name'])
        || isset($colMap['instructor_last_name'])  || isset($colMap['last_name'])
        || isset($colMap['instructor_name'])       || isset($colMap['name']);
    if (!$hasNameCol) {
        echo json_encode(['success' => false, 'message' =>
            'No name column was recognized — a faculty list needs at least Last Name / First Name (or a combined Name column).'
        ]);
        return;
    }

    $summary = [
        'created_instructors' => 0, 'updated_instructors' => 0,
        'rows_processed'      => 0, 'rows_skipped_blank'  => 0,
        'matched_columns'     => array_keys($colMap),
        'header_row'          => $headerRowIdx + 1,
        'notes' => [], 'warnings' => [], 'errors' => [],
    ];

    db()->beginTransaction();
    try {
        foreach ($rows as $i => $rawRow) {
            $rowNum = $headerRowIdx + $i + 2;
            if (isBlankRow($rawRow)) { $summary['rows_skipped_blank']++; continue; }

            $d = extractRowData($rawRow, $colMap);
            // A bare "ID" column with no explicit Employee ID header — same
            // per-row letters-vs-numbers heuristic processRow() uses.
            $genericId = trim($d['generic_id'] ?? '');
            if ($genericId !== '' && empty($d['employee_id']) && preg_match('/[A-Za-z]/', $genericId)) {
                $d['employee_id'] = $genericId;
            }
            // A file built for faculty only (no student column at all) still
            // has one bare "Email" column, which detectColumnMap() assigns
            // to instructor_email by default — already correct here, but a
            // sheet that happened to label it "Student Email" would still
            // work since personIdentityFromRow() falls back to whichever's set.

            try {
                ['id' => $empId, 'name' => $instName, 'email' => $instEmail, 'middle' => $instMiddle] = personIdentityFromRow($d, 'instructor');
                if ($empId === '' && $instEmail === '') {
                    throw new Exception('no Employee ID, ID, or email — can\'t identify this instructor');
                }
                $res = upsertPerson('instructor', $empId, $instEmail, $instName, $departmentId, null, $instMiddle, $campusId);
                if ($res['created']) { $summary['created_instructors']++; $summary['notes'][] = "Row $rowNum: created instructor account — {$res['note']}"; }
                else                 { $summary['updated_instructors']++; }
                $summary['rows_processed']++;
            } catch (Throwable $e) {
                $summary['errors'][] = "Row $rowNum: " . $e->getMessage();
            }
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollback();
        throw $e;
    }

    echo json_encode(['success' => true, 'message' => 'Faculty list import finished', 'data' => $summary]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-row processing
// ─────────────────────────────────────────────────────────────────────────────

function processRow(array $d, int $rowNum, array &$summary): void
{
    // A bare "ID" column doesn't say whether a given row's value is an
    // instructor's or a student's — decide per row: any letter in it (e.g.
    // "T-2024-015") means instructor, purely numeric/punctuation (e.g.
    // "21-0001") means student. Only kicks in when the sheet didn't already
    // give an explicit Employee ID / Student ID for this row.
    $genericId = trim($d['generic_id'] ?? '');
    if ($genericId !== '' && empty($d['employee_id']) && empty($d['student_id'])) {
        if (preg_match('/[A-Za-z]/', $genericId)) {
            $d['employee_id'] = $genericId;
        } else {
            $d['student_id'] = $genericId;
        }
    }

    $departmentId = resolveDepartment($d['department'] ?? '');
    $programId    = resolveProgram($d['program'] ?? '');
    $campusId     = resolveCampus($d['campus'] ?? '');

    if (!empty($d['department']) && !$departmentId) {
        $summary['warnings'][] = "Row $rowNum: department \"{$d['department']}\" doesn't match any existing department — left unset";
    }
    if (!empty($d['program']) && !$programId) {
        $summary['warnings'][] = "Row $rowNum: program/course \"{$d['program']}\" doesn't match any existing program — left unset";
    }
    if (!empty($d['campus']) && !$campusId) {
        $summary['warnings'][] = "Row $rowNum: campus \"{$d['campus']}\" doesn't match any existing campus — left unset";
    }

    // Subject
    $subjectId = null;
    if (!empty($d['subject_code'])) {
        $subj = findOrCreateSubject($d, $programId);
        if ($subj) {
            $subjectId = $subj['subject_id'];
            if ($subj['created'])      { $summary['created_subjects']++; $summary['notes'][] = "Row $rowNum: created subject {$d['subject_code']}"; }
            elseif ($subj['updated'])  { $summary['updated_subjects']++; }
        }
    }

    // Section
    $sectionId = null;
    if (!empty($d['section'])) {
        $capacity = is_numeric($d['capacity'] ?? '') ? (int)$d['capacity'] : null;
        $sec = findOrCreateSection($d['section'], $programId, $capacity);
        if ($sec) {
            $sectionId = $sec['section_id'];
            if ($sec['created']) { $summary['created_sections']++; $summary['notes'][] = "Row $rowNum: created section {$d['section']}"; }
        }
    }

    // Instructor
    $instructorId = null;
    ['id' => $empId, 'name' => $instName, 'email' => $instEmail, 'middle' => $instMiddle] = personIdentityFromRow($d, 'instructor');
    if ($empId !== '' || $instEmail !== '') {
        $res = upsertPerson('instructor', $empId, $instEmail, $instName, $departmentId, $programId, $instMiddle, $campusId);
        $instructorId = $res['users_id'];
        if ($res['created']) { $summary['created_instructors']++; $summary['notes'][] = "Row $rowNum: created instructor account — {$res['note']}"; }
        else                 { $summary['updated_instructors']++; }
    }

    // Student
    $studentId = null;
    ['id' => $stuId, 'name' => $stuName, 'email' => $stuEmail, 'middle' => $stuMiddle] = personIdentityFromRow($d, 'student');
    if ($stuId !== '' || $stuEmail !== '') {
        $res = upsertPerson('student', $stuId, $stuEmail, $stuName, $departmentId, $programId, $stuMiddle, $campusId);
        $studentId = $res['users_id'];
        if ($res['created']) { $summary['created_students']++; $summary['notes'][] = "Row $rowNum: created student account — {$res['note']}"; }
        else                 { $summary['updated_students']++; }
    }

    // Link instructor + subject + section into a subject_offered
    $offeredId = null;
    if ($subjectId && ($instructorId || $sectionId)) {
        $offeredId = linkOffering($subjectId, $sectionId, $instructorId);
        if ($offeredId) $summary['linked_offerings']++;
    }

    // Enroll the student into that offering
    if ($studentId && $offeredId) {
        if (enrollStudent($studentId, $offeredId, $sectionId)) {
            $summary['enrolled_students']++;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookups (department/program match existing rows only — never auto-created)
// ─────────────────────────────────────────────────────────────────────────────

function resolveDepartment(string $name): ?int
{
    static $cache = [];
    $name = trim($name);
    if ($name === '') return null;
    $key = strtolower($name);
    if (array_key_exists($key, $cache)) return $cache[$key];
    $row = db()->fetchOne(
        "SELECT department_id FROM department WHERE LOWER(department_name) = ? OR LOWER(department_code) = ? LIMIT 1",
        [$key, $key]
    );
    return $cache[$key] = $row ? (int)$row['department_id'] : null;
}

function resolveProgram(string $name): ?int
{
    static $cache = [];
    $name = trim($name);
    if ($name === '') return null;
    $key = strtolower($name);
    if (array_key_exists($key, $cache)) return $cache[$key];
    $row = db()->fetchOne(
        "SELECT program_id FROM program WHERE LOWER(program_name) = ? OR LOWER(program_code) = ? LIMIT 1",
        [$key, $key]
    );
    return $cache[$key] = $row ? (int)$row['program_id'] : null;
}

/** Never auto-created — same reasoning as resolveDepartment/resolveProgram. */
function resolveCampus(string $name): ?int
{
    static $cache = [];
    $name = trim($name);
    if ($name === '') return null;
    $key = strtolower($name);
    if (array_key_exists($key, $cache)) return $cache[$key];
    $row = db()->fetchOne(
        "SELECT campus_id FROM campus WHERE LOWER(campus_name) = ? OR LOWER(campus_code) = ? LIMIT 1",
        [$key, $key]
    );
    return $cache[$key] = $row ? (int)$row['campus_id'] : null;
}

/**
 * Pulls id/name/email/middle-name for one row, for either 'instructor' or
 * 'student' — role-specific columns (e.g. instructor_first_name) win over
 * the generic shared ones (first_name), same as processRow() always did.
 * Name is recombined as "Last, First" so splitPersonName()'s comma branch —
 * which keeps whatever's on each side intact — is what handles it, instead
 * of its no-comma fallback that would otherwise chop a multi-word last name
 * like "Dela Cruz" down to just "Cruz". Middle name is kept out of this and
 * returned separately so it lands in its own `middle_name` column instead
 * of getting glued onto the first name.
 *
 * @return array{id:string, name:string, email:string, middle:string}
 */
function personIdentityFromRow(array $d, string $role): array
{
    $isInstr = $role === 'instructor';
    $id     = $d[$isInstr ? 'employee_id' : 'student_id'] ?? '';
    $first  = $d[$isInstr ? 'instructor_first_name'  : 'student_first_name']  ?? ($d['first_name']  ?? '');
    $last   = $d[$isInstr ? 'instructor_last_name'   : 'student_last_name']   ?? ($d['last_name']   ?? '');
    $middle = $d[$isInstr ? 'instructor_middle_name' : 'student_middle_name'] ?? ($d['middle_name'] ?? '');
    $name   = ($first !== '' || $last !== '')
        ? trim(trim("$last, $first"), ', ')
        : ($d[$isInstr ? 'instructor_name' : 'student_name'] ?? ($d['name'] ?? ''));
    $email  = $d[$isInstr ? 'instructor_email' : 'student_email'] ?? '';
    return ['id' => $id, 'name' => $name, 'email' => $email, 'middle' => $middle];
}

/** "Dela Cruz, Juan P." or "Juan P. Dela Cruz" -> [first, last] */
function splitPersonName(string $full): array
{
    $full = trim($full);
    if ($full === '') return ['', ''];
    if (strpos($full, ',') !== false) {
        [$last, $rest] = array_map('trim', explode(',', $full, 2));
        return [$rest !== '' ? $rest : $last, $last];
    }
    $parts = preg_split('/\s+/', $full);
    if (count($parts) === 1) return [$parts[0], $parts[0]];

    // No comma, so we assume the standard "First ... Last" order. The last
    // WORD isn't necessarily the whole surname though — Filipino/Spanish
    // compound surnames ("Dela Cruz", "De Los Santos", "Del Rosario") are
    // common here, and taking only the final word would chop them down to
    // just their last syllable (e.g. "Cruz" instead of "Dela Cruz"). Walk
    // backward gluing on any connector word immediately before it.
    static $connectors = ['de', 'la', 'las', 'los', 'dela', 'del', 'delos', 'delas', 'san', 'sta', 'sto',
        'santa', 'santo', 'van', 'von', 'der', 'den', 'mc', 'mac', 'bin', 'binti', 'al'];

    $lastNameParts = [array_pop($parts)];
    while ($parts && in_array(strtolower(end($parts)), $connectors, true)) {
        array_unshift($lastNameParts, array_pop($parts));
    }
    $lastName  = implode(' ', $lastNameParts);
    $firstName = $parts ? implode(' ', $parts) : $lastName;
    return [$firstName, $lastName];
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject / Section upserts
// ─────────────────────────────────────────────────────────────────────────────

function findOrCreateSubject(array $d, ?int $programId): ?array
{
    $code = trim($d['subject_code'] ?? '');
    if ($code === '') return null;
    $existing = db()->fetchOne("SELECT * FROM subject WHERE subject_code = ?", [$code]);

    $name      = trim($d['subject_name'] ?? '');
    $type      = trim($d['subject_type'] ?? '') ?: null;
    $lectHrs   = is_numeric($d['lect_hrs']   ?? '') ? (int)$d['lect_hrs']   : null;
    $labHrs    = is_numeric($d['lab_hrs']    ?? '') ? (int)$d['lab_hrs']    : null;
    $lectUnits = is_numeric($d['lect_units'] ?? '') ? (int)$d['lect_units'] : null;
    $labUnits  = is_numeric($d['lab_units']  ?? '') ? (int)$d['lab_units']  : null;
    $units     = is_numeric($d['units']      ?? '') ? (int)$d['units']     : null;

    if ($existing) {
        $map = [
            'subject_name'  => $name !== '' ? $name : null,
            'subject_type'  => $type,
            'lecture_hours' => $lectHrs,
            'lab_hours'     => $labHrs,
            'lecture_units' => $lectUnits,
            'lab_units'     => $labUnits,
            'units'         => $units,
            'program_id'    => $programId,
        ];
        $sets = []; $params = [];
        foreach ($map as $col => $val) {
            if ($val !== null) { $sets[] = "`$col` = ?"; $params[] = $val; }
        }
        if ($sets) {
            $params[] = $existing['subject_id'];
            pdo()->prepare("UPDATE subject SET " . implode(', ', $sets) . ", updated_at = NOW() WHERE subject_id = ?")->execute($params);
        }
        return ['subject_id' => (int)$existing['subject_id'], 'created' => false, 'updated' => (bool)$sets];
    }

    if ($name === '') {
        throw new Exception("subject code \"$code\" has no Subject Name — can't create it");
    }

    pdo()->prepare(
        "INSERT INTO subject (program_id, subject_code, subject_name, subject_type,
             lecture_hours, lab_hours, lecture_units, lab_units, units, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())"
    )->execute([$programId, $code, $name, $type, $lectHrs ?? 0, $labHrs ?? 0, $lectUnits, $labUnits, $units ?? 3]);
    return ['subject_id' => (int)pdo()->lastInsertId(), 'created' => true, 'updated' => false];
}

function findOrCreateSection(string $name, ?int $programId, ?int $capacity): ?array
{
    $name = trim($name);
    if ($name === '') return null;

    $existing = $programId
        ? db()->fetchOne(
            "SELECT * FROM section WHERE section_name = ? AND (program_id = ? OR program_id IS NULL)
             ORDER BY (program_id IS NOT NULL) DESC LIMIT 1",
            [$name, $programId])
        : db()->fetchOne("SELECT * FROM section WHERE section_name = ? LIMIT 1", [$name]);

    if ($existing) {
        if ($capacity && (int)$existing['max_students'] !== $capacity) {
            pdo()->prepare("UPDATE section SET max_students = ?, updated_at = NOW() WHERE section_id = ?")
                 ->execute([$capacity, $existing['section_id']]);
        }
        if ($programId && empty($existing['program_id'])) {
            pdo()->prepare("UPDATE section SET program_id = ?, updated_at = NOW() WHERE section_id = ?")
                 ->execute([$programId, $existing['section_id']]);
        }
        return ['section_id' => (int)$existing['section_id'], 'created' => false];
    }

    $activeSem  = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
    $semesterId = $activeSem ? (int)$activeSem['semester_id'] : null;
    $code       = generateSectionEnrollmentCode();

    pdo()->prepare(
        "INSERT INTO section (section_name, program_id, semester_id, enrollment_code, max_students, status)
         VALUES (?, ?, ?, ?, ?, 'active')"
    )->execute([$name, $programId, $semesterId, $code, $capacity ?: 40]);
    return ['section_id' => (int)pdo()->lastInsertId(), 'created' => true];
}

function generateSectionEnrollmentCode(): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $code = '';
        for ($i = 0; $i < 8; $i++) $code .= $chars[random_int(0, strlen($chars) - 1)];
        $exists = db()->fetchOne("SELECT section_id FROM section WHERE enrollment_code = ?", [$code]);
    } while ($exists);
    return $code;
}

// ─────────────────────────────────────────────────────────────────────────────
// Person (instructor / student) upsert
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds an existing account by employee_id/student_id (or email as a
 * fallback), or creates one. New accounts get employee_id/student_id as
 * their login ID and their last name (lowercased) as a temp password —
 * users.must_change_password forces them to set a real one on first login.
 * Existing accounts are only ever light-touch updated (fill blanks), never
 * have their password touched.
 *
 * @return array{users_id:int, created:bool, note:string}
 */
function upsertPerson(string $role, string $idValue, string $email, string $fullName, ?int $departmentId, ?int $programId, string $middleName = '', ?int $campusId = null): array
{
    $idColumn = $role === 'instructor' ? 'employee_id' : 'student_id';
    $idValue  = trim($idValue);
    $email    = trim($email);
    $middleName = trim($middleName);

    $user = null;
    if ($idValue !== '') {
        $user = db()->fetchOne("SELECT * FROM users WHERE `$idColumn` = ?", [$idValue]);
    }
    if (!$user && $email !== '') {
        $user = db()->fetchOne("SELECT * FROM users WHERE email = ?", [$email]);
    }

    if ($user) {
        // A "@pending.local" address is a placeholder we invented ourselves
        // when an earlier upload created this account without a real email
        // (see $finalEmail below) — it doesn't count as "already has an
        // email" for the purpose of accepting a real one from a later file.
        // This is exactly the credentials-catch-up case: admin first uploads
        // a roster with just IDs/names, then later uploads a file that adds
        // each instructor's real email — that real email should now land on
        // the account instead of being silently skipped.
        $hasRealEmail = !empty($user['email']) && !str_ends_with(strtolower($user['email']), '@pending.local');

        $sets = []; $params = [];
        if ($idValue !== '' && empty($user[$idColumn]))                          { $sets[] = "`$idColumn` = ?";     $params[] = $idValue; }
        if ($email !== '' && strcasecmp($email, $user['email'] ?? '') !== 0 && !$hasRealEmail) {
            $emailTaken = db()->fetchOne("SELECT 1 FROM users WHERE email = ? AND users_id != ?", [$email, $user['users_id']]);
            if ($emailTaken) {
                throw new Exception("can't add email \"$email\" to $role \"$idValue\" — it's already used by another account");
            }
            $sets[] = "email = ?"; $params[] = $email;
        }
        if ($departmentId && empty($user['department_id']))     { $sets[] = "department_id = ?";   $params[] = $departmentId; }
        if ($programId && empty($user['program_id']))           { $sets[] = "program_id = ?";       $params[] = $programId; }
        if ($middleName !== '' && empty($user['middle_name']))  { $sets[] = "middle_name = ?";      $params[] = $middleName; }
        if ($campusId && empty($user['campus_id']))              { $sets[] = "campus_id = ?";        $params[] = $campusId; }
        if ($sets) {
            $params[] = $user['users_id'];
            pdo()->prepare("UPDATE users SET " . implode(', ', $sets) . ", updated_at = NOW() WHERE users_id = ?")->execute($params);
        }
        return ['users_id' => (int)$user['users_id'], 'created' => false, 'note' => $sets ? 'matched existing account, filled in blanks' : 'matched existing account'];
    }

    if ($idValue === '') {
        throw new Exception("no " . ($role === 'instructor' ? 'Employee ID' : 'Student ID') . " given — can't create a new $role account (found by email match failed too)");
    }

    [$firstName, $lastName] = splitPersonName($fullName !== '' ? $fullName : $idValue);
    if ($lastName === '') $lastName = $firstName;

    // A real email should normally be in the sheet — this placeholder only
    // exists so the UNIQUE(email) constraint doesn't block account creation
    // when a row genuinely has none.
    $finalEmail = $email !== '' ? $email : ($idValue . '@pending.local');
    if (db()->fetchOne("SELECT 1 FROM users WHERE email = ?", [$finalEmail])) {
        throw new Exception("can't create $role \"$idValue\" — email \"$finalEmail\" is already used by another account");
    }

    // No password is set here on purpose — leaving it NULL means their very
    // first login needs nothing but their Employee ID / Student ID (same
    // "true first login, no password required yet" path AuthAPI.php already
    // has for admin-created dean accounts). AuthAPI then walks them through
    // setting a real password — and a real @phinmaed.com email too, if this
    // row didn't have one — before they reach their dashboard. Nothing to
    // hand out or for them to already know, so must_change_password isn't
    // needed here either; the NULL password alone gates that first login.
    pdo()->prepare(
        "INSERT INTO users (first_name, middle_name, last_name, email, password, role, status,
             department_id, program_id, campus_id, employee_id, student_id, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'active', ?, ?, ?, ?, ?, 0, NOW(), NOW())"
    )->execute([
        $firstName, $middleName !== '' ? $middleName : null, $lastName, $finalEmail, $role,
        $departmentId, $programId, $campusId,
        $role === 'instructor' ? $idValue : null,
        $role === 'student'    ? $idValue : null,
    ]);
    $newId = (int)pdo()->lastInsertId();

    return ['users_id' => $newId, 'created' => true, 'note' => "login ID \"$idValue\" — no password yet, logs in with ID only and is asked to set one"];
}

// ─────────────────────────────────────────────────────────────────────────────
// Offering / enrollment linking
// ─────────────────────────────────────────────────────────────────────────────

/** Finds or creates the subject_offered row tying a subject to a teacher (+ links a section to it). */
function linkOffering(int $subjectId, ?int $sectionId, ?int $teacherId): ?int
{
    $semesterId = null;
    if ($sectionId) {
        $sec = db()->fetchOne("SELECT semester_id FROM section WHERE section_id = ?", [$sectionId]);
        $semesterId = $sec['semester_id'] ?? null;
    }
    if (!$semesterId) {
        $activeSem = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
        $semesterId = $activeSem ? (int)$activeSem['semester_id'] : null;
    }

    $offering = null;
    if ($teacherId) {
        $offering = db()->fetchOne(
            "SELECT subject_offered_id, user_teacher_id FROM subject_offered
             WHERE subject_id = ? AND user_teacher_id = ? AND (semester_id = ? OR ? IS NULL) LIMIT 1",
            [$subjectId, $teacherId, $semesterId, $semesterId]
        );
    }
    if (!$offering) {
        $offering = db()->fetchOne(
            "SELECT subject_offered_id, user_teacher_id FROM subject_offered
             WHERE subject_id = ? AND (semester_id = ? OR ? IS NULL)
             ORDER BY (user_teacher_id IS NOT NULL) DESC LIMIT 1",
            [$subjectId, $semesterId, $semesterId]
        );
    }

    if ($offering) {
        $offeredId = (int)$offering['subject_offered_id'];
        if ($teacherId && empty($offering['user_teacher_id'])) {
            pdo()->prepare("UPDATE subject_offered SET user_teacher_id = ?, updated_at = NOW() WHERE subject_offered_id = ?")
                 ->execute([$teacherId, $offeredId]);
        }
    } else {
        pdo()->prepare(
            "INSERT INTO subject_offered (subject_id, semester_id, user_teacher_id, status, created_at, updated_at)
             VALUES (?, ?, ?, 'open', NOW(), NOW())"
        )->execute([$subjectId, $semesterId, $teacherId]);
        $offeredId = (int)pdo()->lastInsertId();
    }

    if ($sectionId) {
        $exists = db()->fetchOne("SELECT 1 FROM section_subject WHERE section_id = ? AND subject_offered_id = ?", [$sectionId, $offeredId]);
        if (!$exists) {
            pdo()->prepare("INSERT INTO section_subject (section_id, subject_offered_id, status, created_at) VALUES (?, ?, 'active', NOW())")
                 ->execute([$sectionId, $offeredId]);
        }
    }

    return $offeredId;
}

function enrollStudent(int $studentUserId, int $offeredId, ?int $sectionId): bool
{
    $exists = db()->fetchOne(
        "SELECT student_subject_id FROM student_subject WHERE user_student_id = ? AND subject_offered_id = ?",
        [$studentUserId, $offeredId]
    );
    if ($exists) return false;
    pdo()->prepare(
        "INSERT INTO student_subject (user_student_id, subject_offered_id, section_id, status, enrollment_date)
         VALUES (?, ?, ?, 'enrolled', NOW())"
    )->execute([$studentUserId, $offeredId, $sectionId]);
    return true;
}
