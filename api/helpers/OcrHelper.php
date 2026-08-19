<?php
/**
 * OCR — reads tabular text out of a photo (a picture of a printed roster,
 * curriculum sheet, whiteboard, etc.) so it can go through the same import
 * pipeline as an Excel file.
 *
 * This is best-effort, not a real spreadsheet — accuracy depends entirely
 * on the photo. A clear, flat, well-lit shot of a printed table works
 * reasonably well; a blurry or handwritten one may come back wrong or
 * empty. There is no way around that with OCR; the admin should always use
 * the preview step to check what actually got read before importing a
 * photo-sourced file.
 *
 * Two engines, tried in order — see config/ocr.php for how each is set up:
 *   1. Tesseract (local, free, no signup, no rate limit) — used whenever
 *      TESSERACT_PATH resolves to a real binary on this machine.
 *   2. OCR.space cloud API — fallback for a deployment without Tesseract.
 */
class OcrHelper
{
    private const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image';

    /** @return array<int, array<int, string>> same row shape as XlsxReader::readFirstSheet() */
    public static function readImage(string $filePath, string $originalName, string $mimeType): array
    {
        require_once __DIR__ . '/../../config/ocr.php';
        require_once __DIR__ . '/DelimitedTextReader.php';

        if (self::tesseractAvailable()) {
            return self::readWithTesseract($filePath);
        }
        return self::readWithOcrSpace($filePath, $originalName, $mimeType);
    }

    private static function tesseractAvailable(): bool
    {
        // TESSERACT_PATH is either a real, checked file path (see
        // config/ocr.php) or the bare string "tesseract" as a last-resort
        // PATH-relying fallback — only actually try running it in the
        // first case; blindly shelling out to a name that might not exist
        // just to find out is wasted latency on every single upload.
        return TESSERACT_PATH !== 'tesseract' || self::commandExists('tesseract');
    }

    private static function commandExists(string $cmd): bool
    {
        $which = stripos(PHP_OS, 'WIN') === 0 ? 'where' : 'which';
        $out = [];
        exec(escapeshellarg($which) . ' ' . escapeshellarg($cmd) . ' 2>&1', $out, $code);
        return $code === 0;
    }

    // ─── Engine 1: local Tesseract ─────────────────────────────────────────

    /**
     * Runs Tesseract in TSV mode, which gives per-word bounding boxes
     * instead of just a text blob — that's what lets table structure be
     * reconstructed (see reconstructTable()) instead of losing which words
     * belonged in which column.
     */
    private static function readWithTesseract(string $filePath): array
    {
        if (!extension_loaded('exec') && !function_exists('proc_open')) {
            throw new Exception('Neither Tesseract execution nor the OCR.space fallback is available on this server.');
        }

        $cmd = escapeshellarg(TESSERACT_PATH) . ' ' . escapeshellarg($filePath) . ' stdout --psm 6 tsv 2>&1';
        $output = shell_exec($cmd);

        if ($output === null || trim((string)$output) === '') {
            throw new Exception('Tesseract produced no output for this image. Try a clearer, well-lit, flat-on photo of the table.');
        }
        if (stripos($output, 'Error') === 0 || stripos($output, 'failed') !== false && stripos($output, "\t") === false) {
            throw new Exception('Tesseract could not read this file as an image: ' . trim(substr($output, 0, 200)));
        }

        $words = self::parseTesseractTsv($output);
        if (!$words) {
            throw new Exception('OCR found no readable text in this photo. Try a clearer, well-lit, flat-on photo of the table.');
        }

        $rows = self::reconstructTable($words);
        if (count($rows) < 2) {
            throw new Exception('OCR only found ' . count($rows) . ' readable row(s) in this photo — not enough to detect headers and data. Try a clearer photo, or a real spreadsheet file instead.');
        }
        return $rows;
    }

    /** @return array<int, array{line:string, left:int, top:int, width:int, height:int, text:string}> one entry per recognized word */
    private static function parseTesseractTsv(string $tsv): array
    {
        $lines = explode("\n", str_replace("\r\n", "\n", $tsv));
        $headerSeen = false;
        $words = [];
        foreach ($lines as $line) {
            $cols = explode("\t", $line);
            if (count($cols) < 12) continue;
            if (!$headerSeen) {
                // First tab-delimited row is Tesseract's own column header
                // ("level\tpage_num\t...\ttext") — skip it, not a word.
                if ($cols[0] === 'level') { $headerSeen = true; continue; }
                continue;
            }
            [$level, , $block, $par, $lineNum, , $left, $top, $width, $height, , $text] = $cols;
            if ($level !== '5') continue; // level 5 = individual word rows in Tesseract's TSV output
            $text = trim($text);
            if ($text === '') continue;
            $words[] = [
                'line'   => "$block.$par.$lineNum", // groups words that Tesseract itself already recognized as one visual line
                'left'   => (int)$left,
                'top'    => (int)$top,
                'width'  => (int)$width,
                'height' => (int)$height,
                'text'   => $text,
            ];
        }
        return $words;
    }

