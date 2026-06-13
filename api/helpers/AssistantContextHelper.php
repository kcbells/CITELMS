<?php
/**
 * Ali assistant — lesson context, safety filter, prompt building.
 */

function stripHtmlForAssistant(string $html): string {
    $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\s+/u', ' ', $text) ?? $text;
    return trim($text);
}

function truncateAssistantText(string $text, int $max = 12000): string {
    if (mb_strlen($text) <= $max) {
        return $text;
    }
    return mb_substr($text, 0, $max) . '… [truncated]';
}

/**
 * Block harmful, security, or academic-integrity violations before calling the AI.
 * Returns a user-facing refusal message, or null if allowed.
 */
function assistantSafetyCheck(string $message): ?string {
    $m = mb_strtolower($message);

    $patterns = [
        '/\b(hack|hacking|cracker|cracking|exploit|ddos|malware|ransomware|keylogger|phishing)\b/u',
        '/\b(sql\s*inject|inject\s*sql|bypass\s*(auth|login|security)|steal\s*(password|credential)|database\s*password|admin\s*password|api\s*key\s*leak)\b/u',
        '/\b(kill|murder|assassin|bomb|weapon|terror|suicide|self[\s-]?harm)\b/u',
        '/\b(how\s+to\s+(make|build)\s+(a\s+)?(bomb|weapon|drug))\b/u',
        '/\b(give\s+me\s+(all\s+)?(the\s+)?quiz\s+answers|answer\s+(this|the)\s+quiz\s+for\s+me|cheat\s+on\s+(the\s+)?(quiz|exam|test))\b/u',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $m)) {
            return 'I can\'t help with that request. I\'m here to help you learn your coursework safely — ask me to explain a lesson, summarize a topic, or clarify something you highlighted.';
        }
    }

    return null;
}

/**
 * Load lesson material the student is allowed to see (enrollment-checked).
 */
function loadLessonContextForAssistant(int $lessonId, int $userId): ?array {
    if ($lessonId < 1) {
        return null;
    }

    $lesson = db()->fetchOne(
        "SELECT l.lessons_id, l.lesson_title, l.lesson_description, l.lesson_content,
                l.lesson_order, l.learning_objectives, l.subject_id,
                s.subject_code, s.subject_name
         FROM lessons l
         JOIN subject s ON s.subject_id = l.subject_id
         WHERE l.lessons_id = ? AND l.status = 'published'",
        [$lessonId]
    );

    if (!$lesson) {
        return null;
    }

    $enrollment = db()->fetchOne(
        "SELECT ss.student_subject_id FROM student_subject ss
         JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
         WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'
         LIMIT 1",
        [$userId, $lesson['subject_id']]
    );

    if (!$enrollment && Auth::role() === 'student') {
        return null;
    }

    $materials = db()->fetchAll(
        "SELECT original_name, material_type, file_type
         FROM lesson_materials WHERE lessons_id = ?
         ORDER BY material_id ASC LIMIT 20",
        [$lessonId]
    );

    $content = stripHtmlForAssistant((string)($lesson['lesson_content'] ?? ''));
    $description = stripHtmlForAssistant((string)($lesson['lesson_description'] ?? ''));
    $objectives = stripHtmlForAssistant((string)($lesson['learning_objectives'] ?? ''));

    return [
        'lessons_id'    => (int)$lesson['lessons_id'],
        'lesson_title'  => (string)$lesson['lesson_title'],
        'lesson_order'  => (int)($lesson['lesson_order'] ?? 0),
        'subject_code'  => (string)$lesson['subject_code'],
        'subject_name'  => (string)$lesson['subject_name'],
        'description'   => $description,
        'objectives'    => $objectives,
        'content'       => truncateAssistantText($content, 10000),
        'materials'     => array_map(fn($r) => [
            'name' => $r['original_name'] ?? '',
            'type' => $r['material_type'] ?? '',
        ], $materials),
    ];
}

