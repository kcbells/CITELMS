<?php
/**
 * CIT-LMS - AI Quiz Generation API
 * Handles Groq API calls for generating quiz questions
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/QuizSectionHelper.php';
require_once __DIR__ . '/helpers/GroqCurl.php';
require_once __DIR__ . '/helpers/AiProvider.php';
require_once __DIR__ . '/helpers/StudentListParser.php';
require_once __DIR__ . '/helpers/ScopeHelper.php';

header('Content-Type: application/json');
ini_set('display_errors', '0');

// Require instructor role — deans/program heads who oversee a subject (or who
// self-assign as the teacher of record — see SubjectOfferingsAPI.php's
// dean-assign self path) reuse this same instructor UI, so they must be
// allowed through too, not just literal 'instructor'.
if (!Auth::check() || !in_array(Auth::role(), ['instructor', 'dean', 'program_head'], true)) {
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

$userId = Auth::id();
$input = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $_GET['action'] ?? $input['action'] ?? '';

// RBAC: enforce permission per action
$_aiPerms = [
    'subjects'      => 'ai_tools.use',
    'lessons'       => 'ai_tools.use',
    'extract-text'  => 'ai_tools.generate',
    'generate'      => 'ai_tools.generate',
    'save'          => 'ai_tools.generate',
    'generate-from-module-docs' => 'ai_tools.generate',
];
if (isset($_aiPerms[$action]) && !Auth::can($_aiPerms[$action])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => "Permission denied: {$_aiPerms[$action]}"]);
    exit;
}

switch ($action) {
    case 'extract-text':
        extractDocumentText();
        break;
    case 'generate':
        generateQuestions($input);
        break;
    case 'save':
        saveQuiz($input, $userId);
        break;
    case 'generate-from-module-docs':
        generateFromModuleDocs($input);
        break;
    case 'subjects':
        getInstructorSubjects($userId);
        break;
    case 'lessons':
        getSubjectLessons($userId);
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
}

function getInstructorSubjects($userId) {
    $data = db()->fetchAll(
        "SELECT DISTINCT s.subject_id, s.subject_code, s.subject_name
         FROM subject s
         JOIN subject_offered so ON s.subject_id = so.subject_id
         WHERE so.user_teacher_id = ? AND so.status = 'open'
         ORDER BY s.subject_code",
        [$userId]
    );
    echo json_encode(['success' => true, 'data' => $data]);
}

function getSubjectLessons($userId) {
    $subjectId = $_GET['subject_id'] ?? 0;
    if (!$subjectId) {
        echo json_encode(['success' => true, 'data' => []]);
        return;
    }
    $data = db()->fetchAll(
        "SELECT l.lessons_id, l.lesson_title FROM lessons l
         JOIN subject_offered so ON so.subject_id = l.subject_id
         WHERE l.subject_id = ? AND so.user_teacher_id = ? AND l.status = 'published'
         ORDER BY l.lesson_order",
        [$subjectId, $userId]
    );
    echo json_encode(['success' => true, 'data' => $data]);
}

/**
 * POST ?action=generate-from-module-docs
 * Body: { subject_id, module_number, gradebook_component }
 * Reads the module's already-uploaded Teaching Guide + SAS (subject_module_documents),
 * asks Groq to pull out the ACTUAL activity items belonging to the requested
 * gradebook section from the SAS, paired with the matching answer/rubric note
 * from the Teaching Guide. Returns a draft question list for the caller to
 * review/edit — nothing is saved here; saving happens via the existing
 * `save` action (extended with module_number/gradebook_component/source_doc_id).
 */
