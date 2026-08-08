<?php
/**
 * ============================================================
 * CIT-LMS Authentication API
 * ============================================================
 * Handles: Login, Logout, Session Check
 * 
 * Endpoints:
 *   GET  ?action=check     - Check if user is logged in
 *   GET  ?action=logout    - Logout current user
 *   GET  ?action=me        - Get current user data
 *   POST ?action=login     - Login with email/password
 * ============================================================
 */

require_once __DIR__ . '/../config/cors.php';

// Headers for JSON API
header('Content-Type: application/json');

// Load config files
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/helpers/SignupCatalogHelper.php';
require_once __DIR__ . '/helpers/Sanitize.php';
require_once __DIR__ . '/helpers/UserIdHelper.php';
require_once __DIR__ . '/helpers/PasswordOtpHelper.php';
require_once __DIR__ . '/../config/email.php';

// Get the action from query string
$action = $_GET['action'] ?? '';

// Route to appropriate handler
switch ($action) {
    case 'captcha':
        handleCaptcha();
        break;

    case 'login':
        handleLogin();
        break;

    case 'signup-catalog':
        handleSignupCatalog();
        break;

    case 'register':
        handleRegister();
        break;

    case 'signup-campuses':
        handleSignupCampuses();
        break;

    case 'register-request':
        handleRegisterRequest();
        break;

    case 'register-verify':
        handleRegisterVerify();
        break;

    case 'logout':
        handleLogout();
        break;
    
    case 'check':
        handleCheck();
        break;

    case 'verify-token':
        handleVerifyToken();
        break;
    
    case 'me':
        handleGetCurrentUser();
        break;

    case 'update-profile':
        handleUpdateProfile();
        break;

    case 'change-password':
        handleChangePassword();
        break;

    case 'request-password-otp':
        handleRequestPasswordOtp();
        break;

    case 'verify-password-otp':
        handleVerifyPasswordOtp();
        break;

    case 'claim-tab':
        handleClaimTab();
        break;

    case 'check-id':
        handleCheckId();
        break;

    case 'set-first-password':
        handleSetFirstPassword();
        break;

    case 'forgot-password':
        handleForgotPassword();
        break;

    case 'verify-forgot-otp':
        handleVerifyForgotOtp();
        break;

    default:
        jsonResponse(false, 'Invalid action', null, 400);
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE LOGIN
 * ─────────────────────────────────────────────────────────────
 */
function handleSignupCatalog() {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    try {
        jsonResponse(true, 'Sign-up catalog loaded', [
            'departments' => getSignupCatalog(),
        ]);
    } catch (Exception $e) {
        error_log('signup-catalog: ' . $e->getMessage());
        jsonResponse(false, 'Could not load courses. Please try again.', null, 500);
    }
}

function handleRegister() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    if (!checkLoginRateLimit()) {
        jsonResponse(false, 'Too many attempts. Please wait a few minutes and try again.', null, 429);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    if (!empty($input['website'] ?? '')) {
        usleep(random_int(400000, 800000));
        jsonResponse(false, 'Registration failed. Please try again.');
    }

    $studentId   = trim($input['student_id'] ?? $input['user_id'] ?? '');
    $fullName    = Sanitize::text($input['full_name'] ?? '');
    $email       = trim($input['email'] ?? '');
    $programCode = trim($input['program_code'] ?? '');
    $major       = trim($input['major'] ?? '');
    $password    = $input['password'] ?? '';
    $confirmPw   = $input['confirm_password'] ?? '';

    if ($fullName === '' || $email === '' || $programCode === '') {
        incrementLoginAttempts();
        jsonResponse(false, 'Full name, email, and course are required.');
    }

    $pwError = Auth::validatePasswordStrength($password);
    if ($pwError) {
        incrementLoginAttempts();
        jsonResponse(false, $pwError);
    }

    if ($password !== $confirmPw) {
        incrementLoginAttempts();
        jsonResponse(false, 'Passwords do not match.');
    }

    // Auto-generate student ID if not provided
    if ($studentId === '') {
        $studentId = generateAutoStudentId();
    } elseif (!UserIdHelper::isValidStudentId($studentId)) {
        incrementLoginAttempts();
        jsonResponse(false, 'Student ID must contain numbers only (no letters). Example: 2024-00001');
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        incrementLoginAttempts();
        jsonResponse(false, 'Please enter a valid email address.');
    }

    [$firstName, $lastName] = splitFullName($fullName);
    if ($firstName === '') {
        incrementLoginAttempts();
        jsonResponse(false, 'Please enter your full name.');
    }

    try {
        ensureUserMajorColumn();

        $resolved = resolveSignupProgram($programCode, $major ?: null);

        if (db()->fetchOne("SELECT users_id FROM users WHERE student_id = ? LIMIT 1", [$studentId])) {
            incrementLoginAttempts();
            jsonResponse(false, 'This Student ID is already registered.');
        }

        if (db()->fetchOne("SELECT users_id FROM users WHERE email = ? LIMIT 1", [$email])) {
            incrementLoginAttempts();
            jsonResponse(false, 'This email is already registered.');
        }

        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        pdo()->prepare(
            "INSERT INTO users (
                first_name, last_name, email, password, role, status,
                department_id, program_id, major, student_id, created_at, updated_at
             ) VALUES (?, ?, ?, ?, 'student', 'active', ?, ?, ?, ?, NOW(), NOW())"
        )->execute([
            $firstName,
            $lastName,
            $email,
            $hashedPassword,
            $resolved['department_id'],
            $resolved['program_id'],
            $resolved['major'],
            $studentId,
        ]);

        $userId = (int)pdo()->lastInsertId();
        resetLoginAttempts();

        logActivity($userId, 'register', sprintf(
            'Student self-registration — %s (%s), %s',
            $resolved['program_code'],
            $resolved['department_code'],
            $resolved['major'] ? 'Major: ' . $resolved['major'] : 'No major'
        ));

        jsonResponse(true, 'Account created! You can now log in with your Student ID and password.', [
            'user' => [
                'id'           => $userId,
                'student_id'   => $studentId,
                'name'         => trim($firstName . ' ' . $lastName),
                'email'        => $email,
                'department'   => $resolved['department_name'],
                'program'      => $resolved['program_name'],
                'major'        => $resolved['major'],
            ],
        ], 201);
    } catch (InvalidArgumentException $e) {
        incrementLoginAttempts();
        jsonResponse(false, $e->getMessage());
    } catch (Exception $e) {
        error_log('register: ' . $e->getMessage());
        incrementLoginAttempts();
        jsonResponse(false, 'Registration failed. Please try again.', null, 500);
    }
}

