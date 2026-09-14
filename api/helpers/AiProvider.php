<?php
/**
 * Shared AI provider helper — Hugging Face Inference Providers' OpenAI-
 * compatible chat-completions router (https://router.huggingface.co/v1/chat/completions).
 *
 * Switched from Groq (per adviser's advice + the stored Groq key having gone
 * invalid) — every caller (AIQuizAPI.php's quiz generation + the SAS/Teaching
 * Guide module-quiz extraction, QuizAttemptsAPI.php's AI answer grading,
 * AssistantAPI.php's chat assistant) now goes through this one function
 * instead of duplicating its own curl call, so there's a single place to
 * change provider/model/auth again in the future.
 *
 * The router speaks the same request/response shape Groq did (OpenAI chat
 * completions: {model, messages, max_tokens, temperature} in, {choices[0].
 * message.content} out), so every existing prompt/parsing call site needed
 * no changes beyond swapping which function builds the HTTP call.
 */
require_once __DIR__ . '/GroqCurl.php'; // applyGroqCurlSsl() — a generic "skip cert verification on local XAMPP,
                                         // else use the bundled CA file" helper; not actually Groq-specific, reused as-is.

const AI_DEFAULT_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';

/**
 * Request budgets, in seconds. Both sit below PHP's max_execution_time (120)
 * on purpose — see callAiChatCompletion()'s doc comment. Anything at or above
 * that limit makes PHP kill the script mid-call and return an HTML fatal
 * instead of a JSON error the UI can actually show.
 */
const AI_TIMEOUT_INTERACTIVE = 45;  // chat assistant — a person is waiting
const AI_TIMEOUT_LONGFORM    = 100; // reviewer / quiz generation — big output, worth the wait

/** Hugging Face access token — system_settings.hf_api_key, or HF_API_KEY env var. */
function getAiApiKey(): string {
    $envKey = getenv('HF_API_KEY') ?: '';
    if ($envKey !== '') return $envKey;
    $row = db()->fetchOne("SELECT setting_value FROM system_settings WHERE setting_key = 'hf_api_key'");
    return $row['setting_value'] ?? '';
}

/** Which chat model to call — system_settings.ai_model, else the default above. */
function getAiModel(): string {
    $row = db()->fetchOne("SELECT setting_value FROM system_settings WHERE setting_key = 'ai_model'");
    return !empty($row['setting_value']) ? $row['setting_value'] : AI_DEFAULT_MODEL;
}

/**
 * One chat-completion call. Returns ['success'=>true,'text'=>...] or
 * ['success'=>false,'error'=>...] — the exact shape every caller already
 * expected from the old callGroqAPI()/inline-curl code.
 */
/**
 * @param int $timeout Seconds to wait for the model. MUST stay below PHP's
 *   max_execution_time (120s here): if cURL is allowed to run that long, PHP
 *   kills the script first and the caller gets an HTML fatal-error page
 *   instead of JSON — which is exactly how the assistant ended up looking
 *   "unresponsive" for two minutes. Interactive chat should use the short
 *   default; long-form generation can pass a larger value.
 */
function callAiChatCompletion(string $systemMessage, string $userPrompt, int $maxTokens = 2000, float $temperature = 0.3, ?string $apiKeyOverride = null, int $timeout = AI_TIMEOUT_INTERACTIVE): array {
    return callAiChatCompletionWithMessages(
        [
            ['role' => 'system', 'content' => $systemMessage],
            ['role' => 'user', 'content' => $userPrompt],
        ],
        $maxTokens, $temperature, $apiKeyOverride, $timeout
    );
}

/** Same as callAiChatCompletion() but takes a full messages array (e.g. with conversation history) instead of a single system+user pair. */
function callAiChatCompletionWithMessages(array $messages, int $maxTokens = 2000, float $temperature = 0.3, ?string $apiKeyOverride = null, int $timeout = AI_TIMEOUT_INTERACTIVE): array {
    $apiKey = $apiKeyOverride ?? getAiApiKey();
    if (empty($apiKey)) {
        return ['success' => false, 'error' => 'Hugging Face API key not configured. Add a free access token in System Settings (huggingface.co/settings/tokens).'];
    }

    $payload = [
        'model' => getAiModel(),
        'messages' => $messages,
        'max_tokens' => $maxTokens,
        'temperature' => $temperature,
    ];

    // JSON_INVALID_UTF8_SUBSTITUTE matters here: without it, json_encode()
    // silently returns false the moment any message content contains a
    // stray invalid UTF-8 byte (common from crude PDF/DOCX text extraction,
    // e.g. StudentListParser's regex-based PDF reader doesn't sanitize its
    // output). CURLOPT_POSTFIELDS would then get set to `false`, which
    // libcurl sends as an effectively empty body — the router sees no
    // `model` field at all and reports it as invalid, which is meaningless
    // to whoever's staring at the error in the quiz builder.
    $body = json_encode($payload, JSON_INVALID_UTF8_SUBSTITUTE);
    if ($body === false) {
        error_log('AiProvider: json_encode failed even with JSON_INVALID_UTF8_SUBSTITUTE: ' . json_last_error_msg());
        return ['success' => false, 'error' => 'Could not prepare the request (the source document may contain unreadable characters). Please try again or edit the document.'];
    }

    $ch = curl_init('https://router.huggingface.co/v1/chat/completions');
    $curlOpts = applyGroqCurlSsl([
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ],
        CURLOPT_TIMEOUT => $timeout,
        // Give up early if the provider never even starts responding, rather
        // than burning the whole budget on a dead connection.
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    curl_setopt_array($ch, $curlOpts);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    unset($ch); // curl_close() deprecated in PHP 8.5 — let the destructor handle it

    if ($error) {
        // curl's raw error text ("Could not resolve host: router.huggingface.co",
        // timeouts, TLS handshake failures, ...) is meaningless to an
        // instructor/dean — it almost always means the SERVER's own internet/
        // DNS dropped for a moment, not anything wrong with their request.
        // Log the real error for diagnosis, surface a plain-language one.
        error_log('AiProvider connection error: ' . $error);
        return ['success' => false, 'error' => 'Ali couldn\'t reach the AI service just now — this is usually a brief network hiccup on the server, not something wrong with your question. Please try again in a moment.'];
    }

    $data = json_decode($response, true);

    if ($httpCode === 401) {
        return ['success' => false, 'error' => 'Invalid Hugging Face API key. Please check it in System Settings.'];
    }
    if ($httpCode === 429) {
        return ['success' => false, 'error' => 'Rate limit exceeded. Please wait a moment and try again.'];
    }
    if ($httpCode !== 200) {
        $errorMsg = $data['error']['message'] ?? $data['error'] ?? 'Unknown API error (HTTP ' . $httpCode . ')';
        return ['success' => false, 'error' => is_string($errorMsg) ? $errorMsg : 'Unknown API error (HTTP ' . $httpCode . ')'];
    }

    if (isset($data['choices'][0]['message']['content'])) {
        return ['success' => true, 'text' => $data['choices'][0]['message']['content']];
    }

    return ['success' => false, 'error' => 'Unexpected API response format'];
}
