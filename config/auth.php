<?php
/**
 * ============================================================
 * CIT-LMS Authentication & Session Management
 * ============================================================
 * Handles user authentication, sessions, and access control.
 * 
 * Usage:
 *   require_once 'config/auth.php';
 *   
 *   // Check if logged in
 *   if (Auth::check()) { ... }
 *   
 *   // Require login (redirects if not logged in)
 *   Auth::requireLogin();
 *   
 *   // Require specific role
 *   Auth::requireRole('admin');
 *   Auth::requireRole(['admin', 'instructor']);
 * ============================================================
 */

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    // Session configuration
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
             || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
             || (($_SERVER['SERVER_PORT'] ?? 80) == 443);
    ini_set('session.cookie_httponly', 1);      // Prevent JavaScript access to session cookie
    ini_set('session.use_only_cookies', 1);     // Only use cookies for sessions
    ini_set('session.cookie_secure', $isHttps ? 1 : 0); // Auto-detects HTTP vs HTTPS
    ini_set('session.cookie_samesite', 'Lax');  // Prevents CSRF via cross-site form submissions
    ini_set('session.gc_maxlifetime', 7200);    // Session lifetime: 2 hours
    
    session_start();
}

// Include constants for BASE_URL
require_once __DIR__ . '/constants.php';

/**
 * Auth Class
 * Handles all authentication-related functions
 */
class Auth {
    
    /**
     * Check if user is logged in
     * 
     * @return bool
     */
    public static function check() {
        return isset($_SESSION['user_id']) && !empty($_SESSION['user_id']);
    }
    
    /**
     * Alias for check()
     * 
     * @return bool
     */
    public static function isLoggedIn() {
        return self::check();
    }
    
    /**
     * Get current user's ID
     * 
     * @return int|null
     */
    public static function id() {
        return $_SESSION['user_id'] ?? null;
    }
    
    /**
     * Alias for id()
     * 
     * @return int|null
     */
    public static function userId() {
        return self::id();
    }
    
    /**
     * Get current user's role
     * 
     * @return string|null
     */
    public static function role() {
        return $_SESSION['user_role'] ?? null;
    }
    
    /**
     * Alias for role()
     * 
     * @return string|null
     */
    public static function userRole() {
        return self::role();
    }
    
    /**
     * Get current user's full name
     * 
     * @return string
     */
    public static function name() {
        return $_SESSION['user_name'] ?? 'Guest';
    }
    
    /**
     * Alias for name()
     * 
     * @return string
     */
    public static function userName() {
        return self::name();
    }
    
    /**
     * Get current user's email
     * 
     * @return string|null
     */
    public static function email() {
        return $_SESSION['user_email'] ?? null;
    }
    
    /**
     * Get current user's profile image
     * 
     * @return string
     */
    public static function avatar() {
        return BASE_URL . '/assets/images/default-avatar.svg';
    }
    
    /**
     * Get all user session data
     *
     * @return array
     */
    public static function user() {
        if (!self::check()) {
            return null;
        }

        return [
            'id'          => $_SESSION['user_id'],
            'users_id'    => $_SESSION['user_id'],
            'name'        => $_SESSION['user_name'],
            'first_name'  => $_SESSION['first_name'] ?? '',
            'last_name'   => $_SESSION['last_name'] ?? '',
            'email'       => $_SESSION['user_email'],
            'role'        => $_SESSION['user_role'],
            'student_id'  => $_SESSION['student_id'] ?? null,
            'employee_id' => $_SESSION['employee_id'] ?? null,
            'avatar'      => self::avatar()
        ];
    }
    
    /**
     * Log in a user (store user data in session)
     *
     * @param array $user - User data from database
     * @return bool
     */
    public static function login($user) {
        if (empty($user) || !isset($user['users_id'])) {
            return false;
        }

        // Regenerate session ID to prevent session fixation
        session_regenerate_id(true);

        // Store user data in session
        $_SESSION['user_id'] = $user['users_id'];
        $_SESSION['user_name'] = trim($user['first_name'] . ' ' . $user['last_name']);
        $_SESSION['first_name'] = $user['first_name'];
        $_SESSION['last_name'] = $user['last_name'];
        $_SESSION['user_email'] = $user['email'];
        $_SESSION['user_role'] = $user['role'];
        $_SESSION['login_time'] = time();
        $_SESSION['last_activity'] = time();

        // Store additional useful data
        $_SESSION['employee_id'] = $user['employee_id'] ?? null;
        $_SESSION['student_id'] = $user['student_id'] ?? null;
        $_SESSION['department_id'] = $user['department_id'] ?? null;
        $_SESSION['program_id'] = $user['program_id'] ?? null;

        // Load RBAC permissions for this role into session
        self::loadPermissions($user['role']);

        // One active browser tab per login
        self::issueTabLease();

        return true;
    }

