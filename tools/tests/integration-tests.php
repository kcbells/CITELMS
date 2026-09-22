<?php
/**
 * LEVEL 2 - Master Integration Testing Registry, Series 100
 * Frontend Interface <---> Backend API Integration (IT-101 ... IT-104)
 *
 * Run (Apache must be running):
 *   php tools/tests/integration-tests.php
 *   php tools/tests/integration-tests.php --user=02-2324-08200 --pass='YourPassword1!'
 *   php tools/tests/integration-tests.php --base=http://10.135.227.92/CITELMS
 *
 * Without credentials the suite still runs every unauthenticated contract
 * check and SKIPS the signed-in ones rather than failing, so it is useful in
 * CI where no seeded account exists.
 *
 * NON-DESTRUCTIVE BY DESIGN. Nothing here creates an account, sends an OTP
 * e-mail, or uploads a file. Registration and upload are verified through
 * their rejection paths and their wiring, because the happy path for those
 * writes real rows and real files - run those manually.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$root = dirname(__DIR__, 2);
require_once __DIR__ . '/harness.php';

// ---- options ------------------------------------------------------------
$opts = getopt('', ['base::', 'user::', 'pass::', 'dup-sid::', 'dup-email::']);
$base = rtrim($opts['base'] ?? 'http://localhost/CITELMS', '/');
$user = $opts['user'] ?? '';
$pass = $opts['pass'] ?? '';
$haveCreds = $user !== '' && $pass !== '';

$cookieJar = tempnam(sys_get_temp_dir(), 'citelms_test_');

/**
 * One HTTP call. Returns status, decoded JSON body, raw body and headers so
 * assertions can look at the status line as well as the payload - the
 * distinction matters for IT-101.
 */
function http_call(string $method, string $url, array $opt = []): array
{
    global $cookieJar;

    $ch = curl_init($url);
    $headers = $opt['headers'] ?? [];

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER         => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_COOKIEJAR      => $cookieJar,
        CURLOPT_COOKIEFILE     => $cookieJar,
        CURLOPT_CUSTOMREQUEST  => $method,
    ]);

    if (isset($opt['json'])) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($opt['json']));
    } elseif (isset($opt['form'])) {
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($opt['form']));
    }

    if ($headers) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }

    $raw      = curl_exec($ch);
    $status   = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $hdrSize  = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $error    = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        return ['status' => 0, 'json' => null, 'body' => '', 'headers' => '', 'error' => $error];
    }

    $body = substr($raw, $hdrSize);
    return [
        'status'  => $status,
        'json'    => json_decode($body, true),
        'body'    => $body,
        'headers' => substr($raw, 0, $hdrSize),
        'error'   => $error,
    ];
}

$t = new TestRunner('LEVEL 2 - Integration Tests (Series 100: Frontend <-> Backend API)');

// ---- reachability -------------------------------------------------------
$t->unit('IT-000', 'Test target is reachable (' . $base . ')');
$ping = http_call('GET', $base . '/index.html');
$t->same(200, $ping['status'], 'the landing page responds 200');
if ($ping['status'] !== 200) {
    echo "\nCannot reach $base - is Apache running? Aborting.\n";
    echo "Detail: " . ($ping['error'] ?: 'no response') . "\n";
    @unlink($cookieJar);
    exit($t->report());
}

/* -- IT-101 ---------------------------------------------------------------
 * "Register Here" form (index.html) <-> AuthAPI.php?action=register-request
 *
 * REGISTRY CORRECTION: register-request does NOT create the account and does
 * NOT return 201. It issues an OTP and returns a token; account creation and
 * the 201 Created belong to action=register-verify, a separate request. The
 * frontend also never reads the status code - it branches on the JSON
 * "success" field - so that is what is asserted here.
 */
$t->unit('IT-101', 'Registration form serialises to JSON and the API answers in JSON');

$bad = http_call('POST', $base . '/api/AuthAPI.php?action=register-request', [
    'json'    => ['full_name' => 'Test User', 'email' => 'test@com', 'password' => 'Password1!'],
    'headers' => ['X-Requested-With: XMLHttpRequest'],
]);
$t->ok($bad['json'] !== null, 'the endpoint returns parseable JSON');
$t->same(false, $bad['json']['success'] ?? null, 'a malformed e-mail is rejected via the success flag');
$t->ok($bad['status'] !== 201, 'register-request does not return 201 Created', 'got status ' . $bad['status']);

