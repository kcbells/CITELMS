<?php
/**
 * Content filter — blocks curse words (English, Tagalog, Bisaya) in anything a
 * user types, and nude / sexual photos in anything a user uploads.
 *
 * Every API that saves user text calls contentFilterReject() before saving.
 * When it finds something, the request is answered with
 *     { success:false, blocked:true, message:"..." }
 * and app/js/api.js turns that into the "Not allowed" popup, so no page needs
 * its own handling.
 */

/**
 * Words matched as whole words only, after the text is normalised (lowercase,
 * leetspeak undone, repeated letters collapsed). Whole-word matching keeps
 * normal words safe: "putahe" is not "puta", "class" is not "ass".
 */
function contentFilterWords(): array
{
    return [
        // English
        'fuck', 'fucker', 'fucking', 'fucked', 'fvck', 'fuq', 'phuck', 'fak', 'fakyu', 'fakyou', 'fck', 'fk', 'fuk', 'fuking', 'wtf', 'stfu', 'motherfucker', 'mf',
        'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'biatch', 'asshole', 'ashole', 'bastard', 'dick', 'dickhead',
        'pussy', 'cunt', 'cock', 'slut', 'whore', 'hoe', 'nigga', 'nigger', 'retard', 'retarded', 'porn', 'porno',
        'jerkoff', 'dumbass', 'jackass', 'boobs', 'tits', 'penis', 'vagina', 'sex', 'sexy', 'horny', 'nude', 'nudes',
        // Tagalog
        'putangina', 'putanginamo', 'putang', 'utangina', 'utanginamo', 'tangenamo', 'tangena', 'potangina', 'pota', 'potah', 'putcha', 'puchang', 'tangina', 'tanginamo', 'tangna', 'kingina', 'kinginamo', 'inamo',
        'puta', 'gago', 'gaga', 'gagu', 'gagi', 'ulol', 'ulul', 'olol', 'tarantado', 'tarantada', 'bobo', 'boba',
        'tanga', 'engot', 'inutil', 'lintik', 'leche', 'letse', 'punyeta', 'pakyu', 'pakyo', 'pakshet', 'pakshit',
        'kupal', 'pokpok', 'kantot', 'kantutan', 'jakol', 'bayag', 'titi', 'puke', 'pekpek', 'burat', 'hindot',
        'amputa', 'putragis', 'shunga', 'hayop', 'hinayupak', 'bwisit', 'buwisit', 'syet', 'shet', 'yudipota',
        // Bisaya / Cebuano
        'yawa', 'yawaa', 'yati', 'pisti', 'piste', 'peste', 'buang', 'boang', 'bogo', 'bilat', 'oten', 'otin',
        'iyot', 'giatay', 'giyatay', 'atay', 'animal', 'pakyas', 'bayot', 'libog', 'bitin', 'lubot', 'pisot',
    ];
}

/**
 * Phrases that are only curses as a whole ("hayop ka", "anak ng puta").
 * Checked against the normalised text with spaces kept.
 */
function contentFilterPhrases(): array
{
    return [
        'putang ina', 'puta ng ina', 'tang ina', 'king ina', 'anak ng puta', 'anak ka ng puta',
        'hayop ka', 'animal ka', 'yawa ka', 'buang ka', 'gago ka', 'bobo ka', 'tanga ka',
        'son of a bitch', 'go to hell', 'f u',
    ];
}

/**
 * Words above that are also ordinary words in some sentences, so they are only
 * blocked when used AT someone ("animal ka", "atay ka") or on their own.
 */
function contentFilterSoftWords(): array
{
    // "atay" = liver, "animal" = animal, "hayop" = animal, "sex" in biology,
    // "leche" in "leche flan" — allowed inside a normal sentence.
    return ['atay', 'animal', 'hayop', 'sex', 'leche', 'bitin', 'hoe', 'cock', 'penis', 'vagina', 'bogo', 'peste', 'mf', 'fk'];
}

/** Lowercase, undo leetspeak, and squeeze "yawaaaa" down to "yawa". */
function contentFilterNormalise(string $text): string
{
    $t = mb_strtolower($text, 'UTF-8');
    // accented letters -> plain
    $t = strtr($t, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e',
                    'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'ö' => 'o',
                    'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ñ' => 'n']);
    // leetspeak: only inside words, so "100" stays a number
    $t = preg_replace_callback('/[a-z0-9@$!|*]+/', function ($m) {
        $w = $m[0];
        if (!preg_match('/[a-z]/', $w)) return $w;
        return strtr($w, ['4' => 'a', '@' => 'a', '3' => 'e', '1' => 'i', '!' => 'i', '|' => 'i',
                          '0' => 'o', '5' => 's', '$' => 's', '7' => 't', '*' => '']);
    }, $t);
    // "f.u.c.k" / "f u c k" / "y-a-w-a" -> join runs of single letters
    $t = preg_replace_callback('/\b(?:[a-z][\s.\-_*]+){2,}[a-z]\b/', fn($m) => preg_replace('/[^a-z]/', '', $m[0]), $t);
    // three or more of the same letter -> one ("yawaaaa" -> "yawa", "fuuuck" -> "fuck")
    $t = preg_replace('/([a-z])\1{2,}/', '$1', $t);
    // everything that is not a letter becomes a single space
    $t = preg_replace('/[^a-z]+/', ' ', $t);
    return trim($t);
}

/**
 * Returns the first bad word found, or null when the text is clean.
 */
