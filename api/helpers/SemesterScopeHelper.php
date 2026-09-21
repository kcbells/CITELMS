<?php
/**
 * "Which term am I looking at?" for instructor-facing lists.
 *
 * THE PROBLEM
 * -----------
 * A dean's Faculty Assignments page always filters subject_offered by the
 * semester picked in its dropdown. The instructor-facing lists (dashboard
 * My Classes, the sidebar's My Subjects, the lesson/quiz subject pickers)
 * filtered only on `so.user_teacher_id = ? AND so.status = 'open'` with no
 * term filter at all.
 *
 * So an instructor saw every offering ever created for them, across every
 * semester - including semesters years in the future that a Class Density
 * import had already generated. That is why a dean could count 2 subjects
 * for an instructor while that instructor's own dashboard showed 4: the
 * extra two belonged to a different academic year entirely.
 *
 * require_once this file, then:
 *   activeSemesterId()              -> ?int
 *   currentTermSql('so')            -> string  (SQL fragment, or '' when
 *                                               no semester is marked active)
 */

/** The semester row marked active, or null when none is. Cached per request. */
function activeSemesterId(): ?int
{
    static $id = false;           // false = not looked up yet (null is a real answer)
    if ($id !== false) return $id;

    try {
        $row = db()->fetchOne("SELECT semester_id FROM semester WHERE status = 'active' LIMIT 1");
        $id = $row ? (int)$row['semester_id'] : null;
    } catch (Throwable $e) {
        error_log('activeSemesterId: ' . $e->getMessage());
        $id = null;
    }
    return $id;
}

/**
 * AND-fragment restricting a subject_offered alias to the current term.
 *
 * Returns '' when no semester is active, so a half-configured database keeps
 * showing everything rather than presenting every instructor with an empty
 * dashboard.
 *
 * semester_id IS NULL counts as in-term: dean-assign can create an offering
 * with a NULL semester when no term is active, and those must not vanish.
 *
 * $includeArchived keeps offerings whose own status is 'archived' regardless
 * of term, for the lists that deliberately show an Archived section.
 */
function currentTermSql(string $soAlias, bool $includeArchived = false): string
{
    $sem = activeSemesterId();
    if ($sem === null) return '';

    $so = preg_replace('/[^a-zA-Z0-9_]/', '', $soAlias);
    $base = "($so.semester_id = $sem OR $so.semester_id IS NULL";
    if ($includeArchived) {
        $base .= " OR $so.status = 'archived'";
    }
    return ' AND ' . $base . ')';
}
