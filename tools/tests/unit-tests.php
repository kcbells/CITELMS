<?php
/**
 * LEVEL 1 - Master Unit Testing Registry, Series 100
 * User Authentication, Security & Session Management (UT-101 ... UT-107)
 *
 * Run:  php tools/tests/unit-tests.php
 *
 * These assert what the code ACTUALLY does, which differs from the original
 * registry in two places - both flagged inline at UT-102 and UT-106.
 * No database and no web server are needed: every unit here is a pure
 * function or a self-contained static method.
 */

// CLI only - this calls session_start() via auth.php and must never be
// reachable over HTTP on a deployed server.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$root = dirname(__DIR__, 2);
require_once __DIR__ . '/harness.php';
require_once $root . '/config/auth.php';
require_once $root . '/config/jwt.php';
require_once $root . '/api/helpers/Sanitize.php';

$t = new TestRunner('LEVEL 1 - Unit Tests (Series 100: Auth, Security & Session)');

/* -- UT-101 ---------------------------------------------------------------
 * filter_var($email, FILTER_VALIDATE_EMAIL) - AuthAPI.php registration/login
 */
$t->unit('UT-101', 'Email format rejects structural typos');
$t->same(false, filter_var('test@com', FILTER_VALIDATE_EMAIL),       'test@com is rejected');
$t->same(false, filter_var('@@domain.com', FILTER_VALIDATE_EMAIL),   'double-at address is rejected');
$t->same(false, filter_var('no-at-sign.com', FILTER_VALIDATE_EMAIL), 'missing @ is rejected');
$t->same(false, filter_var('', FILTER_VALIDATE_EMAIL),               'empty string is rejected');
$t->ok(filter_var('student@phinmaed.com', FILTER_VALIDATE_EMAIL) !== false, 'a well-formed address is accepted');

/* -- UT-102 ---------------------------------------------------------------
 * Auth::validatePasswordStrength() - config/auth.php
 *
 * REGISTRY CORRECTION: this returns ?string, NOT false. null means the
 * password is acceptable; a non-empty string is the reason it was rejected.
 * It also enforces more than "8 chars + a special character": length 8-128
 * plus uppercase, lowercase, digit and special character.
 */
$t->unit('UT-102', 'Password strength returns null when valid, reason string when weak');
$t->contains('at least 8 characters', Auth::validatePasswordStrength('Ab1!'), 'under 8 characters is rejected');
$t->contains('128 characters', Auth::validatePasswordStrength(str_repeat('Ab1!', 40)), 'over 128 characters is rejected');
$t->contains('uppercase', Auth::validatePasswordStrength('password1!'), 'no uppercase is rejected');
$t->contains('lowercase', Auth::validatePasswordStrength('PASSWORD1!'), 'no lowercase is rejected');
$t->contains('number', Auth::validatePasswordStrength('Password!'), 'no digit is rejected');
$t->contains('special character', Auth::validatePasswordStrength('Password1'), 'no special character is rejected');
$t->same(null, Auth::validatePasswordStrength('Password1!'), 'a compliant password returns null');

/* -- UT-103 ---------------------------------------------------------------
 * password_hash($password, PASSWORD_DEFAULT) - bcrypt
 */
$t->unit('UT-103', 'Password hashing produces a unique salted bcrypt hash');
$plain = 'Password1!';
$hashA = password_hash($plain, PASSWORD_DEFAULT);
$hashB = password_hash($plain, PASSWORD_DEFAULT);
$t->ok(strlen($hashA) >= 60, 'hash is at least 60 characters', 'got length ' . strlen($hashA));
$t->ok(str_starts_with($hashA, '$2y$'), 'hash uses the bcrypt algorithm', 'got prefix ' . substr($hashA, 0, 4));
$t->ok($hashA !== $hashB, 'the same password hashes differently each time (unique salt)');
$t->ok($hashA !== $plain, 'the plaintext is never stored as-is');
$info = password_get_info($hashA);
$t->same('bcrypt', $info['algoName'], 'PASSWORD_DEFAULT resolves to bcrypt on this PHP build');

/* -- UT-104 ---------------------------------------------------------------
 * Auth::verifyPassword($plain, $hash) - wraps password_verify()
 */
$t->unit('UT-104', 'Password verification matches a login attempt against the stored hash');
$t->same(true,  Auth::verifyPassword($plain, $hashA), 'the correct password verifies');
$t->same(false, Auth::verifyPassword('WrongPass1!', $hashA), 'an incorrect password is rejected');
$t->same(false, Auth::verifyPassword('', $hashA), 'an empty password is rejected');
$t->same(false, Auth::verifyPassword($plain, 'not-a-hash'), 'a malformed stored hash is rejected');
$t->same(true,  Auth::verifyPassword($plain, $hashB), 'either salt of the same password verifies');