    /**
     * Turns Tesseract's flat word list back into table rows/columns.
     * Tesseract already groups words into visual lines (one table row
     * each, for a real grid photo) — the remaining problem is splitting
     * each line back into separate column cells, since Tesseract itself
     * has no concept of "table column." The heuristic: a horizontal gap
     * between two words that's much wider than normal word-spacing is
     * almost always a column boundary; a normal-sized gap just means two
     * words inside the same cell.
     */
    private static function reconstructTable(array $words): array
    {
        $byLine = [];
        foreach ($words as $w) $byLine[$w['line']][] = $w;

        // Preserve reading order (top-to-bottom) rather than trusting the
        // TSV's line-id ordering, which is grouped by block/paragraph first.
        uasort($byLine, fn($a, $b) => $a[0]['top'] <=> $b[0]['top']);

        $medianHeight = self::median(array_map(fn($w) => $w['height'], $words)) ?: 12;
        $gapThreshold = max(20, $medianHeight * 2.2);

        $rows = [];
        foreach ($byLine as $lineWords) {
            usort($lineWords, fn($a, $b) => $a['left'] <=> $b['left']);
            $cells = [];
            $current = '';
            $prevRight = null;
            foreach ($lineWords as $w) {
                $gap = $prevRight === null ? 0 : $w['left'] - $prevRight;
                if ($prevRight !== null && $gap > $gapThreshold) {
                    $cells[] = trim($current);
                    $current = '';
                }
                $current .= ($current === '' ? '' : ' ') . $w['text'];
                $prevRight = $w['left'] + $w['width'];
            }
            if ($current !== '') $cells[] = trim($current);
            if ($cells) $rows[] = $cells;
        }

        // Rows may have different cell counts (a wide header, a short data
        // row, a stray OCR misread) — pad to the widest row so every row
        // lines up under the same column indexes downstream.
        $maxCols = $rows ? max(array_map('count', $rows)) : 0;
        foreach ($rows as &$row) {
            while (count($row) < $maxCols) $row[] = '';
        }
        return $rows;
    }

    private static function median(array $nums): ?float
    {
        if (!$nums) return null;
        sort($nums);
        $mid = intdiv(count($nums), 2);
        return count($nums) % 2 ? $nums[$mid] : ($nums[$mid - 1] + $nums[$mid]) / 2;
    }

    // ─── Engine 2: OCR.space cloud fallback ────────────────────────────────

    private static function readWithOcrSpace(string $filePath, string $originalName, string $mimeType): array
    {
        if (!extension_loaded('curl')) {
            throw new Exception('Neither Tesseract nor the "curl" PHP extension (needed for the OCR.space fallback) is available on this server.');
        }

        $ch = curl_init(self::OCR_SPACE_ENDPOINT);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_POSTFIELDS     => [
                'apikey'            => OCR_SPACE_API_KEY,
                'file'              => new CURLFile($filePath, $mimeType, $originalName),
                'isTable'           => 'true',   // ask OCR.space to return tab-separated rows instead of loose text
                'OCREngine'         => '2',       // engine 2 — better with tables/numbers than the default
                'scale'             => 'true',    // upscale small/low-res photos before reading
                'detectOrientation' => 'true',
            ],
        ]);
        $response = curl_exec($ch);
        $curlErr  = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false) {
            throw new Exception('Could not reach the OCR service (' . $curlErr . '). Check the server\'s internet connection and try again.');
        }

        $data = json_decode($response, true);

        // A non-200 response (rate limiting, the shared "helloworld" demo
        // key being throttled under load, a 5xx from OCR.space itself, …)
        // often comes back with a totally different JSON shape — a
        // top-level "error"/"details" pair instead of ParsedResults. Catch
        // that FIRST, before falling through to "no text found", which
        // would otherwise mask exactly this case with a misleading message.
        if ($httpCode !== 200 || (is_array($data) && isset($data['error']))) {
            $detail = is_array($data) ? (($data['error'] ?? '') . ' ' . ($data['details'] ?? '')) : '';
            $detail = trim($detail) ?: "HTTP $httpCode";
            $usingSharedKey = (defined('OCR_SPACE_API_KEY') && OCR_SPACE_API_KEY === 'helloworld');
            throw new Exception(
                'The OCR service is unavailable right now (' . $detail . ').' .
                ($usingSharedKey
                    ? ' This site is using OCR.space\'s shared free demo key, which gets throttled under load — register your own free key at ocr.space/ocrapi/freekey and set it in config/ocr.php to fix this.'
                    : ' Please try again in a few minutes.')
            );
        }

        if (!is_array($data)) {
            throw new Exception('The OCR service returned an unreadable response. Please try again.');
        }

        if (!empty($data['IsErroredOnProcessing'])) {
            $msg = is_array($data['ErrorMessage'] ?? null) ? implode(' ', $data['ErrorMessage']) : ($data['ErrorMessage'] ?? 'Unknown OCR error');
            throw new Exception('OCR could not read this photo: ' . $msg);
        }

        $parsedText = $data['ParsedResults'][0]['ParsedText'] ?? '';
        if (trim($parsedText) === '') {
            throw new Exception('OCR found no readable text in this photo. Try a clearer, well-lit, flat-on photo of the table.');
        }

        $rows = DelimitedTextReader::parseText($parsedText, "\t");
        if (count($rows) < 2) {
            throw new Exception('OCR only found ' . count($rows) . ' readable row(s) in this photo — not enough to detect headers and data. Try a clearer photo, or a real spreadsheet file instead.');
        }
        return $rows;
    }
}