// ─────────────────────────────────────────────────────────────
// SIGNUP CAMPUSES — public list for registration form
// ─────────────────────────────────────────────────────────────
function handleSignupCampuses() {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }
    try {
        $rows = db()->fetchAll(
            "SELECT campus_id, campus_name, campus_code FROM campus WHERE status = 'active' ORDER BY campus_id ASC"
        );
        jsonResponse(true, 'Campuses loaded', ['campuses' => $rows ?: []]);
    } catch (Exception $e) {
        jsonResponse(true, 'Campuses loaded', ['campuses' => [
            ['campus_id' => 1, 'campus_name' => 'Main Campus (Carmen)', 'campus_code' => 'MAIN'],
            ['campus_id' => 2, 'campus_name' => 'Iligan Campus', 'campus_code' => 'ILIGAN'],
            ['campus_id' => 3, 'campus_name' => 'Puerto Campus', 'campus_code' => 'PUERTO'],
        ]]);
    }
}

// ─────────────────────────────────────────────────────────────
// HELPERS for OTP-based registration
// ─────────────────────────────────────────────────────────────
function ensureRegOtpTable(): void {
    static $ready = false;
    if ($ready) return;
    $ready = true;
    pdo()->exec(
        "CREATE TABLE IF NOT EXISTS registration_otp (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            token VARCHAR(64) NOT NULL UNIQUE,
            otp_hash VARCHAR(255) NOT NULL,
            reg_data JSON NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_reg_otp_token (token),
            INDEX idx_reg_otp_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
}

function generateAutoStudentId(): string {
    $year = date('Y');
    $row = db()->fetchOne(
        "SELECT student_id FROM users WHERE student_id LIKE ? ORDER BY users_id DESC LIMIT 1",
        [$year . '-%']
    );
    if ($row) {
        $parts = explode('-', $row['student_id']);
        $seq = (int)end($parts) + 1;
    } else {
        $seq = 1;
    }
    // Also check pending registrations to avoid collision within the 2-min window
    $pendingRow = db()->fetchOne(
        "SELECT JSON_UNQUOTE(JSON_EXTRACT(reg_data,'$.student_id')) AS sid
         FROM registration_otp WHERE expires_at > NOW() ORDER BY id DESC LIMIT 1"
    );
    if ($pendingRow && $pendingRow['sid'] && strpos($pendingRow['sid'], $year . '-') === 0) {
        $parts2 = explode('-', $pendingRow['sid']);
        $pendingSeq = (int)end($parts2) + 1;
        $seq = max($seq, $pendingSeq);
    }
    return $year . '-' . str_pad((string)$seq, 5, '0', STR_PAD_LEFT);
}

function maskedEmail(string $email): string {
    [$local, $domain] = explode('@', $email, 2);
    $visible = min(3, strlen($local));
    return substr($local, 0, $visible) . str_repeat('*', max(0, strlen($local) - $visible)) . '@' . $domain;
}

// ─────────────────────────────────────────────────────────────
// REGISTER REQUEST — validate + send OTP (step 1 of 2)
// ─────────────────────────────────────────────────────────────
function handleRegisterRequest() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }
    if (!checkLoginRateLimit()) {
        jsonResponse(false, 'Too many attempts. Please wait a few minutes and try again.', null, 429);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    // Honeypot
    if (!empty($input['website'] ?? '')) {
        usleep(random_int(400000, 800000));
        jsonResponse(false, 'Registration failed. Please try again.');
    }

    $firstName   = Sanitize::text($input['first_name'] ?? '');
    $middleName  = Sanitize::text($input['middle_name'] ?? '');
    $lastName    = Sanitize::text($input['last_name'] ?? '');
    $suffix      = Sanitize::text($input['suffix'] ?? '');
    $email       = trim($input['email'] ?? '');
    $studentId   = trim($input['student_id'] ?? '');
    $noId        = !empty($input['no_student_id']);
    $campusId    = (int)($input['campus_id'] ?? 0);
    $programCode = trim($input['program_code'] ?? '');
    $major       = trim($input['major'] ?? '');
    $password    = $input['password'] ?? '';
    $confirmPw   = $input['confirm_password'] ?? '';

    if ($firstName === '' || $lastName === '' || $email === '' || $programCode === '') {
        jsonResponse(false, 'First name, last name, email, and program are required.');
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(false, 'Please enter a valid email address.');
    }

    $pwError = Auth::validatePasswordStrength($password);
    if ($pwError) {
        jsonResponse(false, $pwError);
    }
    if ($password !== $confirmPw) {
        jsonResponse(false, 'Passwords do not match.');
    }

    // Student ID handling
    if ($noId || $studentId === '') {
        $studentId = generateAutoStudentId();
    } elseif (!UserIdHelper::isValidStudentId($studentId)) {
        jsonResponse(false, 'Student ID must contain numbers and dashes only. Example: 2024-00001');
    }

    // Check for duplicates early
    if (db()->fetchOne("SELECT users_id FROM users WHERE student_id = ? LIMIT 1", [$studentId])) {
        jsonResponse(false, 'This Student ID is already registered.');
    }
    if (db()->fetchOne("SELECT users_id FROM users WHERE email = ? LIMIT 1", [$email])) {
        jsonResponse(false, 'This email address is already registered.');
    }

    try {
        ensureSignupCatalogInDb();
        ensureUserMajorColumn();
        $resolved = resolveSignupProgram($programCode, $major ?: null);
    } catch (InvalidArgumentException $e) {
        jsonResponse(false, $e->getMessage());
    } catch (Exception $e) {
        error_log('register-request catalog: ' . $e->getMessage());
        jsonResponse(false, 'Could not resolve program. Please try again.');
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    $regData = [
        'first_name'    => $firstName,
        'middle_name'   => $middleName,
        'last_name'     => $lastName,
        'suffix'        => $suffix,
        'email'         => $email,
        'student_id'    => $studentId,
        'auto_id'       => ($noId || trim($input['student_id'] ?? '') === ''),
        'campus_id'     => $campusId ?: null,
        'program_id'    => $resolved['program_id'],
        'department_id' => $resolved['department_id'],
        'major'         => $resolved['major'],
        'password_hash' => $hashedPassword,
    ];

    // Generate OTP — 2 minute expiry
    $otp       = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $otpHash   = password_hash($otp, PASSWORD_DEFAULT);
    $token     = bin2hex(random_bytes(32));
    $expiresAt = date('Y-m-d H:i:s', time() + 120);

    try {
        ensureRegOtpTable();
        // Delete expired rows
        pdo()->exec("DELETE FROM registration_otp WHERE expires_at < NOW()");
        pdo()->prepare(
            "INSERT INTO registration_otp (token, otp_hash, reg_data, expires_at) VALUES (?, ?, ?, ?)"
        )->execute([$token, $otpHash, json_encode($regData), $expiresAt]);
    } catch (Exception $e) {
        error_log('register-request db: ' . $e->getMessage());
        jsonResponse(false, 'Registration failed. Please try again.', null, 500);
    }

    // Send OTP email
    require_once __DIR__ . '/helpers/EmailHelper.php';
    $sent = EmailHelper::sendRegistrationOtp($email, $firstName, $otp, $studentId, $regData['auto_id']);

    jsonResponse(true, 'Verification code sent.', [
        'token'        => $token,
        'masked_email' => maskedEmail($email),
        'expires_at'   => $expiresAt,
        'expires_in'   => 120,
        'email_sent'   => $sent,
    ]);
}

// ─────────────────────────────────────────────────────────────
// REGISTER VERIFY — verify OTP + create account (step 2 of 2)
// ─────────────────────────────────────────────────────────────
function handleRegisterVerify() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $token = trim($input['token'] ?? '');
    $otp   = trim($input['otp'] ?? '');

    if ($token === '' || !preg_match('/^\d{6}$/', $otp)) {
        jsonResponse(false, 'Invalid verification code.');
    }

    try {
        ensureRegOtpTable();
        $row = db()->fetchOne(
            "SELECT * FROM registration_otp WHERE token = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1",
            [$token]
        );
    } catch (Exception $e) {
        jsonResponse(false, 'Verification failed. Please try again.', null, 500);
    }

    if (!$row) {
        jsonResponse(false, 'Verification code expired or already used. Please start registration again.');
    }

    if (!password_verify($otp, $row['otp_hash'])) {
        jsonResponse(false, 'Incorrect verification code. Please try again.');
    }

    $data = json_decode($row['reg_data'], true);

    // Final duplicate check (race-condition guard)
    if (db()->fetchOne("SELECT users_id FROM users WHERE student_id = ? LIMIT 1", [$data['student_id']])) {
        jsonResponse(false, 'This Student ID was just registered. Please start over with a different ID.');
    }
    if (db()->fetchOne("SELECT users_id FROM users WHERE email = ? LIMIT 1", [$data['email']])) {
        jsonResponse(false, 'This email address is already registered.');
    }

    try {
        pdo()->prepare(
            "INSERT INTO users (
                first_name, last_name, email, password, role, status,
                department_id, program_id, major, student_id, campus_id, created_at, updated_at
             ) VALUES (?, ?, ?, ?, 'student', 'active', ?, ?, ?, ?, ?, NOW(), NOW())"
        )->execute([
            $data['first_name'],
            $data['last_name'],
            $data['email'],
            $data['password_hash'],
            $data['department_id'],
            $data['program_id'],
            $data['major'],
            $data['student_id'],
            $data['campus_id'],
        ]);

        $userId = (int)pdo()->lastInsertId();

        // Mark OTP as used
        pdo()->prepare("UPDATE registration_otp SET used_at = NOW() WHERE id = ?")
             ->execute([$row['id']]);

        logActivity($userId, 'register', sprintf(
            'Student self-registration via OTP — student_id: %s, auto_id: %s',
            $data['student_id'],
            $data['auto_id'] ? 'yes' : 'no'
        ));

        jsonResponse(true, 'Account created successfully!', [
            'user' => [
                'id'         => $userId,
                'student_id' => $data['student_id'],
                'name'       => trim($data['first_name'] . ' ' . $data['last_name']),
                'email'      => $data['email'],
                'auto_id'    => $data['auto_id'],
            ],
        ], 201);
    } catch (Exception $e) {
        error_log('register-verify: ' . $e->getMessage());
        jsonResponse(false, 'Account creation failed. Please try again.', null, 500);
    }
}