function generateFromModuleDocs(array $input): void {
    $subjectId = (int)($input['subject_id'] ?? 0);
    $moduleNum = (int)($input['module_number'] ?? 0);
    $component = $input['gradebook_component'] ?? '';
    $validComponents = ['lets_practice', 'lets_practice_optional', 'reflection', 'wrap_up_quiz'];

    if (!$subjectId || $moduleNum < 1 || $moduleNum > 14 || !in_array($component, $validComponents, true)) {
        echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
        return;
    }
    if (!canManageQuizSubject($subjectId, (int)Auth::id(), Auth::role())) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'You do not have access to this subject']);
        return;
    }

    $docs = db()->fetchAll(
        "SELECT doc_id, doc_type, file_path, original_name FROM subject_module_documents
         WHERE subject_id = ? AND module_number = ? AND doc_type IN ('sas','teaching_guide')",
        [$subjectId, $moduleNum]
    );
    $sas = null; $tg = null;
    foreach ($docs as $d) {
        if ($d['doc_type'] === 'sas') $sas = $d;
        if ($d['doc_type'] === 'teaching_guide') $tg = $d;
    }
    if (!$sas) {
        echo json_encode(['success' => false, 'message' => 'No Student Activity Sheet uploaded for this module yet']);
        return;
    }

    try {
        $sasPath = realpath(__DIR__ . '/../' . ltrim($sas['file_path'], '/'));
        $sasText = StudentListParser::extractReadableTextFromPath($sasPath, $sas['original_name']);
        $tgText = '';
        if ($tg) {
            $tgPath = realpath(__DIR__ . '/../' . ltrim($tg['file_path'], '/'));
            if ($tgPath) {
                try {
                    $tgText = StudentListParser::extractReadableTextFromPath($tgPath, $tg['original_name']);
                } catch (Exception $e) { /* TG optional — fall back to SAS-only extraction */ }
            }
        }
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage() ?: 'Could not read the uploaded document']);
        return;
    }

    $apiKey = getAiApiKey();
    if (!$apiKey) {
        echo json_encode(['success' => false, 'message' => 'Hugging Face API key not configured. Add it in Settings, or build this module\'s quiz manually.']);
        return;
    }

    $sectionLabel = [
        'lets_practice'          => "Let's Practice",
        'lets_practice_optional' => "Let's Practice (Optional)",
        'reflection'             => 'Reflection',
        'wrap_up_quiz'           => 'Wrap Up Quiz',
    ][$component];

    $prompt = buildModuleExtractionPrompt($sasText, $tgText, $sectionLabel);
    $result = callAiChatCompletion(
        'You extract real activity items from a student activity sheet and pair them with answers from a teaching guide. You respond ONLY with strict JSON — a single array, no prose, no markdown fences.',
        $prompt, 3000, 0.2, $apiKey
    );
    if (!$result['success']) {
        echo json_encode(['success' => false, 'message' => $result['error'] ?? 'AI extraction failed']);
        return;
    }

    $items = parseModuleExtractionResponse($result['text']);
    echo json_encode([
        'success' => true,
        'data' => [
            'questions'     => $items,
            'source_doc_id' => (int)$sas['doc_id'],
            'has_teaching_guide' => (bool)$tg,
        ],
    ]);
}

