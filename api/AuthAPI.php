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

// Headers for JSON API
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Load config files
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/helpers/SignupCatalogHelper.php';
require_once __DIR__ . '/helpers/UserIdHelper.php';
require_once __DIR__ . '/helpers/PasswordOtpHelper.php';
require_once __DIR__ . '/../config/email.php';

// Allow JWT via Authorization header for API actions
header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tab-Lease');

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
    $fullName    = trim($input['full_name'] ?? '');
    $email       = trim($input['email'] ?? '');
    $password    = $input['password'] ?? '';
    $programCode = trim($input['program_code'] ?? '');
    $major       = trim($input['major'] ?? '');

    if ($studentId === '' || $fullName === '' || $email === '' || $password === '' || $programCode === '') {
        incrementLoginAttempts();
        jsonResponse(false, 'Student ID, full name, email, password, and course are required.');
    }

    if (!UserIdHelper::isValidStudentId($studentId)) {
        incrementLoginAttempts();
        jsonResponse(false, 'Student ID must contain numbers only (no letters). Example: 02-2324-08200');
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        incrementLoginAttempts();
        jsonResponse(false, 'Please enter a valid email address.');
    }

    if (strlen($password) < 6) {
        incrementLoginAttempts();
        jsonResponse(false, 'Password must be at least 6 characters.');
    }

    if (strlen($password) > 128) {
        incrementLoginAttempts();
        jsonResponse(false, 'Password is too long.');
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

        pdo()->prepare(
            "INSERT INTO users (
                first_name, last_name, email, password, role, status,
                department_id, program_id, major, student_id, created_at, updated_at
             ) VALUES (?, ?, ?, ?, 'student', 'active', ?, ?, ?, ?, NOW(), NOW())"
        )->execute([
            $firstName,
            $lastName,
            $email,
            password_hash($password, PASSWORD_DEFAULT),
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

        jsonResponse(true, 'Account created successfully. You can now sign in with your Student ID.', [
            'user' => [
                'id'           => $userId,
                'student_id'   => $studentId,
                'name'         => trim($firstName . ' ' . $lastName),
                'email'        => $email,
                'department'   => $resolved['department_name'],
                'program'      => $resolved['program_name'],
                'major'        => $resolved['major'],
            ],
        ]);
    } catch (InvalidArgumentException $e) {
        incrementLoginAttempts();
        jsonResponse(false, $e->getMessage());
    } catch (Exception $e) {
        error_log('register: ' . $e->getMessage());
        incrementLoginAttempts();
        jsonResponse(false, 'Registration failed. Please try again.', null, 500);
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
        jsonResponse(false, 'Too many login attempts. Please wait 5 minutes and try again.', null, 429);
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

    if (empty($password)) {
        incrementLoginAttempts();
        jsonResponse(false, 'Password is required');
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
        
        // Check if user is active
        if ($user['status'] !== 'active') {
            incrementLoginAttempts();
            logActivity($user['users_id'], 'login_blocked', 'Login blocked - account not active');
            jsonResponse(false, 'Your account is not active. Please contact administrator.');
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
    // Log the logout
    if (Auth::check()) {
        logActivity(Auth::id(), 'logout', 'User logged out');
    }
    
    // Destroy session
    Auth::logout();
    
    jsonResponse(true, 'Logged out successfully', [
        'redirect' => BASE_URL . '/pages/auth/login.php'
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
                u.major,
                u.year_level,
                u.created_at,
                d.department_name,
                p.program_name,
                p.program_code
            FROM users u
            LEFT JOIN department d ON u.department_id = d.department_id
            LEFT JOIN program p ON u.program_id = p.program_id
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
    $firstName = trim($input['first_name'] ?? '');
    $lastName = trim($input['last_name'] ?? '');
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

    if (strlen($newPassword) < 6) {
        jsonResponse(false, 'New password must be at least 6 characters');
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

        $ttl = (int)($result['expires_in'] ?? 60);
        $msg = 'A 6-digit verification code was sent to ' . maskEmail($user['email'])
            . '. Enter it within ' . ($ttl >= 60 ? '1 minute' : $ttl . ' seconds') . ' to confirm your new password.';
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
        $_SESSION[$key]['locked_until'] = time() + 300;
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
        $_SESSION[$key]['locked_until'] = time() + 300;
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

function logActivity($userId, $activityType, $description) {
    try {
        db()->execute(
            "INSERT INTO activity_logs (users_id, activity_type, activity_description, ip_address, created_at) 
             VALUES (?, ?, ?, ?, NOW())",
            [
                $userId,
                $activityType,
                $description,
                $_SERVER['REMOTE_ADDR'] ?? 'unknown'
            ]
        );
    } catch (Exception $e) {
        error_log('Activity log error: ' . $e->getMessage());
    }
}