function contentFilterFind(?string $text): ?string
{
    $text = (string)$text;
    if (trim($text) === '') return null;

    $norm = contentFilterNormalise($text);
    if ($norm === '') return null;
    $padded = ' ' . $norm . ' ';

    foreach (contentFilterPhrases() as $p) {
        if (strpos($padded, ' ' . $p . ' ') !== false) return $p;
    }

    $words = explode(' ', $norm);
    $bad   = array_flip(contentFilterWords());
    $soft  = array_flip(contentFilterSoftWords());
    $count = count($words);

    foreach ($words as $i => $w) {
        // also try the word with doubled letters squeezed ("gaggo" -> "gago")
        $squeezed = preg_replace('/([a-z])\1+/', '$1', $w);
        $hit = isset($bad[$w]) ? $w : (isset($bad[$squeezed]) ? $squeezed : null);

        // words that start with a strong root: "fuckboy", "putanginamoka", "yawaa"
        if ($hit === null) {
            foreach (['fuck', 'fvck', 'motherf', 'putangin', 'utangin', 'potangin', 'tangin', 'kingin', 'bullshit', 'yawa', 'pakyu', 'pakshe', 'bitch'] as $root) {
                if (strpos($w, $root) === 0) { $hit = $root; break; }
            }
        }
        if ($hit === null) continue;

        if (isset($soft[$hit])) {
            // allowed inside a normal sentence; blocked when it is the whole
            // message or aimed at someone ("atay ka", "animal ka")
            $next = $words[$i + 1] ?? '';
            if ($hit === 'leche' && $next === 'flan') continue;
            if ($count > 1 && !in_array($next, ['ka', 'mo', 'kayo', 'ta', 'ni', 'ya'], true)) continue;
        }
        return $hit;
    }
    return null;
}

/** Replaces every bad word with asterisks — used where the text cannot be sent back to fix. */
function contentFilterMask(string $text): string
{
    $out = $text;
    for ($guard = 0; $guard < 20; $guard++) {
        $hit = contentFilterFind($out);
        if ($hit === null) break;
        // mask the original word the normalised hit came from (best effort)
        $pattern = '/' . implode('[\W_]*', array_map(fn($c) => preg_quote($c, '/') . '+', str_split(str_replace(' ', '', $hit)))) . '/iu';
        $new = preg_replace($pattern, str_repeat('*', max(3, strlen($hit))), $out, 1);
        if ($new === null || $new === $out) break;
        $out = $new;
    }
    return $out;
}

/**
 * Stops the request if $text contains a bad word. Call before saving.
 * Returns true when the request was stopped (the caller should `return`).
 */
function contentFilterReject(?string ...$texts): bool
{
    foreach ($texts as $text) {
        if (contentFilterFind($text) !== null) {
            contentFilterSendBlocked('profanity');
            return true;
        }
    }
    return false;
}

/** The one blocked response every API uses. */
function contentFilterSendBlocked(string $reason, string $message = ''): void
{
    if ($message === '') {
        $message = $reason === 'image'
            ? 'This photo is not allowed. Photos with nudity or sexual content cannot be sent.'
            : 'Your message has words that are not allowed. Please remove bad words and try again.';
    }
    if (!headers_sent()) {
        http_response_code(422);
        header('Content-Type: application/json');
    }
    // Log it so admins can see who tried (activity log is optional here)
    if (function_exists('recordActivity') && class_exists('Auth')) {
        recordActivity(Auth::id(), 'content_blocked', $reason === 'image' ? 'Tried to upload a photo that was blocked' : 'Tried to send text with bad words');
    }
    echo json_encode(['success' => false, 'blocked' => true, 'reason' => $reason, 'message' => $message]);
}

// ─── Photos ──────────────────────────────────────────────────────────────────

/**
 * Checks an uploaded image with a Hugging Face nudity detector.
 * Returns true when the image is NOT allowed.
 *
 * If the checker cannot be reached (no key, no internet), the photo is let
 * through and the failure is logged — blocking every photo whenever the AI
 * service hiccups would break messaging for everyone.
 */
function contentFilterImageIsUnsafe(string $filePath): bool
{
    $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'], true)) {
        // uploaded tmp files have no extension: sniff the bytes instead
        $head = @file_get_contents($filePath, false, null, 0, 16);
        if ($head === false || !preg_match('/^(\xFF\xD8\xFF|\x89PNG|GIF8|RIFF.{4}WEBP|BM)/s', $head)) return false;
    }

    require_once __DIR__ . '/AiProvider.php';
    $key = getAiApiKey();
    if ($key === '') {
        error_log('ContentFilter: no Hugging Face key, photo not checked');
        return false;
    }

    $bytes = @file_get_contents($filePath);
    if ($bytes === false || $bytes === '') return false;

    $models = ['Falconsai/nsfw_image_detection'];
    foreach ($models as $model) {
        $ch = curl_init('https://router.huggingface.co/hf-inference/models/' . $model);
        curl_setopt_array($ch, applyGroqCurlSsl([
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $bytes,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $key, 'Content-Type: application/octet-stream'],
            CURLOPT_TIMEOUT        => 25,
            CURLOPT_CONNECTTIMEOUT => 8,
        ]));
        $res  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        unset($ch);

        $data = json_decode((string)$res, true);
        if ($code !== 200 || !is_array($data)) {
            error_log("ContentFilter: image check failed ($model, HTTP $code): " . substr((string)$res, 0, 200));
            continue;
        }
        foreach ($data as $row) {
            if (!is_array($row)) continue;
            $label = strtolower((string)($row['label'] ?? ''));
            $score = (float)($row['score'] ?? 0);
            if (in_array($label, ['nsfw', 'porn', 'sexy', 'hentai', 'explicit'], true) && $score >= 0.6) {
                return true;
            }
        }
        return false;
    }
    return false;
}