/* -- UT-105 ---------------------------------------------------------------
 * JWT::generate($user) - config/jwt.php
 */
$t->unit('UT-105', 'JWT generation issues an HS256-signed token carrying an exp claim');
$user = [
    'users_id'      => 40,
    'first_name'    => 'Kerby',
    'last_name'     => 'Gabutan',
    'role'          => 'student',
    'email'         => 'student@phinmaed.com',
    'student_id'    => '02-2324-08200',
    'token_version' => 0,
];
$token = JWT::generate($user);
$parts = explode('.', $token);
$t->same(3, count($parts), 'the token has three dot-separated segments');

$decode  = static function (string $seg) {
    return json_decode(base64_decode(strtr($seg, '-_', '+/')), true);
};
$header  = $decode($parts[0]);
$payload = $decode($parts[1]);
$t->same('HS256', $header['alg'] ?? null, 'the header declares HS256');
$t->same('JWT', $header['typ'] ?? null, 'the header declares typ JWT');
$t->ok(isset($payload['exp']), 'the payload carries an exp claim');
$t->same(JWT_EXPIRY, ($payload['exp'] ?? 0) - ($payload['iat'] ?? 0), 'exp is iat + JWT_EXPIRY (' . JWT_EXPIRY . 's)');
$t->same(40, $payload['users_id'] ?? null, 'the payload carries the user id');
$t->same('student', $payload['role'] ?? null, 'the payload carries the role');
$t->ok(!isset($payload['password']) && !isset($payload['password_hash']), 'no password material is embedded in the token');
$t->ok(JWT::validate($token) !== null, 'a freshly issued token validates');

/* -- UT-106 ---------------------------------------------------------------
 * Expiry check inside JWT::validate() - config/jwt.php
 *
 * REGISTRY CORRECTION: the method is JWT::validate(), not JWT::decode() -
 * there is no decode() method. It returns null on rejection rather than
 * throwing, so the assertion is "is null", not "throws".
 */
$t->unit('UT-106', 'An expired or tampered token is rejected by JWT::validate()');

// Forge a token whose exp is already in the past, signed with the REAL secret,
// so the only reason it can fail is the expiry check itself.
$b64 = static function (array $d) {
    return rtrim(strtr(base64_encode(json_encode($d)), '+/', '-_'), '=');
};
$expHeader  = $b64(['alg' => 'HS256', 'typ' => 'JWT']);
$expPayload = $b64([
    'users_id' => 40,
    'role'     => 'student',
    'tok_ver'  => 0,
    'iat'      => time() - 7200,
    'exp'      => time() - 3600,
]);
$expSig = rtrim(strtr(base64_encode(hash_hmac('sha256', $expHeader . '.' . $expPayload, JWT_SECRET, true)), '+/', '-_'), '=');
$t->same(null, JWT::validate($expHeader . '.' . $expPayload . '.' . $expSig), 'a correctly signed but expired token is rejected');

$t->same(null, JWT::validate($parts[0] . '.' . $parts[1] . '.tampered'), 'a bad signature is rejected');
$t->same(null, JWT::validate('not.a.jwt'), 'a structurally invalid token is rejected');
$t->same(null, JWT::validate(''), 'an empty token is rejected');
$t->same(null, JWT::validate('only-two.parts'), 'a token missing a segment is rejected');

/* -- UT-107 ---------------------------------------------------------------
 * Sanitize::text($userInput) - api/helpers/Sanitize.php
 */
$t->unit('UT-107', 'Input sanitisation strips HTML/script tags before storage');
$t->same('malicious()', Sanitize::text('<script>malicious()</script>'), 'script tags are stripped');
$t->same('bold', Sanitize::text('<b>bold</b>'), 'inline HTML tags are stripped');
$t->same('hi', Sanitize::text('  hi  '), 'surrounding whitespace is trimmed');
$t->same('', Sanitize::text(null), 'null becomes an empty string');
$t->same('', Sanitize::text('<img src=x onerror=alert(1)>'), 'a self-closing tag payload is removed entirely');
$t->ok(!str_contains(Sanitize::text('<script>alert(1)</script>'), '<'), 'no angle brackets survive');

// Worth knowing: strip_tags() removes the TAGS, not the text between them, so
// "<script>malicious()</script>" is stored as "malicious()". That is inert as
// long as output is escaped - which is why this is a defence-in-depth layer,
// not the only one.
$t->ok(!str_contains(Sanitize::text('<script>malicious()</script>'), '<script'), 'the script tag itself cannot be reconstructed');

exit($t->report());
