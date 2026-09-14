<?php
/**
 * Reviewer API — student-facing exam reviewer generated from a subject's own
 * module documents (Teaching Guide + Student Activity Sheet).
 *
 * Built in response to student survey feedback asking for "a summarized
 * reviewer to help students prepare for exams".
 *
 * Actions:
 *   GET  ?action=modules&subject_id=X   — which modules the student can review
 *   POST ?action=generate               — {subject_id, modules:[1,2,3]} -> reviewer
 *
 * Two rules matter here and are enforced on every call:
 *   1. A student may only reach a subject they're actually enrolled in.
 *   2. Only PUBLISHED documents are readable. An instructor who hasn't
 *      published a module's SAS yet must not have it leak out through the
 *      reviewer.
 */
require_once __DIR__ . '/../config/cors.php';
header('Content-Type: application/json');
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/GroqCurl.php';
require_once __DIR__ . '/helpers/AiProvider.php';
require_once __DIR__ . '/helpers/StudentListParser.php';

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

// Reviewing more modules than this in one request makes the prompt large
// enough that the model starts truncating the later modules — better to
// refuse clearly than to silently return a half-empty reviewer.
const REVIEWER_MAX_MODULES = 5;
// Ceiling for a single module's extracted text, so one enormous SAS can't
// crowd out the others.
const REVIEWER_CHARS_PER_MODULE = 6000;
// Ceiling for the WHOLE prompt's source text, shared across however many
// modules were picked. This is what actually bounds how long generation
// takes: one module measured ~65s against a 120s cURL timeout, so letting
// five modules send five times the text would reliably time out. With a
// fixed total budget, picking more modules means less text each rather than
// a longer wait.
const REVIEWER_TOTAL_CHARS = 10000;
// Never shrink a module's share below this — past a certain point the
// reviewer stops being useful and it's better to ask for fewer modules.
const REVIEWER_MIN_CHARS_PER_MODULE = 2000;

$action = $_GET['action'] ?? '';
switch ($action) {
    case 'modules':  handleModules();  break;
    case 'generate': handleGenerate(); break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

/**
 * True if the caller may review this subject. Students must be enrolled;
 * staff who can already see the subject's materials are allowed through so
 * they can preview what their students would get.
 */
function reviewerCanAccessSubject(int $subjectId): bool
{
    $role = Auth::role();
    if (in_array($role, ['admin', 'dean', 'program_head'], true)) return true;

    if ($role === 'instructor') {
        return (bool)db()->fetchOne(
            "SELECT 1 FROM subject_offered WHERE subject_id = ? AND user_teacher_id = ? LIMIT 1",
            [$subjectId, Auth::id()]
        );
    }

    return (bool)db()->fetchOne(
        "SELECT 1
           FROM student_subject ss
           JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
          WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'
          LIMIT 1",
        [Auth::id(), $subjectId]
    );
}

/** GET ?action=modules&subject_id=X — modules that actually have published material to review. */
function handleModules(): void
{
    $subjectId = (int)($_GET['subject_id'] ?? 0);
    if (!$subjectId) {
        echo json_encode(['success' => false, 'message' => 'subject_id required']);
        return;
    }
    if (!reviewerCanAccessSubject($subjectId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'You do not have access to this subject']);
        return;
    }

    $rows = db()->fetchAll(
        "SELECT module_number,
                SUM(doc_type = 'sas')            AS has_sas,
                SUM(doc_type = 'teaching_guide') AS has_tg
           FROM subject_module_documents
          WHERE subject_id = ? AND is_published = 1
          GROUP BY module_number
          ORDER BY module_number",
        [$subjectId]
    );

    $modules = array_map(fn($r) => [
        'module_number' => (int)$r['module_number'],
        'has_sas'       => (int)$r['has_sas'] > 0,
        'has_tg'        => (int)$r['has_tg'] > 0,
    ], $rows);

    echo json_encode([
        'success'     => true,
        'modules'     => $modules,
        'max_modules' => REVIEWER_MAX_MODULES,
    ]);
}

