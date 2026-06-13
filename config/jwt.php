<?php
/**
 * ============================================================
 * JWT (JSON Web Token) Helper
 * ============================================================
 * Pure PHP implementation — no Composer needed.
 * Algorithm: HS256 (HMAC-SHA256)
 * ============================================================
 */

define('JWT_SECRET', 'coc-lms-secret-key-2024-change-in-production');
define('JWT_EXPIRY', 3600); // 1 hour in seconds

class JWT {

    /**
     * Generate a JWT token for a user
     */
    public static function generate(array $user): string {
        $header = self::base64UrlEncode(json_encode([
            'alg' => 'HS256',
            'typ' => 'JWT'
        ]));

        $payload = self::base64UrlEncode(json_encode([
            'sub'         => $user['users_id'],
            'users_id'    => $user['users_id'],
            'name'        => trim($user['first_name'] . ' ' . $user['last_name']),
            'first_name'  => $user['first_name'] ?? '',
            'last_name'   => $user['last_name'] ?? '',
            'role'        => $user['role'],
            'email'       => $user['email'],
            'student_id'  => $user['student_id'] ?? null,
            'employee_id' => $user['employee_id'] ?? null,
            'iat'         => time(),
            'exp'         => time() + JWT_EXPIRY
        ]));

        $signature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", JWT_SECRET, true)
        );

        return "$header.$payload.$signature";
    }

    /**
     * Validate and decode a JWT token
     * Returns the payload array or null if invalid/expired
     */
    public static function validate(string $token): ?array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $payload, $signature] = $parts;

        // Verify signature
        $expectedSig = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", JWT_SECRET, true)
        );

        if (!hash_equals($expectedSig, $signature)) return null;

        // Decode payload
        $data = json_decode(self::base64UrlDecode($payload), true);
        if (!$data) return null;

        // Check expiry
        if (isset($data['exp']) && $data['exp'] < time()) return null;

        return $data;
    }

    /**
     * Extract JWT from Authorization header
     * Expects: "Authorization: Bearer <token>"
     */
    public static function fromHeader(): ?string {
        $headers = getallheaders();
        $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
            return $m[1];
        }
        return null;
    }

    /**
     * Get authenticated user from JWT header
     * Returns payload or null if not authenticated
     */
    public static function authenticate(): ?array {
        $token = self::fromHeader();
        if (!$token) return null;
        return self::validate($token);
    }

    // ── Helpers ──────────────────────────────────────────────

    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
    }
}
