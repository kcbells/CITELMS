<?php
/**
 * OCR configuration — used by api/helpers/OcrHelper.php to read text out of
 * photos uploaded to the Class Density / Subjects bulk importers.
 *
 * Two engines, tried in order:
 *
 * 1. Tesseract (local, free, no signup, no rate limit) — installed on this
 *    machine via `winget install tesseract-ocr.tesseract`. TESSERACT_PATH
 *    points straight at it so PHP doesn't depend on the web server
 *    process's PATH (which won't see a PATH change made after Apache was
 *    already running). If this file is deployed to a different machine
 *    without Tesseract, OcrHelper falls back to the OCR.space API below
 *    instead of failing outright.
 *
 * 2. OCR.space cloud API — only used when Tesseract isn't available. The
 *    default key below ("helloworld") is OCR.space's own published public
 *    demo key for testing without registration — documented at
 *    https://ocr.space/ocrapi — NOT something invented for this project. It
 *    is shared by everyone using it and gets throttled under load. Register
 *    a free personal key (no credit card, 25,000 requests/month) at
 *    https://ocr.space/ocrapi/freekey and paste it below in place of
 *    "helloworld" if you ever need this fallback to be reliable too.
 */
if (!defined('TESSERACT_PATH')) {
    $__tesseractCandidates = [
        getenv('TESSERACT_PATH') ?: '',
        'C:/Program Files/Tesseract-OCR/tesseract.exe',
        'C:/Program Files (x86)/Tesseract-OCR/tesseract.exe',
        '/usr/bin/tesseract',
        '/usr/local/bin/tesseract',
    ];
    $__tesseractPath = null;
    foreach ($__tesseractCandidates as $__candidate) {
        if ($__candidate !== '' && is_file($__candidate)) {
            $__tesseractPath = $__candidate;
            break;
        }
    }
    // Last resort: rely on PATH (works if the web server process's own
    // environment has it, e.g. on Linux where it's usually just "tesseract").
    define('TESSERACT_PATH', $__tesseractPath ?? 'tesseract');
    unset($__tesseractCandidates, $__tesseractPath, $__candidate);
}

if (!defined('OCR_SPACE_API_KEY')) {
    define('OCR_SPACE_API_KEY', getenv('OCR_SPACE_API_KEY') ?: 'helloworld');
}
