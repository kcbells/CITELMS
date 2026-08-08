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
}
