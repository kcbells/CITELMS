<?php
/**
 * ============================================================
 * RBAC API  –  Role-Permission Management
 * ============================================================
 * Actions (all require auth):
 *   GET  ?action=permissions          – all permissions grouped by module
 *   GET  ?action=role-permissions     – permissions for one role (&role=admin)
 *   GET  ?action=matrix               – full role × permission matrix (admin)
 *   GET  ?action=my-permissions       – current user's permission slugs
 *   POST ?action=update-role          – save permissions for a role (admin)
 * ============================================================
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/auth.php';
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json');

if (!Auth::check()) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$pdo    = Database::getInstance()->getConnection();
$action = $_GET['action'] ?? '';

// ----------------------------------------------------------------
// Route
// ----------------------------------------------------------------
switch ($action) {

    // All permissions grouped by module
    case 'permissions':
        try {
            $rows = $pdo->query(
                'SELECT id, name, description, module FROM permissions ORDER BY module, name'
            )->fetchAll(PDO::FETCH_ASSOC);

            $grouped = [];
            foreach ($rows as $r) {
                $grouped[$r['module']][] = $r;
            }
            echo json_encode(['success' => true, 'data' => $grouped]);
        } catch (Exception $e) {
            error_log('[RBACApi.php] ' . $e->getMessage()); echo json_encode(['success' => false, 'message' => 'An internal error occurred.']);
        }
        break;

    // Permissions granted to a specific role (admin-only — exposes permission structure)
    case 'role-permissions':
        if (!Auth::can('rbac.view')) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Permission denied']);
            break;
        }
        $role = $_GET['role'] ?? '';
        if (!in_array($role, ['admin', 'dean', 'instructor', 'student'])) {
            echo json_encode(['success' => false, 'message' => 'Invalid role']);
            break;
        }
        try {
            $stmt = $pdo->prepare(
                'SELECT p.id, p.name, p.description, p.module
                 FROM role_permissions rp
                 JOIN permissions p ON p.id = rp.permission_id
                 WHERE rp.role = ?
                 ORDER BY p.module, p.name'
            );
            $stmt->execute([$role]);
            echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        } catch (Exception $e) {
            error_log('[RBACApi.php] ' . $e->getMessage()); echo json_encode(['success' => false, 'message' => 'An internal error occurred.']);
        }
        break;

    // Full matrix: { role → [permission_name, ...] }
    case 'matrix':
        if (!Auth::can('rbac.view')) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Permission denied']);
            break;
        }
        try {
            $perms = $pdo->query(
                'SELECT id, name, description, module FROM permissions ORDER BY module, name'
            )->fetchAll(PDO::FETCH_ASSOC);

            $granted = $pdo->query(
                'SELECT rp.role, p.name
                 FROM role_permissions rp
                 JOIN permissions p ON p.id = rp.permission_id'
            )->fetchAll(PDO::FETCH_ASSOC);

            $matrix = ['admin' => [], 'dean' => [], 'instructor' => [], 'student' => []];
            foreach ($granted as $g) {
                $matrix[$g['role']][] = $g['name'];
            }

            echo json_encode([
                'success' => true,
                'data'    => [
                    'permissions' => $perms,
                    'matrix'      => $matrix
                ]
            ]);
        } catch (Exception $e) {
            error_log('[RBACApi.php] ' . $e->getMessage()); echo json_encode(['success' => false, 'message' => 'An internal error occurred.']);
        }
        break;

    // Current user's permission slugs
    case 'my-permissions':
        Auth::refreshPermissions();
        echo json_encode(['success' => true, 'data' => Auth::permissions()]);
        break;

    // Update permissions for a role (admin only)
    case 'update-role':
        if (!Auth::can('rbac.edit')) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Permission denied: rbac.edit']);
            break;
        }
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $role = $body['role'] ?? '';
        $permissionIds = $body['permission_ids'] ?? [];

        if (!in_array($role, ['admin', 'dean', 'instructor', 'student'])) {
            echo json_encode(['success' => false, 'message' => 'Invalid role']);
            break;
        }
        if (!is_array($permissionIds)) {
            echo json_encode(['success' => false, 'message' => 'permission_ids must be an array']);
            break;
        }

        try {
            $pdo->beginTransaction();

            // Clear existing permissions for this role
            $del = $pdo->prepare('DELETE FROM role_permissions WHERE role = ?');
            $del->execute([$role]);

            // Insert new set
            if (!empty($permissionIds)) {
                $ins = $pdo->prepare(
                    'INSERT INTO role_permissions (role, permission_id, granted_by) VALUES (?, ?, ?)'
                );
                $grantedBy = Auth::id();
                foreach ($permissionIds as $pid) {
                    $ins->execute([$role, (int)$pid, $grantedBy]);
                }
            }

            $pdo->commit();

            // If the acting user's own role was changed, refresh their session
            if (Auth::role() === $role) {
                Auth::refreshPermissions();
            }

            echo json_encode(['success' => true, 'message' => "Permissions for {$role} updated."]);
        } catch (Exception $e) {
            $pdo->rollBack();
            error_log('[RBACApi.php] ' . $e->getMessage()); echo json_encode(['success' => false, 'message' => 'An internal error occurred.']);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unknown action']);
}