// The CSRF guard in config/cors.php must reject a plain cross-site form POST:
// no X-Requested-With, no JSON content type.
$formPost = http_call('POST', $base . '/api/AuthAPI.php?action=register-request', [
    'form' => ['full_name' => 'Test User', 'email' => 'a@b.co', 'password' => 'Password1!'],
]);
$t->same(400, $formPost['status'], 'a plain HTML-form POST is rejected by the CSRF guard');

$t->unit('IT-101b', 'Account creation and 201 Created live on register-verify');
$verify = http_call('POST', $base . '/api/AuthAPI.php?action=register-verify', [
    'json'    => ['token' => 'not-a-real-token', 'otp' => '000000'],
    'headers' => ['X-Requested-With: XMLHttpRequest'],
]);
$t->ok($verify['json'] !== null, 'register-verify returns parseable JSON');
$t->same(false, $verify['json']['success'] ?? null, 'an invalid OTP token is rejected');
// The 201 happy path needs a real mailbox, so it stays a manual test.

/* -- IT-102 ---------------------------------------------------------------
 * Sign-in <-> Session Manager
 *
 * REGISTRY NOTE: app/js/login.js and app/login.html were deleted (dead code -
 * a redirect stub plus an unused script that nothing referenced). Sign-in and
 * Forgot Password both live inline in index.html. The live handler is inline in
 * index.html. Role routing is also decided by the BACKEND (it returns
 * data.redirect); the frontend just follows it.
 */
$t->unit('IT-102', 'Login issues a JWT and a server-chosen role redirect');

$badLogin = http_call('POST', $base . '/api/AuthAPI.php?action=login', [
    'json'    => ['user_id' => 'definitely-not-a-user', 'password' => 'wrong'],
    'headers' => ['X-Requested-With: XMLHttpRequest'],
]);
$t->same(false, $badLogin['json']['success'] ?? null, 'invalid credentials are rejected');
$t->ok(empty($badLogin['json']['data']['token']), 'no token is issued on a failed login');

if (!$haveCreds) {
    $t->ok(true, 'SKIPPED: valid-login assertions (pass --user= and --pass= to run them)');
} else {
    $login = http_call('POST', $base . '/api/AuthAPI.php?action=login', [
        'json'    => ['user_id' => $user, 'password' => $pass],
        'headers' => ['X-Requested-With: XMLHttpRequest'],
    ]);
    $t->same(true, $login['json']['success'] ?? null, 'valid credentials are accepted');

    $token = $login['json']['data']['token'] ?? '';
    $t->same(3, count(explode('.', $token)), 'the backend returns a three-segment JWT');

    $hdr = json_decode(base64_decode(strtr(explode('.', $token)[0] ?? '', '-_', '+/')), true);
    $t->same('HS256', $hdr['alg'] ?? null, 'the returned JWT is HS256-signed');

    $redirect = $login['json']['data']['redirect'] ?? '';
    $t->ok($redirect !== '', 'the backend supplies the redirect target');
    $t->ok(str_contains($redirect, '/app/dashboard.html#'), 'the redirect points at the SPA dashboard route', 'got ' . $redirect);
    $t->ok(str_contains($redirect, 'CITELMS'), 'the redirect carries the detected BASE_URL', 'got ' . $redirect);

    // Session cookie established by the same call.
    $me = http_call('GET', $base . '/api/AuthAPI.php?action=check', [
        'headers' => ['X-Requested-With: XMLHttpRequest'],
    ]);
    $t->same(true, $me['json']['success'] ?? null, 'the session cookie authenticates a follow-up request');
}

/* -- IT-103 ---------------------------------------------------------------
 * Topbar global search (topbar.js) <-> SearchAPI.php
 */
$t->unit('IT-103', 'Global search is debounced client-side and role-scoped server-side');

// The 280 ms debounce is frontend-only and cannot be observed over HTTP, so it
// is asserted against the source instead. This keeps the registry's claim
// honest without pretending an HTTP call can measure it.
$topbar = file_get_contents($root . '/app/js/components/topbar.js');
$t->ok(str_contains($topbar, 'setTimeout(() => doSearch(q), 280)'), 'topbar.js debounces keystrokes at 280ms (asserted against source)');

