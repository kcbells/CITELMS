<?php
/**
 * ============================================================
 * CIT-LMS Database Connection
 * ============================================================
 * This file handles the database connection using PDO.
 * Uses Singleton pattern to ensure only one connection exists.
 * 
 * Usage:
 *   require_once 'config/database.php';
 *   $pdo = Database::getInstance()->getConnection();
 *   
 *   // Or use the helper function:
 *   $pdo = db();
 * ============================================================
 */

// Load .env file (safe to call multiple times)
require_once __DIR__ . '/env.php';

// Database credentials — reads from .env, falls back to database.local.php, then hardcoded defaults.
// The root/empty-password fallback below is only safe for local dev (XAMPP/Laragon default
// install). Refuse to boot rather than silently connecting as root with no password if this
// is ever actually deployed with APP_ENV=production and the real credentials weren't set —
// a misconfigured production deploy should fail loudly, not fall back to a dev default.
if (getenv('APP_ENV') === 'production' && (getenv('DB_USER') === false || getenv('DB_PASS') === false)) {
    http_response_code(500);
    error_log('FATAL: APP_ENV=production but DB_USER/DB_PASS are not set — refusing to fall back to the root/empty-password dev default.');
    header('Content-Type: application/json');
    die(json_encode(['success' => false, 'message' => 'Server misconfigured. Contact the administrator.']));
}

$dbHost = getenv('DB_HOST') ?: '127.0.0.1';
$dbName = getenv('DB_NAME') ?: 'cit_lms';
$dbUser = getenv('DB_USER') ?: 'root';
$dbPass = getenv('DB_PASS') !== false ? getenv('DB_PASS') : '';
$dbPort = (int)(getenv('DB_PORT') ?: 3306);

// Legacy local override (still supported for InfinityFree / backwards compat)
$dbLocal = __DIR__ . '/database.local.php';
if (is_readable($dbLocal)) {
    require $dbLocal;
}

define('DB_HOST',    $dbHost);
define('DB_NAME',    $dbName);
define('DB_USER',    $dbUser);
define('DB_PASS',    $dbPass);
define('DB_CHARSET', 'utf8mb4');
define('DB_PORT',    (int)$dbPort);

/**
 * Database Class
 * Singleton pattern ensures only one database connection
 */
class Database {
    
    // Single instance of the class
    private static $instance = null;
    
    // PDO connection object
    private $pdo;
    