function buildModuleExtractionPrompt(string $sasText, string $tgText, string $sectionLabel): string {
    $tgBlock = $tgText !== ''
        ? "TEACHING GUIDE (contains the answer key / rubric notes):\n\"\"\"\n{$tgText}\n\"\"\"\n"
        : "TEACHING GUIDE: (not available — infer a reasonable model answer from the activity sheet itself)\n";

    return <<<PROMPT
You are reading a Student Activity Sheet (SAS) and its Teaching Guide for one module of a college course.

STUDENT ACTIVITY SHEET:
"""
{$sasText}
"""

{$tgBlock}

TASK: Find the actual items that belong to the "{$sectionLabel}" section of the Student Activity Sheet — do NOT invent new questions, only extract what is really written there. For each item, find the matching expected answer or grading rubric note from the Teaching Guide (or a reasonable model answer if the Teaching Guide doesn't cover it).

Return STRICT JSON only — a single JSON array, no prose before or after, no markdown fences:
[
  {
    "question": "the exact or lightly-cleaned item text",
    "type": "short_answer" | "essay" | "multiple_choice" | "true_false",
    "options": ["A", "B", "C", "D"],
    "correct_index": 0,
    "answer": "the expected answer or rubric note (for short_answer/essay/true_false)",
    "points": 1
  }
]
Only include "options"/"correct_index" for "multiple_choice" items. Omit them otherwise.
If the "{$sectionLabel}" section does not clearly exist in the activity sheet, return an empty array: []
PROMPT;
}

/** Parse the strict-JSON extraction response into saveQuiz()-compatible question rows. */
function parseModuleExtractionResponse(string $text): array {
    $text = trim($text);
    $text = preg_replace('/^```(json)?/i', '', $text);
    $text = preg_replace('/```$/', '', $text);
    $text = trim($text);

    $start = strpos($text, '[');
    $end = strrpos($text, ']');
    if ($start === false || $end === false || $end < $start) return [];
    $json = substr($text, $start, $end - $start + 1);

    $decoded = json_decode($json, true);
    if (!is_array($decoded)) return [];

    $allowedTypes = ['short_answer', 'essay', 'multiple_choice', 'true_false'];
    $items = [];
    foreach ($decoded as $raw) {
        if (!is_array($raw) || empty($raw['question'])) continue;
        $type = in_array($raw['type'] ?? '', $allowedTypes, true) ? $raw['type'] : 'short_answer';
        $item = [
            'type'     => $type,
            'question' => cleanQuestionText((string)$raw['question']),
            'points'   => max(1, min(20, (int)($raw['points'] ?? 1))),
        ];
        if ($type === 'multiple_choice' && !empty($raw['options']) && is_array($raw['options'])) {
            $item['options'] = array_map('strval', array_slice($raw['options'], 0, 8));
            $item['correct_index'] = max(0, min(count($item['options']) - 1, (int)($raw['correct_index'] ?? 0)));
        } elseif ($type === 'true_false') {
            $item['answer'] = !empty($raw['answer']) && stripos((string)$raw['answer'], 'true') !== false;
        } else {
            $item['answer'] = cleanQuestionText((string)($raw['answer'] ?? ''));
        }
        $items[] = $item;
    }
    return $items;
}

/**
 * Extract text from uploaded PDF/DOCX/DOC/TXT for AI quiz generation.
 */
function extractDocumentText() {
    try {
        if (empty($_FILES['file'])) {
            echo json_encode(['success' => false, 'message' => 'No file uploaded']);
            return;
        }

        $text = StudentListParser::extractReadableText($_FILES['file']);

        echo json_encode([
            'success' => true,
            'data' => [
                'text'   => $text,
                'length' => mb_strlen($text),
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        error_log('[AIQuizAPI.php] ' . $e->getMessage()); echo json_encode(['success' => false, 'message' => 'An internal error occurred.']);
    } catch (Exception $e) {
        error_log('AIQuiz extract-text: ' . $e->getMessage());
        echo json_encode([
            'success' => false,
            'message' => 'Could not extract text from this file. Paste your content manually instead.',
        ]);
    }
}

/**
 * Generate questions using Groq API
 */
function generateQuestions($input) {
    $text = $input['text'] ?? '';
    $numMC = (int)($input['num_mc'] ?? 5);
    $numTF = (int)($input['num_tf'] ?? 5);
    $numFIB = (int)($input['num_fib'] ?? 0);
    $numSA = (int)($input['num_sa'] ?? 0);
    $numEssay = (int)($input['num_essay'] ?? 0);
    $difficulty = $input['difficulty'] ?? 'medium';

    $apiKey = getAiApiKey();
    if (empty($apiKey)) {
        echo json_encode(['success' => false, 'error' => 'Hugging Face API key not configured. Please set it in System Settings.']);
        return;
    }
    if (empty($text)) {
        echo json_encode(['success' => false, 'error' => 'Content text is required']);
        return;
    }

    // Truncate text if too long
    $text = substr($text, 0, 8000);

    // Build the prompt for question generation
    $prompt = buildPrompt($text, $numMC, $numTF, $numFIB, $numSA, $numEssay, $difficulty);

    try {
        $response = callAiChatCompletion(
            'You are an educational quiz generator. Generate well-formatted quiz questions based on the provided content. Follow the exact format specified in the user prompt.',
            $prompt, 4000, 0.7, $apiKey
        );

        if (!$response['success']) {
            echo json_encode(['success' => false, 'error' => $response['error']]);
            return;
        }

        // Parse AI response into structured questions
        $questions = parseAIResponse($response['text'], $numMC, $numTF, $numFIB, $numSA, $numEssay);

        echo json_encode([
            'success' => true,
            'questions' => $questions
        ]);

    } catch (Exception $e) {
        error_log('[AIQuizAPI.php] ' . $e->getMessage()); echo json_encode(['success' => false, 'message' => 'An internal error occurred.']);
    }
}

/**
 * Build prompt for AI question generation
 */
function buildPrompt($text, $numMC, $numTF, $numFIB, $numSA, $numEssay, $difficulty) {
    $difficultyDesc = [
        'easy' => 'basic recall and simple understanding',
        'medium' => 'application and analysis',
        'hard' => 'critical thinking and evaluation'
    ];
    $diffLevel = $difficultyDesc[$difficulty] ?? $difficultyDesc['medium'];

    $prompt = "You are an educational quiz generator. Based on the following educational content, generate quiz questions.

CONTENT:
\"\"\"
{$text}
\"\"\"

Generate the following questions (difficulty level: {$diffLevel}):

";

    if ($numMC > 0) {
        $prompt .= "MULTIPLE CHOICE ({$numMC} questions):
Format each as:
MC[number]: [question]
A) [option]
B) [option]
C) [option]
D) [option]
ANSWER: [letter]

";
    }

    if ($numTF > 0) {
        $prompt .= "TRUE/FALSE ({$numTF} questions):
Format each as:
TF[number]: [statement]
ANSWER: [True/False]

";
    }

    if ($numFIB > 0) {
        $prompt .= "FILL IN THE BLANK ({$numFIB} questions):
Format each as:
FIB[number]: [sentence with _____ for blank]
ANSWER: [correct word/phrase]

";
    }

    if ($numSA > 0) {
        $prompt .= "SHORT ANSWER ({$numSA} questions):
Format each EXACTLY as:
SA[number]: [question requiring 1-2 sentence answer]
ANSWER: [model answer with key points expected]

";
    }

    if ($numEssay > 0) {
        $prompt .= "ESSAY ({$numEssay} questions):
Format each EXACTLY as:
ESSAY[number]: [open-ended question requiring a detailed paragraph response]
ANSWER: [model answer listing the key points and ideas expected in a good response]

";
    }

    $prompt .= "IMPORTANT: Follow the format exactly. Do not add extra labels or numbering outside the format. Generate questions now:";

    return $prompt;
}

