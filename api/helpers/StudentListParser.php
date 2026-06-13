<?php
/**
 * Extract student identifiers from uploaded lists (Excel, Word, CSV, images, text).
 */
require_once __DIR__ . '/SimpleZipReader.php';

class StudentListParser {

    /** @return ZipArchive|SimpleZipReader|null */
    private static function openZip($path) {
        if (class_exists('ZipArchive')) {
            $zip = new ZipArchive();
            if ($zip->open($path) === true) {
                return $zip;
            }
        }
        return SimpleZipReader::open($path);
    }

    private static function closeZip($zip) {
        if ($zip instanceof ZipArchive) {
            $zip->close();
        }
    }

    private static function zipNumFiles($zip) {
        return $zip instanceof ZipArchive ? $zip->numFiles : $zip->numFiles();
    }

    private static function zipGetName($zip, $index) {
        return $zip instanceof ZipArchive ? $zip->getNameIndex($index) : $zip->getNameIndex($index);
    }

    private static function zipGetData($zip, $index) {
        return $zip instanceof ZipArchive ? $zip->getFromIndex($index) : $zip->getFromIndex($index);
    }

    private static function zipGetFromName($zip, $name) {
        return $zip instanceof ZipArchive ? $zip->getFromName($name) : $zip->getFromName($name);
    }

    private static function idPatterns() {
        return [
            '/\b[A-Z]{2,6}-[A-Z0-9]{3,10}\b/i',
            '/\b[0-9]{4}-[0-9]{4,8}\b/',
            '/\b[0-9]{2}-[0-9]{5,8}\b/',
            '/\b[A-Z]{1,3}[0-9]{5,10}\b/i',
            '/\b[0-9]{6,12}\b/',
        ];
    }

    public static function mergeParsed(array $a, array $b) {
        return [
            'student_ids' => array_values(array_unique(array_merge($a['student_ids'] ?? [], $b['student_ids'] ?? []))),
            'emails'      => array_values(array_unique(array_merge($a['emails'] ?? [], $b['emails'] ?? []))),
            'raw_lines'   => ($a['raw_lines'] ?? 0) + ($b['raw_lines'] ?? 0),
        ];
    }

