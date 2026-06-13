<?php
/**
 * Student sign-up catalog — colleges, courses, and majors.
 * Ensures departments/programs exist in DB and resolves program → department on register.
 */

function ensureUserMajorColumn(): void {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    try {
        if (!db()->fetchOne("SHOW COLUMNS FROM users LIKE 'major'")) {
            pdo()->exec(
                "ALTER TABLE users ADD COLUMN major VARCHAR(120) NULL DEFAULT NULL
                 COMMENT 'Program major/specialization when applicable' AFTER program_id"
            );
        }
    } catch (Exception $e) {
        error_log('users.major column: ' . $e->getMessage());
    }
}

/**
 * Canonical sign-up catalog (department → programs → optional majors).
 */
function signupCatalogDefinition(): array {
    return [
        [
            'code' => 'CAHS',
            'name' => 'College of Allied Health Sciences',
            'programs' => [
                ['code' => 'BSN', 'name' => 'BS Nursing'],
                ['code' => 'BSP', 'name' => 'BS Pharmacy'],
                ['code' => 'BSMT', 'name' => 'BS Medical Technologies'],
                ['code' => 'BSPsych', 'name' => 'BS Psychology'],
            ],
        ],
        [
            'code' => 'CEA',
            'name' => 'College of Engineering and Architecture',
            'programs' => [
                ['code' => 'BSAR', 'name' => 'Bachelor of Science in Architecture'],
                ['code' => 'BSCE', 'name' => 'Bachelor of Science in Civil Engineering'],
                ['code' => 'BSCPE', 'name' => 'Bachelor of Science in Computer Engineering'],
                ['code' => 'BSEE', 'name' => 'Bachelor of Science in Electrical Engineering'],
                ['code' => 'BSME', 'name' => 'Bachelor of Science in Mechanical Engineering'],
            ],
        ],
        [
            'code' => 'CIT',
            'name' => 'College of Information Technology',
            'programs' => [
                ['code' => 'BSIT', 'name' => 'Bachelor of Science in Information Technology'],
            ],
        ],
        [
            'code' => 'SCCJ',
            'name' => 'School of Criminology and Criminal Justice',
            'programs' => [
                ['code' => 'BSCrim', 'name' => 'Bachelor of Science in Criminology'],
            ],
        ],
        [
            'code' => 'CMA',
            'name' => 'College of Management and Accountancy',
            'programs' => [
                ['code' => 'BSA', 'name' => 'Bachelor of Science in Accountancy'],
                ['code' => 'BSMA', 'name' => 'Bachelor of Science in Management Accounting'],
                ['code' => 'BSHM', 'name' => 'Bachelor of Science in Hospitality Management'],
                ['code' => 'BSTM', 'name' => 'Bachelor of Science in Tourism Management'],
                [
                    'code' => 'BSBA',
                    'name' => 'Bachelor of Science in Business Administration',
                    'majors' => ['Financial Management', 'Marketing Management'],
                ],
            ],
        ],
        [
            'code' => 'COED',
            'name' => 'College of Education',
            'programs' => [
                ['code' => 'BEEd', 'name' => 'Bachelor of Elementary Education'],
                [
                    'code' => 'BSEd',
                    'name' => 'Bachelor of Secondary Education',
                    'majors' => ['Mathematics', 'Filipino', 'English'],
                ],
                ['code' => 'BSECE', 'name' => 'Bachelor of Science in Early Childhood Education'],
            ],
        ],
    ];
}

function ensureSignupCatalogInDb(): void {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    $pdo = pdo();
    $defaultCampusId = null;
    if (db()->fetchOne("SHOW TABLES LIKE 'campus'")) {
        $campus = db()->fetchOne("SELECT campus_id FROM campus ORDER BY campus_id ASC LIMIT 1");
        $defaultCampusId = $campus ? (int)$campus['campus_id'] : null;
    }

    foreach (signupCatalogDefinition() as $dept) {
        $deptCode = $dept['code'];
        $deptName = $dept['name'];

        $row = db()->fetchOne(
            "SELECT department_id FROM department WHERE department_code = ? LIMIT 1",
            [$deptCode]
        );
        if ($row) {
            $deptId = (int)$row['department_id'];
        } else {
            $hasCampusCol = db()->fetchOne("SHOW COLUMNS FROM department LIKE 'campus_id'");
            if ($hasCampusCol && $defaultCampusId) {
                $pdo->prepare(
                    "INSERT INTO department (campus_id, department_code, department_name, status, created_at, updated_at)
                     VALUES (?, ?, ?, 'active', NOW(), NOW())"
                )->execute([$defaultCampusId, $deptCode, $deptName]);
            } else {
                $pdo->prepare(
                    "INSERT INTO department (department_code, department_name, status, created_at, updated_at)
                     VALUES (?, ?, 'active', NOW(), NOW())"
                )->execute([$deptCode, $deptName]);
            }
            $deptId = (int)$pdo->lastInsertId();
        }

        foreach ($dept['programs'] as $prog) {
            $progCode = $prog['code'];
            $progName = $prog['name'];

            $progRow = db()->fetchOne(
                "SELECT program_id FROM program WHERE program_code = ? LIMIT 1",
                [$progCode]
            );
            if ($progRow) {
                $progId = (int)$progRow['program_id'];
            } else {
                $hasDeptCol = db()->fetchOne("SHOW COLUMNS FROM program LIKE 'department_id'");
                if ($hasDeptCol) {
                    $pdo->prepare(
                        "INSERT INTO program (department_id, program_code, program_name, status, created_at, updated_at)
                         VALUES (?, ?, ?, 'active', NOW(), NOW())"
                    )->execute([$deptId, $progCode, $progName]);
                } else {
                    $pdo->prepare(
                        "INSERT INTO program (program_code, program_name, status, created_at, updated_at)
                         VALUES (?, ?, 'active', NOW(), NOW())"
                    )->execute([$progCode, $progName]);
                }
                $progId = (int)$pdo->lastInsertId();
            }

            $link = db()->fetchOne(
                "SELECT dept_program_id FROM department_program WHERE department_id = ? AND program_id = ? LIMIT 1",
                [$deptId, $progId]
            );
            if (!$link) {
                $pdo->prepare(
                    "INSERT INTO department_program (department_id, program_id) VALUES (?, ?)"
                )->execute([$deptId, $progId]);
            }
        }
    }
}