// Question generation now calls the shared callAiChatCompletion() (see
// helpers/AiProvider.php) instead of a Groq-specific function here.


/**
 * Strip meta-text artifacts from AI-generated question text
 * e.g. "(1 questions)**", "**", trailing asterisks, numbering leftovers
 */
function cleanQuestionText($text) {
    // Remove markdown bold markers
    $text = preg_replace('/\*{1,3}/', '', $text);
    // Remove patterns like "(N questions)" or "(N question)"
    $text = preg_replace('/\(\d+\s+questions?\)/i', '', $text);
    // Remove leading/trailing punctuation artifacts
    $text = trim($text, " \t\n\r\0\x0B:-");
    return trim($text);
}

/**
 * Parse AI response into structured questions
 */
function parseAIResponse($text, $numMC, $numTF, $numFIB, $numSA, $numEssay) {
    $objective = [];
    $subjective = [];

    // Parse Multiple Choice questions
    preg_match_all('/MC\d*[:\.]?\s*(.+?)\n\s*A\)\s*(.+?)\n\s*B\)\s*(.+?)\n\s*C\)\s*(.+?)\n\s*D\)\s*(.+?)\n\s*ANSWER:\s*([A-D])/is', $text, $mcMatches, PREG_SET_ORDER);

    foreach (array_slice($mcMatches, 0, $numMC) as $match) {
        $correctIndex = ord(strtoupper(trim($match[6]))) - ord('A');
        $objective[] = [
            'type' => 'multiple_choice',
            'question' => cleanQuestionText(trim($match[1])),
            'options' => [trim($match[2]), trim($match[3]), trim($match[4]), trim($match[5])],
            'correct_index' => $correctIndex,
            'points' => 2
        ];
    }

    // Parse True/False questions
    preg_match_all('/TF\d*[:\.]?\s*(.+?)\n\s*ANSWER:\s*(True|False)/is', $text, $tfMatches, PREG_SET_ORDER);

    foreach (array_slice($tfMatches, 0, $numTF) as $match) {
        $objective[] = [
            'type' => 'true_false',
            'question' => trim($match[1]),
            'answer' => strtolower(trim($match[2])) === 'true',
            'points' => 1
        ];
    }

    // Parse Fill in the Blank questions
    preg_match_all('/FIB\d*[:\.]?\s*(.+?)\n\s*ANSWER:\s*(.+?)(?=\n|$)/is', $text, $fibMatches, PREG_SET_ORDER);

    foreach (array_slice($fibMatches, 0, $numFIB) as $match) {
        $objective[] = [
            'type' => 'fill_blank',
            'question' => trim($match[1]),
            'answer' => trim($match[2]),
            'points' => 2
        ];
    }

    // Parse Short Answer questions (with required ANSWER: field)
    preg_match_all('/SA\d*[:\.]?\s*(.+?)\n\s*ANSWER:\s*(.+?)(?=\n\s*(?:SA|ESSAY)\d|$)/is', $text, $saMatches, PREG_SET_ORDER);

    foreach (array_slice($saMatches, 0, $numSA) as $match) {
        $q = cleanQuestionText(trim($match[1]));
        $a = cleanQuestionText(trim($match[2]));
        if (empty($q)) continue;
        $subjective[] = [
            'type'     => 'short_answer',
            'question' => $q,
            'answer'   => $a,
            'points'   => 3
        ];
    }

    // Parse Essay questions (with required ANSWER: field)
    preg_match_all('/ESSAY\d*[:\.]?\s*(.+?)\n\s*ANSWER:\s*(.+?)(?=\n\s*ESSAY\d|$)/is', $text, $essayMatches, PREG_SET_ORDER);

    foreach (array_slice($essayMatches, 0, $numEssay) as $match) {
        $q = cleanQuestionText(trim($match[1]));
        $a = cleanQuestionText(trim($match[2]));
        if (empty($q)) continue;
        $subjective[] = [
            'type'     => 'essay',
            'question' => $q,
            'answer'   => $a,
            'points'   => 5
        ];
    }

    // If parsing didn't find enough questions, generate fallback questions
    $objective = fillMissingQuestions($objective, 'objective', $numMC, $numTF, $numFIB);
    $subjective = fillMissingQuestions($subjective, 'subjective', $numSA, $numEssay, 0);

    return [
        'objective' => $objective,
        'subjective' => $subjective
    ];
}