    public static function parseUploadedFile(array $file) {
        if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
            throw new InvalidArgumentException('No file uploaded');
        }
        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new InvalidArgumentException(self::uploadErrorMessage($file['error']));
        }
        if ($file['size'] > 15 * 1024 * 1024) {
            throw new InvalidArgumentException('File too large (max 15MB)');
        }

        $name = strtolower($file['name'] ?? '');
        $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $mime = self::detectMime($file['tmp_name']);
        $text = self::extractTextByType($file['tmp_name'], $ext, $mime);

        if (trim($text) === '') {
            throw new InvalidArgumentException('Could not read any text from this file. Try Excel/CSV, or paste student IDs below.');
        }

        $parsed = self::extractIdentifiers($text);
        $parsed['source_file'] = $file['name'] ?? '';
        $parsed['source_type'] = $ext ?: $mime;
        return $parsed;
    }

    public static function parseText($raw) {
        $parsed = self::extractIdentifiers((string)$raw);
        $parsed['source_file'] = '';
        $parsed['source_type'] = 'text';
        return $parsed;
    }

    /**
     * Extract readable text from PDF, DOCX, DOC, or TXT for quiz/lesson content.
     */
    public static function extractReadableText(array $file): string {
        if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
            throw new InvalidArgumentException('No file uploaded');
        }
        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new InvalidArgumentException(self::uploadErrorMessage($file['error']));
        }
        if ($file['size'] > 10 * 1024 * 1024) {
            throw new InvalidArgumentException('File too large (max 10MB)');
        }

        $name = strtolower($file['name'] ?? '');
        $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $mime = self::detectMime($file['tmp_name']);

        $allowedExt  = ['pdf', 'docx', 'doc', 'txt'];
        $allowedMime = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/plain',
        ];
        if (!in_array($ext, $allowedExt, true) && !in_array($mime, $allowedMime, true)) {
            throw new InvalidArgumentException('Unsupported file type. Upload PDF, DOCX, DOC, or TXT.');
        }

        $text = self::extractTextByType($file['tmp_name'], $ext, $mime);
        $text = trim(preg_replace("/\r\n?/", "\n", $text) ?? $text);

        if ($text === '') {
            throw new InvalidArgumentException(
                'No readable text found in this file. Try another file or paste your lesson content manually.'
            );
        }

        if (mb_strlen($text) > 8000) {
            $text = mb_substr($text, 0, 8000);
        }

        return $text;
    }

    private static function uploadErrorMessage($code) {
        return match ((int)$code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'File is too large',
            UPLOAD_ERR_PARTIAL => 'Upload was interrupted — please try again',
            UPLOAD_ERR_NO_FILE => 'No file selected',
            default => 'Upload failed',
        };
    }

    private static function detectMime($path) {
        if (!function_exists('finfo_open')) {
            return '';
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime  = finfo_file($finfo, $path) ?: '';
        finfo_close($finfo);
        return $mime;
    }

    private static function extractTextByType($path, $ext, $mime) {
        // Extension first, then MIME fallback
        if (in_array($ext, ['csv', 'txt'], true) || str_contains($mime, 'csv') || str_contains($mime, 'text/plain')) {
            return self::extractFromPlainText($path);
        }
        if ($ext === 'xlsx' || $mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            return self::extractFromXlsx($path);
        }
        if ($ext === 'xls' || $mime === 'application/vnd.ms-excel') {
            return self::extractFromBinaryOffice($path);
        }
        if ($ext === 'docx' || $mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            return self::extractFromDocx($path);
        }
        if ($ext === 'doc' || $mime === 'application/msword') {
            return self::extractFromBinaryOffice($path);
        }
        if ($ext === 'pdf' || $mime === 'application/pdf') {
            return self::extractFromPdf($path);
        }
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff'], true)
            || str_starts_with($mime, 'image/')) {
            return self::extractFromImage($path);
        }
        if ($ext === 'ods' || $mime === 'application/vnd.oasis.opendocument.spreadsheet') {
            return self::extractFromOds($path);
        }

        // Last resort: try reading as text/binary strings
        $plain = self::extractFromPlainText($path);
        if (trim($plain) !== '') {
            return $plain;
        }
        return self::extractFromBinaryOffice($path);
    }

    private static function extractFromPlainText($path) {
        $raw = file_get_contents($path);
        if ($raw === false) {
            return '';
        }
        // UTF-8 BOM
        if (str_starts_with($raw, "\xEF\xBB\xBF")) {
            $raw = substr($raw, 3);
        }
        if (!mb_check_encoding($raw, 'UTF-8')) {
            $converted = @mb_convert_encoding($raw, 'UTF-8', 'UTF-8, ISO-8859-1, Windows-1252');
            if ($converted !== false) {
                $raw = $converted;
            }
        }
        return $raw;
    }

    private static function extractIdentifiers($text) {
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\r\n?/', "\n", $text);
        $found = [];
        $emails = [];

        if (preg_match_all('/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/', $text, $em)) {
            foreach ($em[0] as $e) {
                $emails[] = strtolower($e);
            }
        }

        foreach (self::idPatterns() as $pattern) {
            if (preg_match_all($pattern, $text, $m)) {
                foreach ($m[0] as $id) {
                    $found[] = strtoupper(trim($id));
                }
            }
        }

        foreach (explode("\n", $text) as $line) {
            $line = trim($line);
            if ($line === '') continue;

            // Skip header rows
            if (preg_match('/^(student\s*id|id|no\.?|#|name|email|lastname|first\s*name)\b/i', $line)) {
                continue;
            }

            $parts = preg_split('/[\t,;|]+/', $line);
            if (count($parts) === 1) {
                $parts = preg_split('/\s{2,}/', $line);
            }
            foreach ($parts as $part) {
                $part = trim($part, " \t\"'()[]");
                if ($part === '') continue;
                if (preg_match('/^(student|name|email|id|no)$/i', $part)) continue;
                if (filter_var($part, FILTER_VALIDATE_EMAIL)) {
                    $emails[] = strtolower($part);
                    continue;
                }
                // Alphanumeric IDs including ADMIN-001 style logins
                if (preg_match('/^[A-Z0-9][A-Z0-9\-_.]{2,20}$/i', $part)) {
                    $found[] = strtoupper($part);
                }
            }
        }

        $found  = array_values(array_unique(array_filter($found)));
        $emails = array_values(array_unique(array_filter($emails)));

        return [
            'student_ids' => $found,
            'emails'      => $emails,
            'raw_lines'   => count(array_filter(explode("\n", $text))),
        ];
    }

    private static function extractFromXlsx($path) {
        $zip = self::openZip($path);
        if (!$zip) {
            throw new InvalidArgumentException('Could not open Excel file. Save as .xlsx or export as CSV and try again.');
        }

        $shared = [];
        $sharedXml = self::zipGetFromName($zip, 'xl/sharedStrings.xml');
        if ($sharedXml) {
            if (preg_match_all('/<t[^>]*>([^<]*)<\/t>/', $sharedXml, $sm)) {
                $shared = $sm[1];
            }
            if (preg_match_all('/<t[^>]*>(.*?)<\/t>/s', $sharedXml, $sm2)) {
                foreach ($sm2[1] as $i => $val) {
                    $shared[$i] = strip_tags($val);
                }
            }
        }

        $textParts = [];
        for ($i = 0; $i < self::zipNumFiles($zip); $i++) {
            $entry = self::zipGetName($zip, $i);
            if (!preg_match('#^xl/worksheets/sheet\d+\.xml$#', $entry)) {
                continue;
            }
            $sheet = self::zipGetData($zip, $i);
            if (!$sheet) continue;

            if (preg_match_all('/<is><t[^>]*>([^<]*)<\/t><\/is>/', $sheet, $inline)) {
                $textParts = array_merge($textParts, $inline[1]);
            }
            if (preg_match_all('/<c[^>]*\bt="s"[^>]*><v>(\d+)<\/v>/', $sheet, $refs)) {
                foreach ($refs[1] as $idx) {
                    $textParts[] = $shared[(int)$idx] ?? '';
                }
            }
            if (preg_match_all('/<c[^>]*><v>([^<]+)<\/v>/', $sheet, $vals)) {
                $textParts = array_merge($textParts, $vals[1]);
            }
            $textParts[] = self::xmlToText($sheet);
        }
        self::closeZip($zip);

        return implode("\n", array_filter($textParts));
    }

    private static function extractFromOds($path) {
        $zip = self::openZip($path);
        if (!$zip) {
            return self::extractFromBinaryOffice($path);
        }
        $chunks = [];
        for ($i = 0; $i < self::zipNumFiles($zip); $i++) {
            $name = self::zipGetName($zip, $i);
            if (preg_match('#^content\.xml$#', $name)) {
                $chunks[] = self::zipGetData($zip, $i);
            }
        }
        self::closeZip($zip);
        return self::xmlToText(implode(' ', $chunks));
    }

    private static function extractFromDocx($path) {
        $zip = self::openZip($path);
        if (!$zip) {
            throw new InvalidArgumentException('Could not open Word file.');
        }
        $chunks = [];
        for ($i = 0; $i < self::zipNumFiles($zip); $i++) {
            $name = self::zipGetName($zip, $i);
            if (preg_match('#^word/(document|header|footer|footnotes)\d*\.xml$#', $name)) {
                $chunks[] = self::zipGetData($zip, $i);
            }
        }
        self::closeZip($zip);
        return self::xmlToText(implode(' ', $chunks));
    }

    private static function xmlToText($xml) {
        if (!$xml) return '';
        $xml = preg_replace('/<\/w:p>/', "\n", $xml);
        $xml = preg_replace('/<\/w:tr>/', "\n", $xml);
        $xml = preg_replace('/<\/text:p>/', "\n", $xml);
        $xml = preg_replace('/<\/table:table-row>/', "\n", $xml);
        $xml = preg_replace('/<w:tab\/>/', "\t", $xml);
        $xml = preg_replace('/<text:tab\/>/', "\t", $xml);
        if (preg_match_all('/<t[^>]*>([^<]*)<\/t>/', $xml, $m)) {
            return html_entity_decode(implode(' ', $m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
        $text = strip_tags($xml);
        return html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    private static function extractFromBinaryOffice($path) {
        $content = file_get_contents($path) ?: '';
        $parts = [];
        // UTF-16 LE strings common in old Office binaries
        if (preg_match_all('/(?:[\x20-\x7E]\0){4,}/', $content, $u16)) {
            foreach ($u16[0] as $chunk) {
                $parts[] = str_replace("\0", '', $chunk);
            }
        }
        preg_match_all('/[\x20-\x7E]{4,}/', $content, $m);
        $parts = array_merge($parts, $m[0] ?? []);
        return implode("\n", array_unique($parts));
    }

    private static function extractFromPdf($path) {
        $content = file_get_contents($path) ?: '';
        $parts = [];
        // Text in parentheses (PDF literal strings)
        if (preg_match_all('/\((?:\\\\.|[^\\\\\)]){2,120}\)/', $content, $m)) {
            foreach ($m[0] as $lit) {
                $s = trim($lit, '()');
                $s = stripcslashes($s);
                if (strlen($s) >= 3) {
                    $parts[] = $s;
                }
            }
        }
        // TJ arrays
        if (preg_match_all('/\[(.*?)\]\s*TJ/s', $content, $tj)) {
            foreach ($tj[1] as $block) {
                if (preg_match_all('/\((?:\\\\.|[^\\\\\)])*\)/', $block, $inner)) {
                    foreach ($inner[0] as $lit) {
                        $parts[] = stripcslashes(trim($lit, '()'));
                    }
                }
            }
        }
        preg_match_all('/[\x20-\x7E]{4,}/', $content, $m2);
        $parts = array_merge($parts, $m2[0] ?? []);
        return implode("\n", array_unique(array_filter($parts)));
    }

    private static function extractFromImage($path) {
        $text = self::runOcr($path);

        if (trim($text) === '') {
            $content = file_get_contents($path) ?: '';
            preg_match_all('/[\x20-\x7E]{5,}/', $content, $m);
            $text = implode("\n", $m[0] ?? []);
        }

        return $text;
    }

    private static function runOcr($path) {
        $tesseract = self::findTesseract();
        if (!$tesseract) {
            return '';
        }

        $base = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ocr_' . uniqid();
        $outFile = $base . '.txt';

        if (stripos(PHP_OS, 'WIN') === 0) {
            $cmd = escapeshellarg($tesseract) . ' ' . escapeshellarg($path) . ' '
                . escapeshellarg($base) . ' -l eng 2>NUL';
        } else {
            $cmd = escapeshellarg($tesseract) . ' ' . escapeshellarg($path) . ' '
                . escapeshellarg($base) . ' -l eng 2>/dev/null';
        }

        @exec($cmd, $_, $code);
        $text = '';
        if ($code === 0 && file_exists($outFile)) {
            $text = file_get_contents($outFile) ?: '';
            @unlink($outFile);
        }
        return $text;
    }

    private static function findTesseract() {
        $candidates = ['tesseract'];
        if (stripos(PHP_OS, 'WIN') === 0) {
            $candidates = array_merge($candidates, [
                'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
                'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
            ]);
        }
        foreach ($candidates as $bin) {
            if ($bin === 'tesseract') {
                if (self::commandExists('tesseract')) {
                    return 'tesseract';
                }
                continue;
            }
            if (is_file($bin)) {
                return $bin;
            }
        }
        return null;
    }

    private static function commandExists($cmd) {
        if (stripos(PHP_OS, 'WIN') === 0) {
            @exec('where ' . escapeshellarg($cmd) . ' 2>NUL', $out, $code);
        } else {
            @exec('command -v ' . escapeshellarg($cmd) . ' 2>/dev/null', $out, $code);
        }
        return $code === 0;
    }
}