    /**
     * Private constructor - prevents direct instantiation
     * Creates the database connection
     */
    private function __construct() {
        try {
            // Build DSN (Data Source Name)
            // Fast-fail connection attempts so login doesn't hang for minutes.
            // Try common XAMPP ports automatically (3306, 3307, 3308).
            $ports = [DB_PORT, 3307, 3308];
            $ports = array_values(array_unique(array_filter($ports, fn($p) => is_numeric($p) && (int)$p > 0)));

            // PDO Options for better performance and security
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,    // Throw exceptions on errors
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,          // Return associative arrays
                PDO::ATTR_EMULATE_PREPARES   => false,                     // Use real prepared statements
                PDO::ATTR_PERSISTENT         => false,                     // Don't use persistent connections
                PDO::ATTR_TIMEOUT            => 5,                         // Fail fast if DB is unreachable
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];

            $lastError = null;
            $hosts = array_values(array_unique([DB_HOST, '127.0.0.1', 'localhost']));
            foreach ($hosts as $host) {
                foreach ($ports as $port) {
                    try {
                        $dsn = "mysql:host=" . $host . ";port=" . (int)$port . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
                        $this->pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
                        return;
                    } catch (PDOException $e) {
                        $lastError = $e;
                        // Wrong DB name or credentials — retrying other ports won't help.
                        $code = (int)($e->errorInfo[1] ?? 0);
                        if (in_array($code, [1045, 1049], true)) {
                            break 2;
                        }
                    }
                }
            }

            if ($lastError) {
                throw $lastError;
            }
            
        } catch (PDOException $e) {
            // Log error and show user-friendly message
            error_log("Database Connection Error: " . $e->getMessage());

            $isApi = (strpos($_SERVER['SCRIPT_NAME'] ?? '', '/api/') !== false)
                || (strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false);
            if ($isApi && !headers_sent()) {
                header('Content-Type: application/json');
                http_response_code(503);
                $msg = 'Database unavailable. Please ensure MySQL is running in XAMPP.';
                if (defined('DEBUG_MODE') && DEBUG_MODE) {
                    $msg = 'Database connection failed: ' . $e->getMessage();
                }
                echo json_encode(['success' => false, 'message' => $msg]);
                exit;
            }

            // Show detailed error in development mode
            if (defined('DEBUG_MODE') && DEBUG_MODE) {
                die("Database connection failed: " . $e->getMessage() . "<br><br>Please check:<br>1. MySQL is running in XAMPP<br>2. Database '" . DB_NAME . "' exists<br>3. Import the SQL file from database/cit_lms.sql");
            }

            die("Database connection failed. Please try again later.");
        }
    }
    
    /**
     * Prevent cloning of the instance
     */
    private function __clone() {}
    
    /**
     * Prevent unserialization of the instance
     */
    public function __wakeup() {
        throw new Exception("Cannot unserialize singleton");
    }
    
    /**
     * Get the single instance of the Database class
     * Creates instance if it doesn't exist
     * 
     * @return Database
     */
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Get the PDO connection object
     * 
     * @return PDO
     */
    public function getConnection() {
        return $this->pdo;
    }
    
    /**
     * Execute a SELECT query and return all results
     * 
     * @param string $sql - SQL query with placeholders
     * @param array $params - Parameters to bind
     * @return array - Array of results
     */
    /**
     * Prepared-statement cache, keyed by SQL text.
     *
     * PDO runs with ATTR_EMULATE_PREPARES => false, so every prepare() is a
     * real round trip to MySQL. Re-preparing the same SQL on every call was
     * costing roughly half the time of each query — measured at 0.65 ms/query
     * re-prepared vs 0.32 ms reused. That doubles up across the ~15-25 queries
     * a single bulk-import row runs.
     *
     * Safe because the statement is always re-executed with fresh parameters,
     * and callers that don't drain the result set call closeCursor() below.
     */
    private $stmtCache = [];

    private function prepareCached($sql) {
        if (!isset($this->stmtCache[$sql])) {
            $this->stmtCache[$sql] = $this->pdo->prepare($sql);
        }
        return $this->stmtCache[$sql];
    }

    public function fetchAll($sql, $params = []) {
        try {
            $stmt = $this->prepareCached($sql);
            $stmt->execute($params);
            return $stmt->fetchAll();
        } catch (PDOException $e) {
            error_log("Query Error: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * Execute a SELECT query and return single result
     * 
     * @param string $sql - SQL query with placeholders
     * @param array $params - Parameters to bind
     * @return array|null - Single row or null
     */
    public function fetchOne($sql, $params = []) {
        try {
            $stmt = $this->prepareCached($sql);
            $stmt->execute($params);
            $row = $stmt->fetch();
            // Only one row was taken, so the result set may still be open —
            // it must be released before this cached statement is reused.
            $stmt->closeCursor();
            return $row;
        } catch (PDOException $e) {
            error_log("Query Error: " . $e->getMessage());
            return null;
        }
    }
    
    /**
     * Execute an INSERT, UPDATE, or DELETE query
     * 
     * @param string $sql - SQL query with placeholders
     * @param array $params - Parameters to bind
     * @return bool - Success or failure
     */
    public function execute($sql, $params = []) {
        try {
            $stmt = $this->prepareCached($sql);
            $ok = $stmt->execute($params);
            $stmt->closeCursor();
            return $ok;
        } catch (PDOException $e) {
            error_log("Query Error: " . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Get the last inserted ID
     * 
     * @return string - Last insert ID
     */
    public function lastInsertId() {
        return $this->pdo->lastInsertId();
    }
    
    /**
     * Begin a transaction
     */
    public function beginTransaction() {
        return $this->pdo->beginTransaction();
    }
    
    /**
     * Commit a transaction
     */
    public function commit() {
        return $this->pdo->commit();
    }
    
    /**
     * Rollback a transaction
     */
    public function rollback() {
        return $this->pdo->rollBack();
    }
}

/**
 * Helper function to get database connection quickly
 * 
 * Usage:
 *   $users = db()->fetchAll("SELECT * FROM users");
 *   $user = db()->fetchOne("SELECT * FROM users WHERE users_id = ?", [1]);
 * 
 * @return Database
 */
function db() {
    return Database::getInstance();
}

/**
 * Helper function to get PDO connection directly
 * 
 * Usage:
 *   $stmt = pdo()->prepare("SELECT * FROM users");
 * 
 * @return PDO
 */
function pdo() {
    return Database::getInstance()->getConnection();
}

// ── Rate limiting — disabled ────────────────────────────────────
// Was applied to every API request automatically and caused "Too many
// requests" errors during normal use. Turned off; RateLimiter.php is left
// in place in case rate limiting is wanted again later.