/** POST ?action=generate — {subject_id, modules:[…]} */
function handleGenerate(): void
{
    $input     = json_decode(file_get_contents('php://input'), true) ?? [];
    $subjectId = (int)($input['subject_id'] ?? 0);
    $modules   = array_values(array_unique(array_map('intval', (array)($input['modules'] ?? []))));
    $modules   = array_values(array_filter($modules, fn($m) => $m >= 1 && $m <= 14));
    sort($modules);

    if (!$subjectId || !$modules) {
        echo json_encode(['success' => false, 'message' => 'Pick at least one module to review.']);
        return;
    }
    if (count($modules) > REVIEWER_MAX_MODULES) {
        echo json_encode(['success' => false, 'message' =>
            'Please pick at most ' . REVIEWER_MAX_MODULES . ' modules at a time so the reviewer stays detailed.']);
        return;
    }
    if (!reviewerCanAccessSubject($subjectId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'You do not have access to this subject']);
        return;
    }

    $apiKey = getAiApiKey();
    if (!$apiKey) {
        echo json_encode(['success' => false, 'message' => 'AI is not configured yet. Please contact your administrator.']);
        return;
    }

    $subject = db()->fetchOne("SELECT subject_code, subject_name FROM subject WHERE subject_id = ?", [$subjectId]);

    $ph   = implode(',', array_fill(0, count($modules), '?'));
    $docs = db()->fetchAll(
        "SELECT module_number, doc_type, file_path, original_name
           FROM subject_module_documents
          WHERE subject_id = ? AND is_published = 1 AND module_number IN ($ph)
          ORDER BY module_number",
        array_merge([$subjectId], $modules)
    );
    if (!$docs) {
        echo json_encode(['success' => false, 'message' =>
            'There is no published material for the module(s) you picked yet.']);
        return;
    }

    // Split the total budget across the modules actually picked.
    $perModule = max(
        REVIEWER_MIN_CHARS_PER_MODULE,
        min(REVIEWER_CHARS_PER_MODULE, (int)floor(REVIEWER_TOTAL_CHARS / max(1, count($modules))))
    );

    $sourceText = '';
    $usedModules = [];
    foreach ($modules as $m) {
        $chunk = '';
        foreach ($docs as $d) {
            if ((int)$d['module_number'] !== $m) continue;
            $path = realpath(__DIR__ . '/../' . ltrim($d['file_path'], '/'));
            if (!$path) continue;
            try {
                $text = StudentListParser::extractReadableTextFromPath($path, $d['original_name']);
            } catch (Exception $e) {
                continue; // a single unreadable file shouldn't sink the whole reviewer
            }
            if (trim($text) !== '') {
                $chunk .= "\n" . trim($text);
            }
        }
        $chunk = trim($chunk);
        if ($chunk === '') continue;
        if (mb_strlen($chunk) > $perModule) {
            $chunk = mb_substr($chunk, 0, $perModule);
        }
        $usedModules[] = $m;
        $sourceText .= "\n\n===== MODULE {$m} =====\n" . $chunk;
    }

    if (trim($sourceText) === '') {
        echo json_encode(['success' => false, 'message' =>
            "The material for those modules couldn't be read. It may be a scanned image rather than text."]);
        return;
    }

    $systemMsg = 'You are a study coach making an exam reviewer for a college student, using ONLY the course material given to you. '
        . 'Never invent facts that are not in the material. You respond ONLY with strict JSON — no prose, no markdown fences.';

    $prompt = buildReviewerPrompt($sourceText, $subject['subject_name'] ?? '', $usedModules);

    $result = callAiChatCompletion($systemMsg, $prompt, 3500, 0.3, $apiKey, AI_TIMEOUT_LONGFORM);
    if (!$result['success']) {
        echo json_encode(['success' => false, 'message' => $result['error'] ?? 'Could not generate the reviewer. Please try again.']);
        return;
    }

    $parsed = parseReviewerResponse($result['text']);
    if (!$parsed) {
        echo json_encode(['success' => false, 'message' => 'The reviewer came back in an unexpected format. Please try again.']);
        return;
    }

    echo json_encode([
        'success' => true,
        'data'    => [
            'subject_code' => $subject['subject_code'] ?? '',
            'subject_name' => $subject['subject_name'] ?? '',
            'modules'      => $usedModules,
            'generated_at' => date('c'),
            'summary'      => $parsed['summary'],
            'key_terms'    => $parsed['key_terms'],
            'practice'     => $parsed['practice'],
        ],
    ]);
}