function handleCaptcha() {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    $a = random_int(1, 20);
    $b = random_int(1, 20);
    $_SESSION['login_captcha']      = (string)($a + $b);
    $_SESSION['login_captcha_time'] = time();

    jsonResponse(true, 'Captcha generated', [
        'challenge' => $a . ' + ' . $b . ' = ?'
    ]);
}

function handleLogin() {
    // Only allow POST requests
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    if (!checkLoginRateLimit()) {
        jsonResponse(false, 'Too many login attempts. Please wait 60 seconds and try again.', null, 429);
    }
    
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Validate required fields
    $userId = trim($input['user_id'] ?? $input['email'] ?? '');
    $password = $input['password'] ?? '';
    // Honeypot — bots often fill hidden fields
    if (!empty($input['website'] ?? '')) {
        usleep(random_int(400000, 800000));
        jsonResponse(false, 'Invalid ID or password');
    }

    // Validation
    if (empty($userId)) {
        incrementLoginAttempts();
        jsonResponse(false, 'User ID is required');
    }

    if (strlen($password) > 128) {
        incrementLoginAttempts();
        jsonResponse(false, 'Invalid ID or password');
    }

    try {
        // Resolve account by ID type: letters = staff, numbers only = student
        $user = UserIdHelper::findUserForLogin($userId);

        if (!$user) {
            incrementLoginAttempts();
            usleep(random_int(300000, 600000));
            logActivity(null, 'login_failed', "Failed login attempt for user ID: $userId");
            jsonResponse(false, UserIdHelper::loginIdErrorMessage($userId));
        }
        
        // Reject empty password only when account already has a password set
        if (empty($password) && !($user['password'] === null || $user['password'] === '')) {
            incrementLoginAttempts();
            jsonResponse(false, 'Password is required');
        }

        // Check if user is active
        if ($user['status'] === 'pending') {
            incrementLoginAttempts();
            logActivity($user['users_id'], 'login_blocked', 'Login blocked - account pending activation');
            jsonResponse(false, 'Your account is pending activation. Please wait for an administrator to activate your account.');
        }

        if ($user['status'] !== 'active') {
            incrementLoginAttempts();
            logActivity($user['users_id'], 'login_blocked', 'Login blocked - account not active');
            jsonResponse(false, 'Your account is not active. Please contact administrator.');
        }

        // First login: account has no password yet — log in directly and require password setup
        if ($user['password'] === null || $user['password'] === '') {
            resetLoginAttempts();
            Auth::login($user);
            db()->execute("UPDATE users SET updated_at = NOW() WHERE users_id = ?", [$user['users_id']]);
            logActivity($user['users_id'], 'first_login', 'First login — password setup required');
            $token = JWT::generate($user);
            jsonResponse(true, 'First login detected. Please set your password.', [
                'first_login' => true,
                'token'       => $token,
                'tab_lease'   => Auth::tabLease(),
                'user'        => [
                    'id'    => $user['users_id'],
                    'name'  => trim($user['first_name'] . ' ' . $user['last_name']),
                    'email' => $user['email'],
                    'role'  => $user['role'],
                ],
            ]);
        }

        // Verify password
        if (!Auth::verifyPassword($password, $user['password'])) {
            incrementLoginAttempts();
            usleep(random_int(300000, 600000));
            logActivity($user['users_id'], 'login_failed', 'Failed login - incorrect password');
            jsonResponse(false, 'Invalid ID or password');
        }

        resetLoginAttempts();
        
        // Login successful - create session
        Auth::login($user);
        
        // Update last login timestamp
        db()->execute(
            "UPDATE users SET updated_at = NOW() WHERE users_id = ?",
            [$user['users_id']]
        );
        
        // Log successful login (non-blocking for response)
        try {
            logActivity($user['users_id'], 'login_success', 'User logged in successfully');
        } catch (Exception $e) {
            error_log('Login activity log: ' . $e->getMessage());
        }

        // Generate JWT token — must match the new session user
        $token = JWT::generate($user);

        // Get redirect URL based on role
        $redirectUrl = Auth::dashboardUrl();

        // Return success response with JWT token
        jsonResponse(true, 'Login successful', [
            'user' => [
                'id'    => $user['users_id'],
                'name'  => trim($user['first_name'] . ' ' . $user['last_name']),
                'email' => $user['email'],
                'role'  => $user['role']
            ],
            'token'     => $token,
            'tab_lease' => Auth::tabLease(),
            'redirect'  => $redirectUrl
        ]);
        
    } catch (Exception $e) {
        error_log('Login error: ' . $e->getMessage());
        jsonResponse(false, 'An error occurred. Please try again.', null, 500);
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE CLAIM TAB (single active tab per browser session)
 * ─────────────────────────────────────────────────────────────
 */
function handleClaimTab() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    if (!Auth::check()) {
        jsonResponse(false, 'Unauthorized', null, 401);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $lease = Auth::claimTabLease((string)($input['tab_lease'] ?? ''));

    jsonResponse(true, 'Tab claimed', [
        'tab_lease' => $lease,
    ]);
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE LOGOUT
 * ─────────────────────────────────────────────────────────────
 */
function handleLogout() {
    if (Auth::check()) {
        logActivity(Auth::id(), 'logout', 'User logged out');
        // Bump token_version so any active JWT is rejected on next API call
        try {
            db()->execute(
                "UPDATE users SET token_version = token_version + 1 WHERE users_id = ?",
                [Auth::id()]
            );
        } catch (Exception $e) {
            // Column may not exist yet on older installs — not fatal
        }
    }

    // Destroy session
    Auth::logout();
    
    jsonResponse(true, 'Logged out successfully', [
        'redirect' => BASE_URL . '/index.html'
    ]);
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE CHECK (Check if logged in via Session or JWT)
 * ─────────────────────────────────────────────────────────────
 */
function handleCheck() {
    // PHP session is source of truth after a fresh login
    if (Auth::check()) {
        jsonResponse(true, 'User is authenticated', [
            'authenticated' => true,
            'auth_method'   => 'session',
            'user'          => Auth::user(),
            'tab_lease'     => Auth::tabLease(),
        ]);
        return;
    }

    $jwtUser = JWT::authenticate();
    if ($jwtUser) {
        jsonResponse(true, 'User is authenticated', [
            'authenticated' => true,
            'auth_method'   => 'jwt',
            'user'          => $jwtUser,
            'tab_lease'     => Auth::tabLease(),
        ]);
        return;
    }

    jsonResponse(true, 'User is not authenticated', [
        'authenticated' => false,
        'user'          => null
    ]);
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE VERIFY TOKEN (Validate JWT)
 * ─────────────────────────────────────────────────────────────
 */
function handleVerifyToken() {
    $payload = JWT::authenticate();
    if (!$payload) {
        jsonResponse(false, 'Invalid or expired token', null, 401);
    }
    jsonResponse(true, 'Token is valid', [
        'user'       => $payload,
        'expires_at' => date('Y-m-d H:i:s', $payload['exp'])
    ]);
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE GET CURRENT USER
 * ─────────────────────────────────────────────────────────────
 */
function handleGetCurrentUser() {
    $userId = Auth::id();

    // Fall back to JWT if session is not available
    if (!$userId) {
        $jwtUser = JWT::authenticate();
        if ($jwtUser) {
            $userId = $jwtUser['sub'];
        }
    }

    if (!$userId) {
        jsonResponse(false, 'Not authenticated', null, 401);
    }
    
    try {
        $user = db()->fetchOne(
            "SELECT 
                u.users_id,
                u.employee_id,
                u.student_id,
                u.email,
                u.first_name,
                u.last_name,
                u.middle_name,
                u.role,
                u.status,
                u.department_id,
                u.program_id,
                u.campus_id,
                u.major,
                u.year_level,
                u.created_at,
                d.department_name,
                p.program_name,
                p.program_code,
                c.campus_name,
                c.campus_code
            FROM users u
            LEFT JOIN department d ON u.department_id = d.department_id
            LEFT JOIN program    p ON u.program_id    = p.program_id
            LEFT JOIN campus     c ON u.campus_id     = c.campus_id
            WHERE u.users_id = ?",
            [$userId]
        );
        
        if (!$user) {
            jsonResponse(false, 'User not found', null, 404);
        }
        
        jsonResponse(true, 'User data retrieved', ['user' => $user]);
        
    } catch (Exception $e) {
        error_log('Get user error: ' . $e->getMessage());
        jsonResponse(false, 'Failed to get user data', null, 500);
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE UPDATE PROFILE
 * ─────────────────────────────────────────────────────────────
 */
function handleUpdateProfile() {
    if (!Auth::check()) {
        jsonResponse(false, 'Not authenticated', null, 401);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $firstName = Sanitize::text($input['first_name'] ?? '');
    $lastName = Sanitize::text($input['last_name'] ?? '');
    $email = trim($input['email'] ?? '');
    $userId = Auth::id();

    if (!$firstName || !$lastName || !$email) {
        jsonResponse(false, 'All fields are required');
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(false, 'Invalid email format');
    }

    try {
        // Check email uniqueness
        $existing = db()->fetchOne(
            "SELECT users_id FROM users WHERE email = ? AND users_id != ?",
            [$email, $userId]
        );
        if ($existing) {
            jsonResponse(false, 'Email is already in use');
        }

        db()->execute(
            "UPDATE users SET first_name = ?, last_name = ?, email = ?, updated_at = NOW() WHERE users_id = ?",
            [$firstName, $lastName, $email, $userId]
        );

        jsonResponse(true, 'Profile updated successfully');
    } catch (Exception $e) {
        error_log('Profile update error: ' . $e->getMessage());
        jsonResponse(false, 'Failed to update profile', null, 500);
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 * REQUEST PASSWORD OTP (step 1 — send code to email)
 * ─────────────────────────────────────────────────────────────
 */
function handleRequestPasswordOtp() {
    if (!Auth::check()) {
        jsonResponse(false, 'Not authenticated', null, 401);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $currentPassword = $input['current_password'] ?? '';
    $newPassword = $input['new_password'] ?? '';
    $userId = Auth::id();

    if (!$currentPassword || !$newPassword) {
        jsonResponse(false, 'Current and new password are required');
    }

    $pwError = Auth::validatePasswordStrength($newPassword);
    if ($pwError) {
        jsonResponse(false, $pwError);
    }

    try {
        $user = db()->fetchOne(
            "SELECT users_id, first_name, email, password FROM users WHERE users_id = ?",
            [$userId]
        );

        if (!$user || !Auth::verifyPassword($currentPassword, $user['password'])) {
            jsonResponse(false, 'Current password is incorrect');
        }

        if (!filter_var($user['email'], FILTER_VALIDATE_EMAIL)) {
            jsonResponse(false, 'Your account has no valid email. Update your profile email first.');
        }

        if (!EmailHelper::isGmailReady()) {
            jsonResponse(false, 'Gmail SMTP is not configured. Open tools/mail-setup.php on localhost to connect your Gmail account.');
        }

        $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
        $result = PasswordOtpHelper::create(
            $userId,
            $user['email'],
            $user['first_name'],
            $newHash
        );

        if (!$result['sent']) {
            jsonResponse(false, 'Could not send verification email via Gmail. Check your App Password in config/email.local.php and try again.');
        }

        $ttl = (int)($result['expires_in'] ?? 600);
        $mins = $ttl >= 60 ? ceil($ttl / 60) . ' minute' . (ceil($ttl / 60) > 1 ? 's' : '') : $ttl . ' seconds';
        $msg = 'A 6-digit verification code was sent to ' . maskEmail($user['email'])
            . '. Enter it within ' . $mins . ' to confirm your new password.';
        jsonResponse(true, $msg, [
            'expires_at' => $result['expires_at'],
            'expires_in' => $ttl,
        ]);
    } catch (Exception $e) {
        error_log('Request password OTP: ' . $e->getMessage());
        jsonResponse(false, 'Failed to send verification code. Please try again.', null, 500);
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 * VERIFY PASSWORD OTP (step 2 — confirm new password)
 * ─────────────────────────────────────────────────────────────
 */
function handleVerifyPasswordOtp() {
    if (!Auth::check()) {
        jsonResponse(false, 'Not authenticated', null, 401);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $otp = trim($input['otp'] ?? '');
    $userId = Auth::id();

    $result = PasswordOtpHelper::verifyAndApply($userId, $otp);
    if ($result['ok']) {
        logActivity($userId, 'password_change', 'Password changed via email OTP');
        jsonResponse(true, $result['message']);
    }

    jsonResponse(false, $result['message']);
}

function maskEmail($email) {
    $parts = explode('@', $email, 2);
    if (count($parts) !== 2) {
        return $email;
    }
    $name = $parts[0];
    $masked = strlen($name) <= 2
        ? str_repeat('*', strlen($name))
        : substr($name, 0, 1) . str_repeat('*', max(1, strlen($name) - 2)) . substr($name, -1);
    return $masked . '@' . $parts[1];
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE CHANGE PASSWORD (legacy — directs to OTP flow)
 * ─────────────────────────────────────────────────────────────
 */
function handleChangePassword() {
    jsonResponse(false, 'Please use email verification: click Send verification code, then enter the OTP from your email.');
}

/**
 * ─────────────────────────────────────────────────────────────
 * FORGOT PASSWORD — step 1: send OTP to registered email
 * ─────────────────────────────────────────────────────────────
 */
function handleForgotPassword() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $identifier = trim($input['identifier'] ?? '');

    $genericMsg = 'If an account with that ID or email exists, a 6-digit code has been sent to the registered email.';

    if (!$identifier) {
        jsonResponse(true, $genericMsg);
    }

    // Constant-time delay to resist timing-based enumeration
    usleep(random_int(150000, 350000));

    $user = db()->fetchOne(
        "SELECT users_id, first_name, email FROM users
         WHERE (email = ? OR student_id = ? OR employee_id = ?) AND status = 'active' LIMIT 1",
        [$identifier, $identifier, $identifier]
    );

    if (!$user || !filter_var($user['email'], FILTER_VALIDATE_EMAIL)) {
        jsonResponse(true, $genericMsg);
    }

    if (!EmailHelper::isGmailReady()) {
        jsonResponse(false, 'Email service is not available. Please contact your administrator.');
    }

    $_SESSION['forgot_pw_user_id'] = (int)$user['users_id'];
    $_SESSION['forgot_pw_created']  = time();

    $result = PasswordOtpHelper::create((int)$user['users_id'], $user['email'], $user['first_name'], '');

    if (!$result['sent']) {
        unset($_SESSION['forgot_pw_user_id'], $_SESSION['forgot_pw_created']);
        jsonResponse(false, 'Could not send verification email. Please try again later.');
    }

    jsonResponse(true, $genericMsg, [
        'masked_email' => maskEmail($user['email']),
        'expires_at'   => $result['expires_at'],
        'expires_in'   => (int)($result['expires_in'] ?? 60),
    ]);
}

/**
 * ─────────────────────────────────────────────────────────────
 * FORGOT PASSWORD — step 2: verify OTP and apply new password
 * ─────────────────────────────────────────────────────────────
 */
function handleVerifyForgotOtp() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    $userId  = (int)($_SESSION['forgot_pw_user_id'] ?? 0);
    $created = (int)($_SESSION['forgot_pw_created']  ?? 0);

    if (!$userId || (time() - $created) > 600) {
        unset($_SESSION['forgot_pw_user_id'], $_SESSION['forgot_pw_created']);
        jsonResponse(false, 'Session expired. Please request a new code.');
    }

    $input      = json_decode(file_get_contents('php://input'), true) ?: [];
    $otp        = trim($input['otp'] ?? '');
    $newPassword = $input['new_password'] ?? '';
    $confirmPw  = $input['confirm_password'] ?? '';

    $pwError = Auth::validatePasswordStrength($newPassword);
    if ($pwError) {
        jsonResponse(false, $pwError);
    }
    if ($newPassword !== $confirmPw) {
        jsonResponse(false, 'Passwords do not match.');
    }

    $result = PasswordOtpHelper::verifyOnly($userId, $otp);
    if (!$result['ok']) {
        jsonResponse(false, $result['message']);
    }

    try {
        db()->execute(
            "UPDATE users SET password = ?, updated_at = NOW() WHERE users_id = ?",
            [password_hash($newPassword, PASSWORD_DEFAULT), $userId]
        );
    } catch (Exception $e) {
        error_log('verify-forgot-otp: ' . $e->getMessage());
        jsonResponse(false, 'Could not update password. Please try again.', null, 500);
    }

    unset($_SESSION['forgot_pw_user_id'], $_SESSION['forgot_pw_created']);

    try { logActivity($userId, 'password_reset', 'Password reset via forgot-password OTP'); } catch (Exception $e) {}

    jsonResponse(true, 'Password reset successfully. You can now sign in with your new password.');
}

/**
 * ─────────────────────────────────────────────────────────────
 * HELPER: JSON Response
 * ─────────────────────────────────────────────────────────────
 */
function jsonResponse($success, $message, $data = null, $statusCode = 200) {
    http_response_code($statusCode);
    
    $response = [
        'success' => $success,
        'message' => $message
    ];
    
    if ($data !== null) {
        $response['data'] = $data;
    }
    
    echo json_encode($response);
    exit;
}

/**
 * ─────────────────────────────────────────────────────────────
 * HELPER: Log Activity
 * ─────────────────────────────────────────────────────────────
 */
function loginAttemptKey() {
    return 'login_attempts_' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . '|' . ($_SERVER['HTTP_USER_AGENT'] ?? ''));
}

function checkLoginRateLimit() {
    $key = loginAttemptKey();
    $data = $_SESSION[$key] ?? ['count' => 0, 'locked_until' => 0];

    if (time() < ($data['locked_until'] ?? 0)) {
        return false;
    }

    if (($data['count'] ?? 0) >= 5) {
        $_SESSION[$key]['locked_until'] = time() + 60;
        return false;
    }

    return true;
}

function incrementLoginAttempts() {
    $key = loginAttemptKey();
    if (!isset($_SESSION[$key])) {
        $_SESSION[$key] = ['count' => 0, 'locked_until' => 0];
    }
    $_SESSION[$key]['count'] = ($_SESSION[$key]['count'] ?? 0) + 1;
    if ($_SESSION[$key]['count'] >= 5) {
        $_SESSION[$key]['locked_until'] = time() + 60;
    }
}

function resetLoginAttempts() {
    unset($_SESSION[loginAttemptKey()]);
}

function validateLoginCaptcha($answer) {
    $expected = $_SESSION['login_captcha'] ?? null;
    $created  = $_SESSION['login_captcha_time'] ?? 0;

    unset($_SESSION['login_captcha'], $_SESSION['login_captcha_time']);

    if ($expected === null || $answer === '') {
        return false;
    }

    // Captcha expires after 5 minutes
    if (time() - $created > 300) {
        return false;
    }

    return hash_equals((string)$expected, (string)$answer);
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE CHECK ID (step 1 of two-step login)
 * ─────────────────────────────────────────────────────────────
 */
function handleCheckId() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    // Rate-limit ID lookups to prevent mass account enumeration
    $rlKey = 'check_id_rl_' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $rl = $_SESSION[$rlKey] ?? ['count' => 0, 'locked_until' => 0];
    if (time() < ($rl['locked_until'] ?? 0)) {
        usleep(random_int(300000, 600000));
        jsonResponse(false, 'Too many requests. Please wait 60 seconds.', null, 429);
    }
    $rl['count'] = ($rl['count'] ?? 0) + 1;
    if ($rl['count'] >= 10) {
        $rl['locked_until'] = time() + 60;
    }
    $_SESSION[$rlKey] = $rl;

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $userId = trim($input['user_id'] ?? $input['student_id'] ?? '');

    if (empty($userId)) {
        jsonResponse(false, 'Student ID is required');
    }

    $user = UserIdHelper::findUserForLogin($userId);

    if (!$user) {
        usleep(random_int(200000, 400000));
        jsonResponse(false, UserIdHelper::loginIdErrorMessage($userId));
    }

    if ($user['status'] === 'pending') {
        jsonResponse(false, 'Your account is pending activation. Please wait for an administrator to activate your account.');
    }

    if ($user['status'] !== 'active') {
        jsonResponse(false, 'Your account is not active. Please contact the administrator.');
    }

    // First login — no password set yet
    if ($user['password'] === null || $user['password'] === '') {
        jsonResponse(true, 'First login', ['first_login' => true]);
    }

    jsonResponse(true, 'Password required', ['needs_password' => true]);
}

/**
 * ─────────────────────────────────────────────────────────────
 * HANDLE SET FIRST PASSWORD
 * ─────────────────────────────────────────────────────────────
 */
function handleSetFirstPassword() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(false, 'Method not allowed', null, 405);
    }

    // Must be authenticated (just logged in via first-login flow)
    $userId = Auth::id();
    if (!$userId) {
        $jwtUser = JWT::authenticate();
        if ($jwtUser) {
            $userId = $jwtUser['sub'];
        }
    }
    if (!$userId) {
        jsonResponse(false, 'Not authenticated', null, 401);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    // Accept both new_password (from JS) and password (legacy)
    $password = $input['new_password'] ?? $input['password'] ?? '';
    $confirm  = $input['confirm_password'] ?? $input['confirm'] ?? $password;

    $pwError = Auth::validatePasswordStrength($password);
    if ($pwError) {
        jsonResponse(false, $pwError);
    }
    if ($password !== $confirm) {
        jsonResponse(false, 'Passwords do not match.');
    }

    // Ensure this is truly a first-login (no password yet)
    $user = db()->fetchOne("SELECT password, role FROM users WHERE users_id = ?", [$userId]);
    if (!$user) {
        jsonResponse(false, 'User not found.', null, 404);
    }
    if ($user['password'] !== null && $user['password'] !== '') {
        jsonResponse(false, 'Password already set. Use the change-password feature instead.');
    }

    db()->execute(
        "UPDATE users SET password = ?, updated_at = NOW() WHERE users_id = ?",
        [password_hash($password, PASSWORD_DEFAULT), $userId]
    );

    logActivity($userId, 'password_set', 'User set password on first login');

    // Re-establish session so Auth::dashboardUrl() picks the right role
    $fullUser = db()->fetchOne("SELECT * FROM users WHERE users_id = ?", [$userId]);
    if ($fullUser) Auth::login($fullUser);

    jsonResponse(true, 'Password set successfully. Welcome!', [
        'role'     => $user['role'],
        'redirect' => Auth::dashboardUrl(),
    ]);
}

function logActivity($userId, $activityType, $description) {
    try {
        db()->execute(
            "INSERT INTO activity_logs (users_id, activity_type, activity_description, created_at)
             VALUES (?, ?, ?, NOW())",
            [$userId, $activityType, $description]
        );
    } catch (Exception $e) {
        error_log('Activity log error: ' . $e->getMessage());
    }
}