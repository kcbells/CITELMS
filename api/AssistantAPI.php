<?php
/**
 * CIT-LMS AI Assistant API — free Hugging Face-powered study helper for all roles.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/GroqCurl.php';
require_once __DIR__ . '/helpers/AiProvider.php';
require_once __DIR__ . '/helpers/QuizProctorHelper.php';
require_once __DIR__ . '/helpers/AssistantContextHelper.php';

header('Content-Type: application/json');
ini_set('display_errors', '0');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'chat':
        chat();
        break;
    case 'status':
        assistantStatus();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function assistantStatus() {
    $hasKey = getAiApiKey() !== '';
    echo json_encode([
        'success' => true,
        'data' => [
            'available' => $hasKey,
            'blocked'   => Auth::role() === 'student' && isQuizProctorLocked(),
        ],
    ]);
}

function chat() {
    if (Auth::role() === 'student' && isQuizProctorLocked()) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'message' => 'Ali is disabled while you are taking a graded quiz.',
            'blocked' => true,
        ]);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $message = trim((string)($input['message'] ?? ''));
    $history = $input['history'] ?? [];
    $context = is_array($input['context'] ?? null) ? $input['context'] : [];

    if ($message === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Message is required']);
        return;
    }

    if (mb_strlen($message) > 2000) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Message is too long (max 2000 characters)']);
        return;
    }

    $safetyRefusal = assistantSafetyCheck($message);
    if ($safetyRefusal !== null) {
        echo json_encode([
            'success' => true,
            'data'    => ['reply' => $safetyRefusal, 'safety_blocked' => true],
        ]);
        return;
    }

    $apiKey = trim(getAiApiKey());
    if ($apiKey === '') {
        echo json_encode([
            'success' => false,
            'message' => 'Ali is not configured yet. Ask your administrator to add a free Hugging Face API key in Settings.',
        ]);
        return;
    }

    $role = Auth::role();
    $user = Auth::user();
    $userId = Auth::id();
    $name = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));

    $systemPrompt = buildAssistantSystemPrompt($role, $name)
        . buildAssistantContextBlock($context, $userId, $role, $message);

    $messages = [['role' => 'system', 'content' => $systemPrompt]];

    if (is_array($history)) {
        $turns = 0;
        foreach (array_slice($history, -10) as $turn) {
            if (!is_array($turn)) continue;
            $r = $turn['role'] ?? '';
            $c = trim((string)($turn['content'] ?? ''));
            if (!in_array($r, ['user', 'assistant'], true) || $c === '') continue;
            $messages[] = ['role' => $r, 'content' => mb_substr($c, 0, 1500)];
            $turns++;
            if ($turns >= 10) break;
        }
    }

    $messages[] = ['role' => 'user', 'content' => $message];

    $result = callAiChatCompletionWithMessages($messages, 1536, 0.25, $apiKey);
    if (!$result['success']) {
        echo json_encode(['success' => false, 'message' => $result['error'] ?? 'AI request failed. Please try again.']);
        return;
    }

    $reply = trim($result['text'] ?? '');
    if ($reply === '') {
        echo json_encode(['success' => false, 'message' => 'No response from AI. Please try again.']);
        return;
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'reply' => $reply,
        ],
    ]);
}

function buildAssistantSystemPrompt(string $role, string $name): string {
    $base = 'You are Ali, the Phinmaed Learning AI study assistant — a helpful and friendly tutor for a college learning management system. '
        . 'Keep answers clear, accurate, and well-structured. Use simple language. '
        . 'Base explanations on the lesson content provided in context when available — do not guess or invent facts. '
        . 'If the lesson does not cover something, say so honestly and suggest asking the instructor. '
        . 'Never help with cheating: do not answer active quiz or exam questions directly, and refuse requests to bypass academic integrity rules. '
        . 'REFUSE and do not engage with: hacking, database/security exploits, violence, weapons, illegal activity, or anything harmful. '
        . 'Politely decline those topics and redirect to coursework.';

    if ($role === 'student') {
        return $base . ' The user is a student'
            . ($name ? " named {$name}" : '')
            . '. Help them understand lessons, summarize lesson content, explain highlighted passages, and clarify concepts. '
            . 'When they ask about "lesson one", "this lesson", "the lesson", or the current lesson, use the CONTEXT lesson material provided. '
            . 'When a student asks to "digest", "summarize", or "help me understand" a lesson, provide a structured breakdown: '
            . '(1) a 2-3 sentence overview, (2) the key concepts as a numbered list, (3) important terms with brief definitions if any, (4) a "What to remember" closing point. '
            . 'Use simple language and short paragraphs. Explain step by step when teaching. '
            . 'Encourage learning rather than giving away answers to graded work.';
    }

    $dataNote = ' The CONTEXT below always includes a "CLASS SNAPSHOT DATA" section, and may also include '
        . '"STRUGGLING STUDENTS DATA", "PERFORMANCE REPORT DATA", "ATTENDANCE DATA", or "INDIVIDUAL STUDENT DATA" '
        . '(when the message names one specific enrolled student) — all of it is real, live data '
        . 'pulled from this LMS for THIS question, not an example or a guess. When the user asks something a section '
        . 'above already answers (how many/who/what score/how many absences), state the exact number or name directly '
        . 'in your first sentence — do NOT reply with generic instructions like "log in and navigate to Reports" or '
        . '"check the Analytics section"; you already have the answer, so give it. Only fall back to pointing at a '
        . 'Reports page for something genuinely not covered by any data section above, and say plainly that this '
        . 'specific figure isn\'t available to you rather than making one up.';

    if ($role === 'instructor') {
        return $base . ' The user is an instructor'
            . ($name ? " named {$name}" : '')
            . '. Help with teaching ideas, quiz design, rubrics, lesson planning, explaining topics to students, '
            . 'and identifying which of their students are struggling or at risk when asked.' . $dataNote;
    }

    if ($role === 'dean') {
        return $base . ' The user is a dean'
            . ($name ? " named {$name}" : '')
            . '. Help with academic administration, curriculum planning, faculty coordination, and reporting insights — '
            . 'including real performance/pass-rate reports and struggling-student summaries for their department when asked.' . $dataNote;
    }

    if ($role === 'program_head') {
        return $base . ' The user is a program head'
            . ($name ? " named {$name}" : '')
            . '. Help with academic oversight of their program — curriculum, faculty coordination, and reporting insights — '
            . 'including real performance/pass-rate reports and struggling-student summaries for their program when asked.' . $dataNote;
    }

    return $base . ' The user is an administrator'
        . ($name ? " named {$name}" : '')
        . '. Help with system usage, academic setup, and operational questions about the LMS, '
        . 'including real system-wide performance and struggling-student data when asked.' . $dataNote;
}