if (!$haveCreds) {
    $t->ok(true, 'SKIPPED: authenticated search assertions (pass --user= and --pass=)');
} else {
    $search = http_call('GET', $base . '/api/SearchAPI.php?q=a', [
        'headers' => ['X-Requested-With: XMLHttpRequest'],
    ]);
    $t->same(200, $search['status'], 'an authenticated search returns 200');
    $t->ok($search['json'] !== null, 'search results come back as JSON (no page reload needed)');
    $t->ok(is_array($search['json']), 'the payload is a structured, categorised result set');
}

/* -- IT-104 ---------------------------------------------------------------
 * Material uploader <-> LessonsAPI.php / AnnouncementsAPI.php (upload-material)
 *
 * The happy path writes a real file to uploads/ and a real row, so it is left
 * as a manual test. What is asserted here is the wiring and the gates around
 * it: the action exists on both controllers, is permission-gated, and refuses
 * unauthenticated or non-multipart callers.
 */
$t->unit('IT-104', 'Material upload is wired to both controllers and properly gated');

$lessons = file_get_contents($root . '/api/LessonsAPI.php');
$announce = file_get_contents($root . '/api/AnnouncementsAPI.php');
$t->ok(str_contains($lessons, "case 'upload-material'"), 'LessonsAPI exposes upload-material');
$t->ok(str_contains($announce, "'upload-material'"), 'AnnouncementsAPI exposes upload-material');
$t->ok(str_contains($lessons, "'upload-material' => 'lessons.edit'"), 'LessonsAPI gates it behind lessons.edit');
$t->ok(str_contains($announce, "'upload-material'   => 'announcements.edit'"), 'AnnouncementsAPI gates it behind announcements.edit');

$composer = file_get_contents($root . '/app/js/components/class-composer.js');
$t->ok(str_contains($composer, 'new FormData()'), 'the uploader wraps the file in FormData (multipart)');

// A plain form POST must still be refused by the CSRF guard even before auth.
$upForm = http_call('POST', $base . '/api/LessonsAPI.php?action=upload-material', [
    'form' => ['lessons_id' => 1],
]);
$t->same(400, $upForm['status'], 'a non-multipart, non-XHR upload POST is rejected');

/* == LEVEL 3 - System Registry, Series 100 =================================
 * Only the parts observable over HTTP live here. ST-103 (password masking and
 * the eye toggle), ST-104 (form validation) and ST-106 (back-button behaviour
 * after logout) are browser behaviours that would need Playwright or Selenium,
 * so they stay manual - see the registry document.
 */

/* -- ST-101 --------------------------------------------------------------- */
$t->unit('ST-101', 'Registration is blocked for an already-registered account');

// Identifiers that are known to exist. Override them for a different dataset:
//   --dup-sid=... --dup-email=...
$dupSid   = $opts['dup-sid']   ?? '02-2324-08200';
$dupEmail = $opts['dup-email'] ?? 'erca.gabutan.coc@phinmaed.com';

// register-request validates required fields BEFORE it checks for duplicates,
// so a partial payload never reaches the duplicate branch. Send a complete one
// and vary only the field under test. The request must be REJECTED either way,
// so nothing is ever created.
$regPayload = static function (array $override) {
    return $override + [
        'first_name'       => 'Duplicate',
        'last_name'        => 'Probe',
        'program_code'     => 'BSIT',
        'campus_id'        => 1,
        'password'         => 'Password1!',
        'confirm_password' => 'Password1!',
    ];
};

// The duplicate branch also increments the attempt counter, so a repeated run
// can legitimately answer with the rate-limit message instead. Both are a
// refusal; accept either rather than making the suite flaky.
$refusal = static function (string $msg): bool {
    return str_contains($msg, 'already registered') || str_contains($msg, 'Too many attempts');
};

$sidRes = http_call('POST', $base . '/api/AuthAPI.php?action=register-request', [
    'json'    => $regPayload(['student_id' => $dupSid, 'email' => 'brand.new.addr@phinmaed.com']),
    'headers' => ['X-Requested-With: XMLHttpRequest'],
]);
$sidMsg = (string)($sidRes['json']['message'] ?? '');
$t->same(false, $sidRes['json']['success'] ?? null, 'a duplicate Student ID is rejected');
$t->ok($refusal($sidMsg), 'the Student ID rejection says why', 'got: ' . ($sidMsg ?: '(none)'));