/**
 * Public catalog for sign-up form (grouped by college/department).
 */
function getSignupCatalog(): array {
    ensureSignupCatalogInDb();
    ensureUserMajorColumn();

    $out = [];
    foreach (signupCatalogDefinition() as $dept) {
        $deptRow = db()->fetchOne(
            "SELECT department_id, department_code, department_name FROM department WHERE department_code = ? LIMIT 1",
            [$dept['code']]
        );
        if (!$deptRow) {
            continue;
        }

        $programs = [];
        foreach ($dept['programs'] as $prog) {
            $progRow = db()->fetchOne(
                "SELECT program_id, program_code, program_name FROM program WHERE program_code = ? LIMIT 1",
                [$prog['code']]
            );
            if (!$progRow) {
                continue;
            }
            $programs[] = [
                'program_id'   => (int)$progRow['program_id'],
                'program_code' => $progRow['program_code'],
                'program_name' => $progRow['program_name'],
                'majors'       => $prog['majors'] ?? [],
            ];
        }

        $out[] = [
            'department_id'   => (int)$deptRow['department_id'],
            'department_code' => $deptRow['department_code'],
            'department_name' => $deptRow['department_name'],
            'programs'        => $programs,
        ];
    }

    return $out;
}

/**
 * Resolve program + department from sign-up selection.
 */
function resolveSignupProgram(string $programCode, ?string $major = null): array {
    ensureSignupCatalogInDb();

    $programCode = strtoupper(trim($programCode));
    $major = $major !== null && $major !== '' ? trim($major) : null;

    $catalog = signupCatalogDefinition();
    $allowedMajors = [];
    foreach ($catalog as $dept) {
        foreach ($dept['programs'] as $prog) {
            if (strcasecmp($prog['code'], $programCode) !== 0) {
                continue;
            }
            $allowedMajors = $prog['majors'] ?? [];
            break 2;
        }
    }

    if (!empty($allowedMajors)) {
        if (!$major) {
            throw new InvalidArgumentException('Please select your major for this course.');
        }
        $match = false;
        foreach ($allowedMajors as $m) {
            if (strcasecmp($m, $major) === 0) {
                $major = $m;
                $match = true;
                break;
            }
        }
        if (!$match) {
            throw new InvalidArgumentException('Invalid major for the selected course.');
        }
    } elseif ($major) {
        $major = null;
    }

    $prog = db()->fetchOne(
        "SELECT p.program_id, p.program_code, p.program_name,
                dp.department_id, d.department_code, d.department_name
         FROM program p
         LEFT JOIN department_program dp ON p.program_id = dp.program_id
         LEFT JOIN department d ON dp.department_id = d.department_id
         WHERE p.program_code = ?
         LIMIT 1",
        [$programCode]
    );

    if (!$prog || empty($prog['department_id'])) {
        throw new InvalidArgumentException('Selected course is not available. Please contact the registrar.');
    }

    return [
        'program_id'        => (int)$prog['program_id'],
        'program_code'      => $prog['program_code'],
        'program_name'      => $prog['program_name'],
        'department_id'     => (int)$prog['department_id'],
        'department_code'   => $prog['department_code'],
        'department_name'   => $prog['department_name'],
        'major'             => $major,
    ];
}

/**
 * Split "Juan Dela Cruz" → first_name / last_name.
 */
function splitFullName(string $fullName): array {
    $fullName = preg_replace('/\s+/', ' ', trim($fullName));
    if ($fullName === '') {
        return ['', ''];
    }
    $parts = explode(' ', $fullName, 2);
    return [$parts[0], $parts[1] ?? ''];
}
