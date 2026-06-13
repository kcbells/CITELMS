/**
 * Display names tied to the logged-in LMS account (student_id / employee_id).
 */

export function getLoginId(user) {
    if (!user) return '';
    return String(user.student_id || user.employee_id || '').trim();
}

/** Full name from LMS profile */
export function getFullName(user) {
    if (!user) return 'User';
    return (user.name || `${user.first_name || ''} ${user.last_name || ''}`).trim() || 'User';
}

/** Full name + system login ID — shown in UI and Jitsi */
export function getSystemDisplayName(user) {
    const name = getFullName(user);
    const loginId = getLoginId(user);
    return loginId ? `${name} (${loginId})` : name;
}

/** Stable Jitsi room name per subject */
export function buildClassRoomSlug(subjectCode, subjectId) {
    const code = String(subjectCode || 'CLASS').replace(/[^a-zA-Z0-9]/g, '_');
    return `COC_LMS_${code}_${subjectId}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Identity passed to Jitsi Meet — always from the logged-in LMS account.
 * displayName: "Juan Dela Cruz (ADMIN-001)"
 * email: unique pseudo-email from login ID (helps Jitsi identify the participant)
 */
export function getJitsiIdentity(user) {
    const loginId = getLoginId(user);
    const displayName = getSystemDisplayName(user);
    const safeId = (loginId || `user${user?.users_id || user?.id || '0'}`)
        .replace(/[^a-zA-Z0-9._-]/g, '');
    const email = user?.email?.includes('@')
        ? user.email
        : `${safeId || 'guest'}@lms.coc.local`;

    return { displayName, email, loginId: loginId || safeId };
}
