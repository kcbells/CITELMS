<?php
/**
 * Centralized CORS + request security headers for all API endpoints.
 * Auto-executes on include — require_once at the top of every api/*.php file.
 */
if (defined('CORS_APPLIED')) return;
define('CORS_APPLIED', true);

// Prevent PHP warnings/notices from corrupting JSON API responses.
// Errors are still written to the Apache error log via error_log().
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');

// Buffer all output so stray PHP notices can never corrupt JSON responses.
if (!ob_get_level()) {
    ob_start();
}

/* ── Allowed origins ─────────────────────────────────────────────────────────
 * Only localhost / 127.0.0.1 variants are trusted.
 * Wildcard (*) is intentionally NOT used so credentials (session cookies,
 * JWT) cannot be sent from a different origin.
 * ─────────────────────────────────────────────────────────────────────────── */
$_cors_origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
$_cors_allowed = false;

if ($_cors_origin !== '') {
    $_cors_host = parse_url($_cors_origin, PHP_URL_HOST) ?: '';
    $_cors_allowed = in_array($_cors_host, ['localhost', '127.0.0.1', '::1'], true);
}

if ($_cors_allowed) {
    header("Access-Control-Allow-Origin: {$_cors_origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Tab-Lease, X-Requested-With');

/* ── Security hardening headers ──────────────────────────────────────────── */
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-XSS-Protection: 1; mode=block');
header("Permissions-Policy: geolocation=(), microphone=(), camera=()");
// API responses carry no navigable content — tight CSP
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
// HSTS only when running over HTTPS
$_isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
          || (($_SERVER['SERVER_PORT'] ?? 80) == 443);
if ($_isHttps) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}
unset($_isHttps);

/* ── OPTIONS preflight — respond and stop ────────────────────────────────── */
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ── CSRF guard for POST requests ────────────────────────────────────────────
 * Rejects plain HTML-form POSTs (the primary CSRF vector).
 * Our SPA always sends one of:
 *   - application/json  (Api.post)
 *   - multipart/form-data with X-Requested-With header (Api.postForm)
 * A browser form submission from another site cannot set custom headers
 * and will not match any of these conditions.
 * ─────────────────────────────────────────────────────────────────────────── */
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $xrw = strtolower($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '');
    $ct  = strtolower($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '');
    $isXhr       = ($xrw === 'xmlhttprequest');
    $isJson      = str_contains($ct, 'application/json');
    $isMultipart = str_contains($ct, 'multipart/form-data');
    if (!$isXhr && !$isJson && !$isMultipart) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'message' => 'Bad request']);
        exit;
    }
}

unset($_cors_origin, $_cors_allowed, $_cors_host);