    /**
     * Issue a new tab lease (invalidates other tabs on next API call).
     *
     * @return string
     */
    public static function issueTabLease() {
        $lease = bin2hex(random_bytes(16));
        $_SESSION['tab_lease'] = $lease;
        return $lease;
    }

    /**
     * Claim the active tab lease for this browser session.
     *
     * @param string $lease
     * @return string
     */
    public static function claimTabLease($lease) {
        $lease = trim($lease);
        if ($lease === '' || strlen($lease) < 16) {
            $lease = bin2hex(random_bytes(16));
        }
        $_SESSION['tab_lease'] = $lease;
        return $lease;
    }

    /**
     * Get the current tab lease stored in session.
     *
     * @return string|null
     */
    public static function tabLease() {
        return $_SESSION['tab_lease'] ?? null;
    }

    /**
     * Reject API calls when another tab has claimed the session.
     */
    public static function rejectIfTabLeaseInvalid() {
        if (!self::check() || empty($_SESSION['tab_lease'])) {
            return;
        }

        $header = $_SERVER['HTTP_X_TAB_LEASE'] ?? '';
        if ($header === '') {
            return;
        }

        if (!hash_equals($_SESSION['tab_lease'], $header)) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false,
                'message' => 'You were signed out because this account is active in another tab.',
                'code'    => 'SESSION_SUPERSEDED',
            ]);
            exit;
        }
    }

    // ----------------------------------------------------------------
    // RBAC – Permission helpers
    // ----------------------------------------------------------------

    /**
     * Load all permissions for the given role from the database
     * and cache them in the session.
     *
     * @param string $role
     */
    public static function loadPermissions($role) {
        try {
            require_once __DIR__ . '/database.php';
            $pdo = Database::getInstance()->getConnection();
            $stmt = $pdo->prepare(
                'SELECT p.name
                 FROM role_permissions rp
                 JOIN permissions p ON p.id = rp.permission_id
                 WHERE rp.role = ?'
            );
            $stmt->execute([$role]);
            $_SESSION['permissions'] = $stmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (Exception $e) {
            // Table may not exist yet — fall back to empty set
            $_SESSION['permissions'] = [];
        }
    }

    /**
     * Re-load the current user's permissions (useful after an admin
     * changes role permissions in the same session).
     */
    public static function refreshPermissions() {
        $role = self::role();
        if ($role) {
            self::loadPermissions($role);
        }
    }

    /**
     * Get all permission slugs for the current user.
     *
     * @return array
     */
    public static function permissions() {
        if (!isset($_SESSION['permissions'])) {
            self::loadPermissions(self::role());
        }
        return $_SESSION['permissions'] ?? [];
    }

    /**
     * Check if the current user has a specific permission.
     *
     * @param string $permission  e.g. 'users.create'
     * @return bool
     */
    public static function can($permission) {
        if (!self::check()) {
            return false;
        }
        return in_array($permission, self::permissions());
    }

    /**
     * Require the current user to have a permission.
     * Returns a 403 JSON response if they don't (API-friendly).
     *
     * @param string $permission
     */
    public static function requirePermission($permission) {
        self::requireLogin();
        if (!self::can($permission)) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false,
                'message' => "Permission denied: {$permission}"
            ]);
            exit;
        }
    }
    
    /**
     * Log out the current user
     */
    public static function logout() {
        // Clear all session data
        $_SESSION = [];
        
        // Delete the session cookie
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params["path"],
                $params["domain"],
                $params["secure"],
                $params["httponly"]
            );
        }
        
        // Destroy the session
        session_destroy();
    }
    
    /**
     * Require user to be logged in
     * Redirects to login page if not authenticated
     * 
     * @param string|null $redirectUrl - URL to redirect after login
     */
    public static function requireLogin($redirectUrl = null) {
        if (!self::check()) {
            // Store intended URL for redirect after login
            if ($redirectUrl) {
                $_SESSION['intended_url'] = $redirectUrl;
            } else {
                $_SESSION['intended_url'] = $_SERVER['REQUEST_URI'] ?? '';
            }
            
            header('Location: ' . BASE_URL . '/pages/auth/login.php');
            exit;
        }
        
        // Check session timeout (2 hours of inactivity)
        if (isset($_SESSION['last_activity']) && (time() - $_SESSION['last_activity'] > 7200)) {
            self::logout();
            header('Location: ' . BASE_URL . '/pages/auth/login.php?timeout=1');
            exit;
        }
        
        // Update last activity time
        $_SESSION['last_activity'] = time();
    }
    
    /**
     * Require user to have a specific role
     * Redirects to unauthorized page if role doesn't match
     * 
     * @param string|array $roles - Required role(s)
     */
    public static function requireRole($roles) {
        // First, make sure user is logged in
        self::requireLogin();
        
        // Convert string to array for consistency
        if (!is_array($roles)) {
            $roles = [$roles];
        }
        
        // Check if user's role matches any required role
        if (!in_array(self::role(), $roles)) {
            header('Location: ' . BASE_URL . '/pages/shared/unauthorized.php');
            exit;
        }
    }
    
    /**
     * Check if current user has a specific role
     * 
     * @param string|array $roles - Role(s) to check
     * @return bool
     */
    public static function hasRole($roles) {
        if (!self::check()) {
            return false;
        }
        
        if (!is_array($roles)) {
            $roles = [$roles];
        }
        
        return in_array(self::role(), $roles);
    }
    
    /**
     * Check if user is admin
     * 
     * @return bool
     */
    public static function isAdmin() {
        return self::hasRole('admin');
    }
    
    /**
     * Check if user is instructor
     * 
     * @return bool
     */
    public static function isInstructor() {
        return self::hasRole('instructor');
    }
    
    /**
     * Check if user is student
     * 
     * @return bool
     */
    public static function isStudent() {
        return self::hasRole('student');
    }
    
    /**
     * Check if user is dean
     * 
     * @return bool
     */
    public static function isDean() {
        return self::hasRole('dean');
    }
    
    /**
     * Get the intended URL (where user wanted to go before login)
     * 
     * @return string|null
     */
    public static function intendedUrl() {
        $url = $_SESSION['intended_url'] ?? null;
        unset($_SESSION['intended_url']);
        return $url;
    }
    
    /**
     * Get redirect URL based on user role
     * 
     * @return string
     */
    public static function dashboardUrl() {
        $role = self::role();
        if (!$role) {
            return BASE_URL . '/index.html';
        }
        return BASE_URL . '/app/dashboard.html#' . $role . '/dashboard';
    }
    
    /**
     * Hash a password
     * 
     * @param string $password - Plain text password
     * @return string - Hashed password
     */
    public static function hashPassword($password) {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    /**
     * Validate password meets security requirements (NIST SP 800-63B / OWASP).
     * Returns null on success, or an error string describing the first failed rule.
     *
     * Rules:
     *   - 8–128 characters
     *   - At least one uppercase letter
     *   - At least one lowercase letter
     *   - At least one digit
     *   - At least one special character
     */
    public static function validatePasswordStrength(string $password): ?string {
        $len = strlen($password);
        if ($len < 8)   return 'Password must be at least 8 characters.';
        if ($len > 128) return 'Password must not exceed 128 characters.';
        if (!preg_match('/[A-Z]/', $password)) return 'Password must contain at least one uppercase letter.';
        if (!preg_match('/[a-z]/', $password)) return 'Password must contain at least one lowercase letter.';
        if (!preg_match('/[0-9]/', $password)) return 'Password must contain at least one number.';
        if (!preg_match('/[^A-Za-z0-9]/', $password)) return 'Password must contain at least one special character (e.g. !@#$%).';
        return null;
    }
    
    /**
     * Verify a password against hash
     * 
     * @param string $password - Plain text password
     * @param string $hash - Hashed password from database
     * @return bool
     */
    public static function verifyPassword($password, $hash) {
        return password_verify($password, $hash);
    }
    
    /**
     * Generate a random token (for password reset, etc.)
     * 
     * @param int $length - Token length
     * @return string
     */
    public static function generateToken($length = 64) {
        return bin2hex(random_bytes($length / 2));
    }
    
    /**
     * Get CSRF token (creates one if doesn't exist)
     * 
     * @return string
     */
    public static function csrfToken() {
        if (!isset($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = self::generateToken(32);
        }
        return $_SESSION['csrf_token'];
    }
    
    /**
     * Verify CSRF token
     * 
     * @param string $token - Token to verify
     * @return bool
     */
    public static function verifyCsrfToken($token) {
        return isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
    }
    
    /**
     * Get CSRF hidden input field
     * 
     * @return string - HTML input field
     */
    public static function csrfField() {
        return '<input type="hidden" name="csrf_token" value="' . self::csrfToken() . '">';
    }
}

// Enforce single-tab sessions on JSON API routes (skip public auth actions).
if (php_sapi_name() !== 'cli') {
    $script = $_SERVER['SCRIPT_NAME'] ?? '';
    $isApi  = str_contains($script, '/api/');
    $action = $_GET['action'] ?? '';
    $skipTabLease = !$isApi || in_array($action, [
        'login', 'register', 'captcha', 'signup-catalog', 'claim-tab', 'logout', 'check',
    ], true);

    if (!$skipTabLease) {
        Auth::rejectIfTabLeaseInvalid();
    }
}