<?php
/**
 * Database Backup API — admin only.
 *
 * Writes a full .sql dump of the database to storage/backups (that folder is
 * blocked from the web by the root .htaccess, so a backup can only be fetched
 * through the authenticated download action below).
 *
 * Actions:
 *   GET  ?action=list                 — the backups on disk, newest first
 *   POST ?action=create               — take a new backup now
 *   GET  ?action=download&file=NAME   — stream one backup to the browser
 *   POST ?action=delete               — {file} delete one backup
 *
 * mysqldump is used when it can be found (fast, complete). If it is missing or
 * fails, the dump is written in PHP instead so a backup is always possible.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/auth.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}
if (Auth::role() !== 'admin') {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Only an administrator can manage database backups.']);
    exit;
}

/** Keep this many backups; older ones are deleted after a new backup succeeds. */
const BACKUP_KEEP = 10;

$action = $_GET['action'] ?? 'list';

switch ($action) {
    case 'list':     handleList();     break;
    case 'create':   handleCreate();   break;
    case 'download': handleDownload(); break;
    case 'delete':   handleDelete();   break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function backupDir(): string
{
    $dir = __DIR__ . '/../storage/backups';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    return $dir;
}

/** Only ever touch files we created: coc-backup-YYYY-mm-dd_His.sql */
function safeBackupPath(string $name): ?string
{
    if (!preg_match('/^coc-backup-[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.sql$/', $name)) return null;
    $path = backupDir() . '/' . $name;
    return is_file($path) ? $path : null;
}

function dbSettings(): array
{
    return [
        'host' => envValue('DB_HOST') ?: '127.0.0.1',
        'name' => envValue('DB_NAME') ?: 'cit_lms',
        'user' => envValue('DB_USER') ?: 'root',
        'pass' => envValue('DB_PASS') !== false ? envValue('DB_PASS') : '',
    ];
}

/** Where mysqldump lives on this machine, or null if we cannot find it. */
function findMysqldump(): ?string
{
    $candidates = [
        envValue('MYSQLDUMP_PATH') ?: '',
        'C:/xampp_nen/mysql/bin/mysqldump.exe',
        'C:/xampp/mysql/bin/mysqldump.exe',
        '/usr/bin/mysqldump',
        '/usr/local/bin/mysqldump',
    ];
    foreach ($candidates as $c) {
        if ($c !== '' && is_file($c)) return $c;
    }
    return null;
}

// ─── List ─────────────────────────────────────────────────────────────────────

function handleList(): void
{
    $files = [];
    foreach (glob(backupDir() . '/coc-backup-*.sql') ?: [] as $path) {
        $files[] = [
            'file'       => basename($path),
            'size_bytes' => filesize($path) ?: 0,
            'created_at' => date('Y-m-d H:i:s', filemtime($path)),
        ];
    }
    usort($files, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));

    echo json_encode(['success' => true, 'data' => [
        'backups' => $files,
        'keep'    => BACKUP_KEEP,
        // which tool actually ran is reported by create(); this only says
        // whether mysqldump exists on the machine at all
        'mysqldump_found' => findMysqldump() !== null,
    ]]);
}

// ─── Create ───────────────────────────────────────────────────────────────────

function handleCreate(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }

    $name = 'coc-backup-' . date('Y-m-d_His') . '.sql';
    $path = backupDir() . '/' . $name;
    $started = microtime(true);

    $dump = findMysqldump();
    $usedFallback = false;
    $error = '';

    if ($dump) {
        $db = dbSettings();
        // The password goes in a temp defaults file, never on the command line
        // (a command line is readable by other processes on the machine).
        $cnf = tempnam(sys_get_temp_dir(), 'cocbk');
        file_put_contents($cnf, "[client]\nuser=\"{$db['user']}\"\npassword=\"{$db['pass']}\"\nhost=\"{$db['host']}\"\n");
        $cmd = escapeshellarg($dump)
            . ' --defaults-extra-file=' . escapeshellarg($cnf)
            . ' --single-transaction --quick --routines --events --add-drop-table --default-character-set=utf8mb4 '
            . escapeshellarg($db['name'])
            . ' > ' . escapeshellarg($path) . ' 2>&1';
        @exec($cmd, $out, $code);
        @unlink($cnf);
        if ($code !== 0 || !is_file($path) || filesize($path) < 100) {
            $error = trim(implode(' ', array_slice($out ?: [], 0, 3)));
            @unlink($path);
            $usedFallback = true;
        }
    } else {
        $usedFallback = true;
    }

    if ($usedFallback) {
        try {
            phpDump($path);
        } catch (Throwable $e) {
            @unlink($path);
            error_log('BackupAPI: ' . $e->getMessage());
            echo json_encode(['success' => false, 'message' => 'Could not create the backup. ' . ($error ?: $e->getMessage())]);
            return;
        }
    }

    $removed = pruneOldBackups();

    echo json_encode(['success' => true, 'message' => 'Backup created', 'data' => [
        'file'       => $name,
        'size_bytes' => filesize($path) ?: 0,
        'created_at' => date('Y-m-d H:i:s'),
        'seconds'    => round(microtime(true) - $started, 1),
        'method'     => $usedFallback ? 'php' : 'mysqldump',
        'pruned'     => $removed,
    ]]);
}

