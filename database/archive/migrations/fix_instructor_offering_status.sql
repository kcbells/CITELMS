-- ============================================================
-- Fix: Reactivate subject_offered rows that are linked to
--      active sections but have status != 'open'.
-- ============================================================
-- Why this is needed:
--   When an instructor removes a subject from a section,
--   handleRemoveSubject() cancels the offering (status='cancelled').
--   If they re-add it, the old code failed to reactivate the
--   cancelled offering, leaving section_subject pointing to a
--   'cancelled' offering — visible on the Sections page (Mine badge)
--   but invisible to the Dashboard (which filters status='open').
--
-- Run this in phpMyAdmin (SQL tab) on the cit_lms database.
-- Safe to run multiple times.
-- ============================================================

-- ── Step 1: Reactivate any offering that is referenced by an active
--            section_subject but has a non-'open' status ────────────
UPDATE subject_offered so
JOIN section_subject ss ON ss.subject_offered_id = so.subject_offered_id
SET so.status = 'open', so.updated_at = NOW()
WHERE ss.status = 'active'
  AND so.status != 'open';

-- ── Verify: check offerings now active in sections ────────────────
SELECT
    so.subject_offered_id,
    s.subject_code,
    s.subject_name,
    so.status,
    CONCAT(u.first_name, ' ', u.last_name) AS instructor,
    COUNT(ss.section_subject_id) AS section_count
FROM subject_offered so
JOIN subject s ON s.subject_id = so.subject_id
LEFT JOIN users u ON u.users_id = so.user_teacher_id
JOIN section_subject ss ON ss.subject_offered_id = so.subject_offered_id
WHERE ss.status = 'active'
GROUP BY so.subject_offered_id
ORDER BY s.subject_code;