/**
 * Fill in missing questions if AI didn't generate enough
 */
function fillMissingQuestions($questions, $category, $num1, $num2, $num3) {
    $currentCount = count($questions);
    $targetCount = $num1 + $num2 + $num3;

    if ($category === 'objective') {
        // Add placeholder MC questions if needed
        while (count($questions) < $targetCount && count($questions) < $num1) {
            $questions[] = [
                'type' => 'multiple_choice',
                'question' => 'Question ' . (count($questions) + 1) . ': [Edit this question]',
                'options' => ['Option A', 'Option B', 'Option C', 'Option D'],
                'correct_index' => 0,
                'points' => 2
            ];
        }
        // Add placeholder TF questions if needed
        $tfCount = count(array_filter($questions, fn($q) => $q['type'] === 'true_false'));
        while ($tfCount < $num2) {
            $questions[] = [
                'type' => 'true_false',
                'question' => 'True/False: [Edit this statement]',
                'answer' => true,
                'points' => 1
            ];
            $tfCount++;
        }
    } else {
        // Add placeholder SA questions if needed
        $saCount = count(array_filter($questions, fn($q) => $q['type'] === 'short_answer'));
        while ($saCount < $num1) {
            $questions[] = [
                'type' => 'short_answer',
                'question' => 'Short Answer: [Edit this question]',
                'points' => 3
            ];
            $saCount++;
        }
        // Add placeholder essay questions if needed
        $essayCount = count(array_filter($questions, fn($q) => $q['type'] === 'essay'));
        while ($essayCount < $num2) {
            $questions[] = [
                'type' => 'essay',
                'question' => 'Essay: [Edit this question]',
                'points' => 5
            ];
            $essayCount++;
        }
    }

    return $questions;
}

/**
 * Save generated quiz to database
 * If quiz_id is provided, appends questions to the existing quiz instead of creating a new one.
 */