/** Straight PHP dump — used when mysqldump is unavailable. */
function phpDump(string $path): void
{
    $db = dbSettings();
    $fh = fopen($path, 'w');
    if (!$fh) throw new Exception('Cannot write to the backups folder.');

    fwrite($fh, "-- COC-LMS database backup\n-- Database: {$db['name']}\n-- Taken: " . date('Y-m-d H:i:s') . "\n\n");
    fwrite($fh, "SET FOREIGN_KEY_CHECKS=0;\nSET NAMES utf8mb4;\n\n");

    foreach (db()->fetchAll('SHOW TABLES') as $row) {
        $table = array_values($row)[0];
        $create = db()->fetchOne('SHOW CREATE TABLE `' . $table . '`');
        // A view has no rows of its own — recreate it and move on.
        if (isset($create['Create View'])) {
            fwrite($fh, "DROP VIEW IF EXISTS `$table`;\n" . $create['Create View'] . ";\n\n");
            continue;
        }
        $ddl = $create['Create Table'] ?? null;
        if (!$ddl) continue;

        fwrite($fh, "DROP TABLE IF EXISTS `$table`;\n$ddl;\n\n");

        $stmt = pdo()->query('SELECT * FROM `' . $table . '`');
        $batch = [];
        $colSql = '';
        while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if ($colSql === '') {
                $colSql = '(' . implode(',', array_map(fn($c) => '`' . $c . '`', array_keys($r))) . ')';
            }
            $vals = array_map(function ($v) {
                if ($v === null) return 'NULL';
                $v = (string)$v;
                // files and other binary columns cannot be written as text
                if ($v !== '' && !mb_check_encoding($v, 'UTF-8')) return '0x' . bin2hex($v);
                return pdo()->quote($v);
            }, array_values($r));
            $batch[] = '(' . implode(',', $vals) . ')';
            // group rows: one statement per row makes restoring very slow
            if (count($batch) >= 200) {
                fwrite($fh, "INSERT INTO `$table` $colSql VALUES " . implode(',', $batch) . ";\n");
                $batch = [];
            }
        }
        if ($batch) {
            fwrite($fh, "INSERT INTO `$table` $colSql VALUES " . implode(',', $batch) . ";\n");
        }
        $stmt->closeCursor();
        fwrite($fh, "\n");
    }

    fwrite($fh, "SET FOREIGN_KEY_CHECKS=1;\n");
    fclose($fh);
}

/** Deletes everything past the newest BACKUP_KEEP files. Returns how many went. */
function pruneOldBackups(): int
{
    $files = glob(backupDir() . '/coc-backup-*.sql') ?: [];
    if (count($files) <= BACKUP_KEEP) return 0;
    usort($files, fn($a, $b) => filemtime($b) <=> filemtime($a));
    $removed = 0;
    foreach (array_slice($files, BACKUP_KEEP) as $old) {
        if (@unlink($old)) $removed++;
    }
    return $removed;
}

// ─── Download ─────────────────────────────────────────────────────────────────

function handleDownload(): void
{
    $path = safeBackupPath((string)($_GET['file'] ?? ''));
    if (!$path) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Backup not found']);
        return;
    }

    header_remove('Content-Type');
    header('Content-Type: application/sql');
    header('Content-Disposition: attachment; filename="' . basename($path) . '"');
    header('Content-Length: ' . filesize($path));
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

function handleDelete(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['success' => false, 'message' => 'POST required']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $path = safeBackupPath((string)($input['file'] ?? ''));
    if (!$path) {
        echo json_encode(['success' => false, 'message' => 'Backup not found']);
        return;
    }
    if (!@unlink($path)) {
        echo json_encode(['success' => false, 'message' => 'Could not delete that backup file.']);
        return;
    }
    echo json_encode(['success' => true, 'message' => 'Backup deleted']);
}
