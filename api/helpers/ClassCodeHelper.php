<?php
/**
 * Class Code Helper — per-(section, subject) join codes.
 *
 * section.enrollment_code is the OLD section-wide code: one code that joins
 * EVERY subject taught to that section at once. It's still resolved as a
 * fallback so codes already printed/shared keep working, but it's no longer
 * what gets shown as "the class code" for one subject — a section commonly
 * takes several subjects together, so that one code was never actually
 * unique to a single class, just to a physical section.
 *
 * section_subject.enrollment_code is the real fix: each (section, subject)
 * pairing gets its OWN unique code, generated here and enforced unique at
 * the database level. "Class code" for a subject now always resolves to
 * exactly that one subject — never anything else taught to the same section.
 */

function ensureSectionSubjectCodeColumn(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        if (!db()->fetchOne("SHOW COLUMNS FROM section_subject LIKE 'enrollment_code'")) {
            pdo()->exec("ALTER TABLE section_subject ADD COLUMN enrollment_code VARCHAR(20) NULL DEFAULT NULL AFTER subject_offered_id");
            pdo()->exec("ALTER TABLE section_subject ADD UNIQUE KEY uq_section_subject_code (enrollment_code)");
        }
    } catch (Exception $e) {
        error_log('ensureSectionSubjectCodeColumn: ' . $e->getMessage());
    }
}

/** Same alphabet/length as section.enrollment_code, checked unique against
 *  BOTH tables so a per-subject code can never collide with a legacy
 *  section-wide one (both are resolved through the same lookup). */
function generateUniqueClassCode(): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $code = '';
        for ($i = 0; $i < 8; $i++) $code .= $chars[random_int(0, strlen($chars) - 1)];
        $inSections = db()->fetchOne("SELECT section_id FROM section WHERE enrollment_code = ?", [$code]);
        $inPairs    = db()->fetchOne("SELECT section_subject_id FROM section_subject WHERE enrollment_code = ?", [$code]);
    } while ($inSections || $inPairs);
    return $code;
}

/** Every (section, subject) pairing created before this feature existed has
 *  a NULL code — fill those in lazily, the first time anything reads them,
 *  so there's no separate migration step to remember to run. */
function backfillMissingSectionSubjectCodes(): void {
    static $done = false;
    if ($done) return;
    $done = true;
    ensureSectionSubjectCodeColumn();
    try {
        $rows = db()->fetchAll(
            "SELECT section_subject_id FROM section_subject WHERE enrollment_code IS NULL AND status = 'active'"
        );
        foreach ($rows as $r) {
            pdo()->prepare("UPDATE section_subject SET enrollment_code = ? WHERE section_subject_id = ?")
                ->execute([generateUniqueClassCode(), (int)$r['section_subject_id']]);
        }
    } catch (Exception $e) {
        error_log('backfillMissingSectionSubjectCodes: ' . $e->getMessage());
    }
}

/**
 * Resolve any code a student types or scans, checking the unique per-subject
 * code first and only falling back to the legacy section-wide code.
 * Returns null if it matches nothing.
 */
function resolveClassCode(string $code): ?array {
    $pair = db()->fetchOne(
        "SELECT section_subject_id, section_id, subject_offered_id
         FROM section_subject WHERE enrollment_code = ? AND status = 'active'",
        [$code]
    );
    if ($pair) {
        return [
            'type'               => 'subject',
            'section_subject_id' => (int)$pair['section_subject_id'],
            'section_id'         => (int)$pair['section_id'],
            'subject_offered_id' => (int)$pair['subject_offered_id'],
        ];
    }
    $section = db()->fetchOne("SELECT section_id FROM section WHERE enrollment_code = ? AND status = 'active'", [$code]);
    if ($section) {
        return ['type' => 'section', 'section_id' => (int)$section['section_id']];
    }
    return null;
}
