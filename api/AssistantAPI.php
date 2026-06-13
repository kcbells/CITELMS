<?php
/**
 * CIT-LMS AI Assistant API — free Groq-powered study helper for all roles.
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/helpers/GroqCurl.php';
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
    $keySetting = db()->fetchOne("SELECT setting_value FROM system_settings WHERE setting_key = 'groq_api_key'");
    $hasKey = !empty($keySetting['setting_value']);
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

    $keySetting = db()->fetchOne("SELECT setting_value FROM system_settings WHERE setting_key = 'groq_api_key'");
    $apiKey = trim($keySetting['setting_value'] ?? '');
    if ($apiKey === '') {
        echo json_encode([
            'success' => false,
            'message' => 'Ali is not configured yet. Ask your administrator to add a free Groq API key in Settings.',
        ]);
        return;
    }

    $role = Auth::role();
    $user = Auth::user();
    $userId = Auth::id();
    $name = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));

    $systemPrompt = buildAssistantSystemPrompt($role, $name)
        . buildAssistantContextBlock($context, $userId, $role);

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

    $model = 'llama-3.3-70b-versatile';
    $modelSetting = db()->fetchOne("SELECT setting_value FROM system_settings WHERE setting_key = 'ai_model'");
    if ($modelSetting && !empty($modelSetting['setting_value'])) {
        $model = $modelSetting['setting_value'];
    }

    $payload = [
        'model'       => $model,
        'messages'    => $messages,
        'max_tokens'  => 1536,
        'temperature' => 0.25,
    ];

    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    $curlOpts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ],
        CURLOPT_TIMEOUT => 60,
    ];
    $curlOpts = applyGroqCurlSsl($curlOpts);
    curl_setopt_array($ch, $curlOpts);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    if ($error) {
        echo json_encode(['success' => false, 'message' => 'Connection error: ' . $error]);
        return;
    }

    $data = json_decode($response, true);

    if ($httpCode === 401) {
        echo json_encode(['success' => false, 'message' => 'Invalid Groq API key. Please update it in Admin Settings.']);
        return;
    }

    if ($httpCode === 429) {
        echo json_encode(['success' => false, 'message' => 'AI is busy right now. Please wait a moment and try again.']);
        return;
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        $errMsg = $data['error']['message'] ?? ('Groq API error (HTTP ' . $httpCode . ')');
        echo json_encode(['success' => false, 'message' => $errMsg]);
        return;
    }

    $reply = trim($data['choices'][0]['message']['content'] ?? '');
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
    $base = 'You are Ali, the CIT-LMS AI study assistant — a helpful and friendly tutor for a college learning management system. '
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
            . 'When they ask about "lesson one" or the current lesson, use the CONTEXT lesson material. '
            . 'Explain step by step when teaching. Encourage learning rather than giving away answers to graded work.';
    }

    if ($role === 'instructor') {
        return $base . ' The user is an instructor'
            . ($name ? " named {$name}" : '')
            . '. Help with teaching ideas, quiz design, rubrics, lesson planning, and explaining topics to students.';
    }

    if ($role === 'dean') {
        return $base . ' The user is a dean'
            . ($name ? " named {$name}" : '')
            . '. Help with academic administration, curriculum planning, faculty coordination, and reporting insights.';
    }

    return $base . ' The user is an administrator'
        . ($name ? " named {$name}" : '')
        . '. Help with system usage, academic setup, and operational questions about the LMS.';
}
