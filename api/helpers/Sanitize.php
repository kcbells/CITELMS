<?php
/**
 * Shared input sanitization — strips HTML/script tags from free-text user
 * input before it's stored, so stored XSS can't happen even if a future
 * render path forgets to escape on output.
 */
class Sanitize {
    public static function text(?string $value): string {
        $value = (string)($value ?? '');
        $value = strip_tags($value);
        return trim($value);
    }

    /** Sanitize every string value in an associative array, leaving other types untouched. */
    public static function fields(array $data, array $keys): array {
        foreach ($keys as $key) {
            if (isset($data[$key]) && is_string($data[$key])) {
                $data[$key] = self::text($data[$key]);
            }
        }
        return $data;
    }

    /**
     * System-wide name-casing standard: names are stored/displayed in Title
     * Case, never ALL CAPS — the most common source of all-caps names is
     * ALL-CAPS source documents (class density reports, PDFs, OCR text)
     * flowing straight through Bulk Import, plus users who type their name
     * with caps lock on. Every name field written to `users` (create/update,
     * self-signup, bulk import) should be passed through this before it's
     * saved, so the fix lives in one place instead of on every render call.
     */
    public static function properName(?string $value): string {
        $value = self::text($value);
        if ($value === '') return $value;

        $romanSuffixes = ['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

        $title = mb_convert_case(mb_strtolower($value, 'UTF-8'), MB_CASE_TITLE, 'UTF-8');

        // Roman-numeral suffixes: "Iii" -> "III" (whole word only).
        $title = preg_replace_callback(
            '/\b([a-z]{1,4})\b/iu',
            function ($m) use ($romanSuffixes) {
                return in_array(mb_strtolower($m[1]), $romanSuffixes, true) ? mb_strtoupper($m[1]) : $m[1];
            },
            $title
        );

        // Apostrophe names: "O'brien" -> "O'Brien".
        $title = preg_replace_callback("/'(\p{L})/u", function ($m) { return "'" . mb_strtoupper($m[1], 'UTF-8'); }, $title);

        // "Mc" prefix only (not "Mac" — common Filipino surnames like Macaraeg/
        // Macapagal start with Mac and must NOT get re-capitalized mid-word):
        // "Mcdonald" -> "McDonald".
        $title = preg_replace_callback('/\bMc([a-z])/u', function ($m) { return 'Mc' . mb_strtoupper($m[1], 'UTF-8'); }, $title);

        return $title;
    }
}