function saveQuiz($input, $userId) {
    $linkedQuizId = !empty($input['quiz_id']) ? (int)$input['quiz_id'] : null;
    $subjectId    = (int)($input['subject_id'] ?? 0);
    $lessonId     = !empty($input['lessons_id']) ? (int)$input['lessons_id'] : null;
    $quizTitle    = trim($input['quiz_title'] ?? '');
    $quizType     = $input['quiz_type'] ?? 'graded';
    $questions    = $input['questions'] ?? ['objective' => [], 'subjective' => []];

    if ($linkedQuizId) {
        // Appending to existing quiz — verify ownership
        $existing = db()->fetchOne(
            "SELECT quiz_id, subject_id FROM quiz WHERE quiz_id = ? AND user_teacher_id = ?",
            [$linkedQuizId, $userId]
        );
        if (!$existing) {
            echo json_encode(['success' => false, 'error' => 'Quiz not found or not yours']);
            return;
        }
        $subjectId = (int)$existing['subject_id'];
    } else {
        // Creating a new quiz — subject and title are required
        if (!$subjectId || !$quizTitle) {
            echo json_encode(['success' => false, 'error' => 'Subject and quiz title are required']);
            return;
        }
    }

    $allQuestions = array_merge($questions['objective'] ?? [], $questions['subjective'] ?? []);
    if (empty($allQuestions)) {
        echo json_encode(['success' => false, 'error' => 'No questions to save']);
        return;
    }

    $totalPoints = array_sum(array_map('intval', array_column($allQuestions, 'points')));

    $moduleNumber = !empty($input['module_number']) ? max(1, min(14, (int)$input['module_number'])) : null;
    $validComponents = ['lets_practice', 'lets_practice_optional', 'reflection', 'wrap_up_quiz'];
    $gradebookComponent = in_array($input['gradebook_component'] ?? '', $validComponents, true) ? $input['gradebook_component'] : null;
    $sourceDocId = !empty($input['source_doc_id']) ? (int)$input['source_doc_id'] : null;

    // DDL must run outside transactions (MySQL implicit commit)
    ensureQuizSectionTable();
    ensureQuizScheduleColumns();
    ensureQuizBehaviorColumns();
    ensureQuestionMediaColumns();
    ensureQuizModuleLinkColumns();
    fixQuestionOptionFk();

    try {
        $pdo = pdo();
        $pdo->beginTransaction();

        $sectionAfterSave = null;

        if ($linkedQuizId) {
            $quizId = $linkedQuizId;
            // Bump total_points on the existing quiz
            $pdo->prepare("UPDATE quiz SET total_points = total_points + ?, updated_at = NOW() WHERE quiz_id = ?")
                ->execute([$totalPoints, $quizId]);
        } else {
            $pub = parseQuizPublishInput($input);

            $objGrade = normalizeObjectiveGradingMode($input['objective_grading_mode'] ?? 'auto');
            $subGrade = normalizeSubjectiveGradingMode($input['subjective_grading_mode'] ?? 'ai_auto');

            // Insert new quiz
            $stmt = $pdo->prepare(
                "INSERT INTO quiz (user_teacher_id, subject_id, quiz_title, quiz_description, time_limit, passing_rate,
                 max_attempts, total_points, status, availability_start, due_date, quiz_type,
                 objective_grading_mode, subjective_grading_mode, module_number, gradebook_component, source_doc_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())"
            );
            $stmt->execute([
                $userId,
                $subjectId,
                $quizTitle,
                'Generated by AI',
                30,
                60,
                parseQuizMaxAttempts(array_merge($input, [
                    'max_attempts' => $input['max_attempts'] ?? ($quizType === 'pre_test' ? 1 : 3),
                ])),
                $totalPoints,
                $pub['status'],
                $pub['availability_start'],
                $pub['due_date'],
                $quizType,
                $objGrade,
                $subGrade,
                $moduleNumber,
                $gradebookComponent,
                $sourceDocId,
            ]);
            $quizId = $pdo->lastInsertId();

            if (!$quizId) {
                throw new Exception('Failed to create quiz');
            }

            // Link quiz to lesson via junction table (if table exists)
            if ($lessonId) {
                try {
                    $pdo->prepare("INSERT INTO quiz_lessons (quiz_id, lessons_id) VALUES (?, ?)")->execute([$quizId, $lessonId]);
                } catch (Exception $e) { /* quiz_lessons may not exist */ }
            }

            if (array_key_exists('all_sections', $input) || array_key_exists('section_ids', $input)) {
                $sectionAfterSave = [
                    'all' => !empty($input['all_sections']),
                    'ids' => array_values(array_filter(array_map('intval', $input['section_ids'] ?? []))),
                ];
            }
        }

        // Start inserting after the current last question order for this quiz
        $maxOrder = (int)(db()->fetchOne(
            "SELECT COALESCE(MAX(q.question_order), 0) AS max_order
             FROM quiz_questions qq JOIN questions q ON qq.questions_id = q.questions_id
             WHERE qq.quiz_id = ?",
            [$quizId]
        )['max_order'] ?? 0);
        $orderNum = $maxOrder + 1;

        foreach ($allQuestions as $q) {
            $questionType = mapQuestionType($q['type']);
            $mediaType    = in_array($q['media_type'] ?? '', ['image','audio','link']) ? $q['media_type'] : 'none';
            $mediaUrl     = ($mediaType !== 'none' && !empty($q['media_url'])) ? substr($q['media_url'], 0, 500) : null;
            $mediaName    = !empty($q['media_name']) ? substr($q['media_name'], 0, 200) : null;

            $stmt = $pdo->prepare("INSERT INTO questions (question_text, question_type, points, question_order, users_id, media_type, media_url, media_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$q['question'], $questionType, $q['points'] ?? 1, $orderNum, $userId, $mediaType, $mediaUrl, $mediaName]);
            $questionId = $pdo->lastInsertId();

            $pdo->prepare("INSERT INTO quiz_questions (quiz_id, questions_id) VALUES (?, ?)")
                ->execute([$quizId, $questionId]);

            if (in_array($q['type'], ['multiple_choice','dropdown']) && !empty($q['options'])) {
                foreach ($q['options'] as $idx => $optText) {
                    $isCorrect = ($idx === ($q['correct_index'] ?? 0)) ? 1 : 0;
                    $pdo->prepare("INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number) VALUES (?, ?, ?, ?)")
                        ->execute([$questionId, $optText, $isCorrect, $idx + 1]);
                }
            } elseif ($q['type'] === 'checkboxes' && !empty($q['options'])) {
                $correctSet = array_flip((array)($q['correct_indices'] ?? []));
                foreach ($q['options'] as $idx => $optText) {
                    $isCorrect = isset($correctSet[$idx]) ? 1 : 0;
                    $pdo->prepare("INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number) VALUES (?, ?, ?, ?)")
                        ->execute([$questionId, $optText, $isCorrect, $idx + 1]);
                }
            } elseif ($q['type'] === 'true_false') {
                $answer = $q['answer'] ?? true;
                $pdo->prepare("INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number) VALUES (?, 'True', ?, 1)")
                    ->execute([$questionId, $answer ? 1 : 0]);
                $pdo->prepare("INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number) VALUES (?, 'False', ?, 2)")
                    ->execute([$questionId, $answer ? 0 : 1]);
            } elseif ($q['type'] === 'fill_blank' && !empty($q['answer'])) {
                $pdo->prepare("INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number) VALUES (?, ?, 1, 1)")
                    ->execute([$questionId, $q['answer']]);
            } elseif (in_array($q['type'], ['short_answer', 'essay']) && !empty($q['answer'])) {
                $pdo->prepare("INSERT INTO question_option (quiz_question_id, option_text, is_correct, order_number) VALUES (?, ?, 1, 1)")
                    ->execute([$questionId, $q['answer']]);
            }

            $orderNum++;
        }

        if ($pdo->inTransaction()) {
            $pdo->commit();
        }

        if ($sectionAfterSave !== null) {
            applyQuizSectionTargeting(
                (int)$quizId,
                $sectionAfterSave['all'],
                $sectionAfterSave['ids']
            );
        }

        $msg = $linkedQuizId
            ? count($allQuestions) . ' questions added to your quiz successfully'
            : 'Quiz saved successfully with ' . count($allQuestions) . ' questions';

        echo json_encode([
            'success' => true,
            'quiz_id' => (int)$quizId,
            'message' => $msg
        ]);

    } catch (InvalidArgumentException $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[AIQuizAPI.php] ' . $e->getMessage()); echo json_encode(['success' => false, 'message' => 'An internal error occurred.']);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('AIQuiz save: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => 'Could not save quiz. Please try again.']);
    }
}

/**
 * Map internal question types to database types
 */
function mapQuestionType($type) {
    $map = [
        'multiple_choice' => 'multiple_choice',
        'checkboxes'      => 'checkboxes',
        'dropdown'        => 'dropdown',
        'true_false'      => 'true_false',
        'fill_blank'      => 'fill_blank',
        'short_answer'    => 'short_answer',
        'essay'           => 'essay',
    ];
    return $map[$type] ?? 'multiple_choice';
}