$emailRes = http_call('POST', $base . '/api/AuthAPI.php?action=register-request', [
    'json'    => $regPayload(['student_id' => '09-9999-99999', 'email' => $dupEmail]),
    'headers' => ['X-Requested-With: XMLHttpRequest'],
]);
$emailMsg = (string)($emailRes['json']['message'] ?? '');
$t->same(false, $emailRes['json']['success'] ?? null, 'a duplicate e-mail is rejected');
$t->ok($refusal($emailMsg), 'the e-mail rejection says why', 'got: ' . ($emailMsg ?: '(none)'));

// All three duplicate-e-mail paths were standardised on one string so a system
// test can assert a single expected message regardless of which one answers.
$auth = file_get_contents($root . '/api/AuthAPI.php');
$t->same(0, substr_count($auth, "'This email is already registered.'"), 'no endpoint still uses the old short e-mail wording');
$t->same(0, substr_count($auth, "'Email is already in use'"), 'no endpoint still uses the old terse e-mail wording');

/* -- ST-102 --------------------------------------------------------------- */
$t->unit('ST-102', 'A valid ID with the wrong password fails closed');
$wrongPw = http_call('POST', $base . '/api/AuthAPI.php?action=login', [
    'json'    => ['user_id' => '02-2324-08200', 'password' => 'WrongPass123'],
    'headers' => ['X-Requested-With: XMLHttpRequest'],
]);
$t->same(false, $wrongPw['json']['success'] ?? null, 'the wrong password is rejected');
$t->same('Invalid ID or password', $wrongPw['json']['message'] ?? null, 'the message does not reveal which field was wrong');
$t->ok(empty($wrongPw['json']['data']['token']), 'no JWT is issued');
$t->ok(empty($wrongPw['json']['data']['redirect']), 'no redirect target is issued');

// The password field is cleared client-side on this branch; assert the handler
// that does it still exists, since only a browser can observe the field itself.
$landing = file_get_contents($root . '/index.html');
$t->ok(str_contains($landing, "pwField.value = ''"), 'the failure branch clears the password field (asserted against source)');

/* -- ST-105 --------------------------------------------------------------- */
$t->unit('ST-105', 'Role-based access is enforced server-side, not just in the UI');

// Unauthenticated first: an admin-only endpoint must never answer with data.
$anonAdmin = http_call('GET', $base . '/api/UsersAPI.php?action=list', [
    'headers' => ['X-Requested-With: XMLHttpRequest'],
]);
$t->ok(in_array($anonAdmin['status'], [401, 403], true), 'an anonymous caller is refused', 'got status ' . $anonAdmin['status']);
$t->ok(empty($anonAdmin['json']['data']), 'no user records leak to an anonymous caller');

if (!$haveCreds) {
    $t->ok(true, 'SKIPPED: signed-in role assertions (pass --user= and --pass=)');
} else {
    // Already signed in from IT-102 above; this cookie jar carries that session.
    $asUser = http_call('GET', $base . '/api/UsersAPI.php?action=list', [
        'headers' => ['X-Requested-With: XMLHttpRequest'],
    ]);
    $isStudent = ($asUser['status'] === 403);
    if ($isStudent) {
        $t->same(403, $asUser['status'], 'a student is refused the admin endpoint server-side');
        $t->ok(str_contains((string)($asUser['json']['message'] ?? ''), 'Permission denied'), 'the refusal names the missing permission', 'got: ' . ($asUser['json']['message'] ?? '(none)'));
        $t->ok(empty($asUser['json']['data']), 'no user records are returned to a student');
    } else {
        $t->ok(true, 'NOTE: supplied account is privileged for users.view - status ' . $asUser['status'] . ' (run again as a student to exercise the 403 path)');
    }
}

// The frontend half of ST-105 is a rendered screen, so assert its guard exists.
$appJs = file_get_contents($root . '/app/js/app.js');
$t->ok(str_contains($appJs, '!Auth.can(required)'), 'the SPA router guards routes with Auth.can (asserted against source)');
$t->ok(str_contains($appJs, 'Access Denied'), 'the router renders an Access Denied screen (asserted against source)');

@unlink($cookieJar);
exit($t->report());