function loadQuizContextForAssistant(int $quizId, int $userId): ?array {
    if ($quizId < 1) {
        return null;
    }

    require_once __DIR__ . '/QuizSectionHelper.php';

    $quiz = db()->fetchOne(
        "SELECT q.quiz_id, q.quiz_title, q.quiz_description, q.subject_id,
                s.subject_code, s.subject_name
         FROM quiz q
         JOIN subject s ON s.subject_id = q.subject_id
         WHERE q.quiz_id = ? AND " . quizPublishedSql('q'),
        [$quizId]
    );

    if (!$quiz) {
        return null;
    }

    if (Auth::role() === 'student') {
        $enrollment = db()->fetchOne(
            "SELECT ss.student_subject_id FROM student_subject ss
             JOIN subject_offered so ON so.subject_offered_id = ss.subject_offered_id
             WHERE ss.user_student_id = ? AND so.subject_id = ? AND ss.status = 'enrolled'
             LIMIT 1",
            [$userId, $quiz['subject_id']]
        );
        if (!$enrollment) {
            return null;
        }
    }

    return [
        'quiz_id'          => (int)$quiz['quiz_id'],
        'quiz_title'       => (string)$quiz['quiz_title'],
        'quiz_description' => stripHtmlForAssistant((string)($quiz['quiz_description'] ?? '')),
        'subject_code'     => (string)$quiz['subject_code'],
        'subject_name'     => (string)$quiz['subject_name'],
    ];
}

/**
 * Append current-page context to the system prompt.
 */
function buildAssistantContextBlock(array $context, int $userId, string $role): string {
    $parts = [];

    $page = trim((string)($context['page'] ?? ''));
    if ($page !== '') {
        $parts[] = "Current LMS page context: {$page}.";
    }

    $subjectName = trim((string)($context['subject_name'] ?? ''));
    $subjectCode = trim((string)($context['subject_code'] ?? ''));
    if ($subjectName !== '') {
        $parts[] = 'Subject: ' . ($subjectCode ? "{$subjectCode} — {$subjectName}" : $subjectName) . '.';
    }

    $workTitle = trim((string)($context['work_title'] ?? ''));
    if ($workTitle !== '') {
        $parts[] = "Assignment / activity title: \"{$workTitle}\".";
    }

    $lessonId = (int)($context['lessons_id'] ?? 0);
    if ($lessonId > 0) {
        $lesson = loadLessonContextForAssistant($lessonId, $userId);
        if ($lesson) {
            $order = $lesson['lesson_order'] > 0 ? " (Lesson #{$lesson['lesson_order']})" : '';
            $parts[] = "The student is studying{$order}: \"{$lesson['lesson_title']}\".";
            if ($lesson['description'] !== '') {
                $parts[] = "Lesson overview: {$lesson['description']}";
            }
            if ($lesson['objectives'] !== '') {
                $parts[] = "Learning objectives: {$lesson['objectives']}";
            }
            if ($lesson['content'] !== '') {
                $parts[] = "FULL LESSON CONTENT (base your explanations on this — do not invent facts not supported here):\n---\n{$lesson['content']}\n---";
            }
            if (!empty($lesson['materials'])) {
                $names = array_filter(array_column($lesson['materials'], 'name'));
                if ($names) {
                    $parts[] = 'Attached materials: ' . implode(', ', array_slice($names, 0, 10)) . '.';
                }
            }
            $parts[] = 'When the student asks to explain or summarize this lesson, use the lesson content above. Be accurate and educational.';
        }
    }

    $quizId = (int)($context['quiz_id'] ?? 0);
    if ($quizId > 0 && $lessonId <= 0) {
        $quiz = loadQuizContextForAssistant($quizId, $userId);
        if ($quiz) {
            $parts[] = "The student is viewing quiz/assessment: \"{$quiz['quiz_title']}\".";
            if ($quiz['quiz_description'] !== '') {
                $parts[] = "Quiz description: {$quiz['quiz_description']}";
            }
            if ($role === 'student') {
                $parts[] = 'Do NOT provide direct answers to active quiz questions. Help with concepts and study strategies only.';
            }
        }
    }

    $highlight = trim((string)($context['highlighted_text'] ?? ''));
    if ($highlight !== '') {
        $highlight = truncateAssistantText($highlight, 1500);
        $parts[] = "The student HIGHLIGHTED this passage from the lesson and may ask about it:\n\"{$highlight}\"\nExplain this passage clearly using the lesson content.";
    }

    if (empty($parts)) {
        return '';
    }

    return "\n\n--- STUDENT CONTEXT (use this to personalize your answer) ---\n"
        . implode("\n", $parts)
        . "\n--- END CONTEXT ---\n"
        . 'Prioritize factual accuracy from the lesson content. If unsure, say what the lesson states and suggest asking the instructor.';
}
