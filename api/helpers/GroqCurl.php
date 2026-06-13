<?php
/**
 * Groq API cURL SSL — XAMPP ships an outdated CA bundle that breaks api.groq.com.
 */
function applyGroqCurlSsl(array $curlOpts): array {
    $isLocal = isGroqLocalEnvironment();
    if ($isLocal) {
        $curlOpts[CURLOPT_SSL_VERIFYPEER] = false;
        $curlOpts[CURLOPT_SSL_VERIFYHOST] = 0;
        return $curlOpts;
    }

    $caFile = groqCaBundlePath();
    if ($caFile) {
        $curlOpts[CURLOPT_CAINFO] = $caFile;
    } else {
        $curlOpts[CURLOPT_SSL_VERIFYPEER] = false;
        $curlOpts[CURLOPT_SSL_VERIFYHOST] = 0;
    }
    return $curlOpts;
}

function isGroqLocalEnvironment(): bool {
    $host = strtolower($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');
    if (preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host)) {
        return true;
    }
    if (stripos(__DIR__, 'xampp') !== false) {
        return true;
    }
    if (stripos(php_ini_loaded_file() ?: '', 'xampp') !== false) {
        return true;
    }
    return false;
}

function groqCaBundlePath(): ?string {
    foreach ([
        ini_get('curl.cainfo'),
        ini_get('openssl.cafile'),
        'C:/xampp_nen/apache/bin/curl-ca-bundle.crt',
        'C:/xampp/apache/bin/curl-ca-bundle.crt',
    ] as $path) {
        if ($path && is_file($path)) {
            return $path;
        }
    }
    return null;
}
