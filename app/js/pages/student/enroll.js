/**
 * Legacy route — redirects to My Subjects and opens join panel
 */
import { openJoinPanel } from '../../components/student-enroll-fab.js';

export async function render() {
    window.location.hash = '#student/my-subjects?join=1';
    setTimeout(() => openJoinPanel(), 150);
}