function buildReviewerPrompt(string $sourceText, string $subjectName, array $modules): string
{
    $modList = implode(', ', $modules);
    return <<<PROMPT
Below is the course material for {$subjectName}, covering module(s) {$modList}.

Build a study reviewer from it. Use ONLY what is in the material — if something
is not covered there, leave it out rather than filling it in from your own
knowledge.

Return strict JSON in exactly this shape:

{
  "summary": [
    { "module": 1, "heading": "short topic name", "points": ["key point", "key point"] }
  ],
  "key_terms": [
    { "term": "the term", "definition": "a one-sentence definition in plain language", "module": 1 }
  ],
  "practice": [
    { "question": "a self-test question", "answer": "the answer, drawn from the material", "module": 1 }
  ]
}

Rules:
- Write for a student revising the night before an exam: plain, direct language.
- "summary": group by module. 2-4 headings per module, each with 2-5 short points.
- "key_terms": 5-12 terms total across everything. Skip terms the material never defines.
- "practice": 5-10 questions total. Mix recall and understanding. Every answer must
  be findable in the material above.
- Skip any "matching type" exercise — that format doesn't work as a flat question.
- Do not include the module headers (===== MODULE n =====) in your output.

COURSE MATERIAL:
{$sourceText}
PROMPT;
}

/** Parses the model's JSON, tolerating markdown fences and stray prose around it. */
function parseReviewerResponse(string $text): ?array
{
    $text = trim($text);
    $text = preg_replace('/^```(json)?/i', '', $text);
    $text = preg_replace('/```$/', '', $text);
    $text = trim($text);

    $start = strpos($text, '{');
    $end   = strrpos($text, '}');
    if ($start === false || $end === false || $end < $start) return null;

    $decoded = json_decode(substr($text, $start, $end - $start + 1), true);
    if (!is_array($decoded)) return null;

    $summary = [];
    foreach ((array)($decoded['summary'] ?? []) as $s) {
        if (!is_array($s) || empty($s['heading'])) continue;
        $points = array_values(array_filter(array_map(
            fn($p) => trim((string)$p),
            (array)($s['points'] ?? [])
        ), fn($p) => $p !== ''));
        if (!$points) continue;
        $summary[] = [
            'module'  => isset($s['module']) ? (int)$s['module'] : null,
            'heading' => trim((string)$s['heading']),
            'points'  => $points,
        ];
    }

    $terms = [];
    foreach ((array)($decoded['key_terms'] ?? []) as $t) {
        if (!is_array($t) || empty($t['term']) || empty($t['definition'])) continue;
        $terms[] = [
            'term'       => trim((string)$t['term']),
            'definition' => trim((string)$t['definition']),
            'module'     => isset($t['module']) ? (int)$t['module'] : null,
        ];
    }

    $practice = [];
    foreach ((array)($decoded['practice'] ?? []) as $p) {
        if (!is_array($p) || empty($p['question'])) continue;
        $practice[] = [
            'question' => trim((string)$p['question']),
            'answer'   => trim((string)($p['answer'] ?? '')),
            'module'   => isset($p['module']) ? (int)$p['module'] : null,
        ];
    }

    if (!$summary && !$terms && !$practice) return null;
    return ['summary' => $summary, 'key_terms' => $terms, 'practice' => $practice];
}
