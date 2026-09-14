/**
 * Module Quiz page — builds/edits a module's Let's Practice, Reflection or
 * Wrap Up Quiz on its own page rather than in a dialog, matching how the
 * regular quiz builder works.
 *
 * Reached via #instructor/module-quiz?subject_id=..&module=..&component=..
 * (optionally &quiz_id=.. to edit, &back=.. for where the close button
 * returns to). All the actual building lives in the shared component.
 */
import { renderModuleQuizPage } from '../../components/module-quiz-builder.js';

export async function render(container, params = {}) {
    await renderModuleQuizPage(container, params);
}
