<?php
/**
 * Minimal dependency-free .xlsx reader.
 *
 * This project has no Composer/vendor directory (see other API files — no
 * build step), so instead of pulling in PhpSpreadsheet, an .xlsx file is
 * read directly for what it actually is: a ZIP archive containing a few XML
 * parts. We only need two of them:
 *   - xl/sharedStrings.xml     — the workbook's string table (text cells
 *                                store an index into this instead of text)
 *   - xl/worksheets/sheetN.xml — the first sheet's cell grid
 *
 * Two read strategies, picked by the worksheet part's actual size:
 *   - Normal-sized (the vast majority of real files, including ones with
 *     Excel Tables/filters/frozen panes — those are just metadata, sheetData
 *     itself is always plain <row>/<c>/<v>): buffer the whole part and parse
 *     it with SimpleXML in one go. Simple, predictable, well-tested.
 *   - Unusually large (a workbook that's had entire rows/columns given
 *     direct formatting can end up with a sheetData many megabytes bigger
 *     than its actual data): stream it one <row> at a time via XMLReader so
 *     memory use stays bounded no matter how bloated the file is.
 *
 * Good enough for flat "one header row + data rows" import sheets — not a
 * general-purpose spreadsheet engine (no formulas, no formatting, no
 * multi-sheet lookup by name).
 */
class XlsxReader
{
    /** Worksheet parts at or below this size are read the simple/buffered way. */
    private const STREAM_THRESHOLD_BYTES = 8 * 1024 * 1024; // 8MB

    /**
     * @return array<int, array<int, string>> rows, each row an array of cell
     *         strings indexed 0..N (blank cells filled with '').
     * @throws Exception on an unreadable/invalid file
     */
    public static function readFirstSheet(string $filePath): array
    {
        if (!extension_loaded('zip')) {
            throw new Exception('The "zip" PHP extension is not enabled on this server — ask whoever manages the server to enable it.');
        }

        $zip = new ZipArchive();
        if ($zip->open($filePath) !== true) {
            throw new Exception('Could not open the file — is it a valid .xlsx file?');
        }

        $sharedStrings = self::readSharedStrings($zip);
        $sheetPath = self::firstSheetPath($zip);
        $stat = $zip->statName($sheetPath);
        $uncompressedSize = $stat['size'] ?? 0;

        if ($uncompressedSize > 0 && $uncompressedSize <= self::STREAM_THRESHOLD_BYTES) {
            $xml = $zip->getFromName($sheetPath);
            $zip->close();
            if ($xml === false) {
                throw new Exception('Could not read worksheet data from the file');
            }
            return self::parseSheetXml($xml, $sharedStrings);
        }

        // Large (or size unknown) — stream via XMLReader so memory stays bounded.
        $zip->close();
        $realPath = realpath($filePath);
        if (!$realPath) {
            throw new Exception('Could not locate the uploaded file on disk');
        }
        $streamUri = 'zip://' . str_replace('\\', '/', $realPath) . '#' . $sheetPath;
        return self::parseSheetStream($streamUri, $sharedStrings);
    }

    private static function readSharedStrings(ZipArchive $zip): array
    {
        $xml = $zip->getFromName('xl/sharedStrings.xml');
        if ($xml === false) {
            $entry = self::findEntryTolerant($zip, 'xl/sharedstrings.xml');
            $xml = $entry !== null ? $zip->getFromName($entry) : false;
        }
        if ($xml === false) return []; // no shared strings part — fine, workbook may use inline strings only

        $doc = self::loadXml($xml, $errorDetail);
        if (!$doc) return [];

        $strings = [];
        foreach ($doc->si as $si) {
            if (isset($si->t)) {
                // Plain string
                $strings[] = (string)$si->t;
            } else {
                // Rich text — concatenate every run's text
                $text = '';
                foreach ($si->r as $r) {
                    $text .= (string)$r->t;
                }
                $strings[] = $text;
            }
        }
        return $strings;
    }

    /**
     * Parses an XML string, tolerating a leading UTF-8 BOM (some tools
     * prepend one before the XML declaration, which trips up libxml with
     * "Start tag expected" even though the document is otherwise valid).
     * On failure, $errorDetail is filled with libxml's actual complaint
     * instead of a bare true/false, so real parse failures are diagnosable.
     */
    private static function loadXml(string $xml, ?string &$errorDetail = null): ?SimpleXMLElement
    {
        if (substr($xml, 0, 3) === "\xEF\xBB\xBF") {
            $xml = substr($xml, 3);
        }

        $prevErrState = libxml_use_internal_errors(true);
        libxml_clear_errors();
        $doc = simplexml_load_string($xml);
        $errors = libxml_get_errors();
        libxml_use_internal_errors($prevErrState);

        if (!$doc) {
            $errorDetail = $errors ? trim($errors[0]->message) : ('empty or non-XML content, ' . strlen($xml) . ' bytes');
            return null;
        }
        $errorDetail = null;
        return $doc;
    }

    /** Case/separator-tolerant lookup for a zip entry (some tools write '\' separators or odd casing). */
    private static function findEntryTolerant(ZipArchive $zip, string $wantedNormalized): ?string
    {
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string)$zip->getNameIndex($i);
            if (strtolower(str_replace('\\', '/', $name)) === $wantedNormalized) {
                return $name;
            }
        }
        return null;
    }

    private static function firstSheetPath(ZipArchive $zip): string
    {
        // Fast path: the common case.
        if ($zip->locateName('xl/worksheets/sheet1.xml') !== false) {
            return 'xl/worksheets/sheet1.xml';
        }

        // Slower, tolerant scan — some Windows-authored tools zip entries with
        // backslash separators or mixed case, and a workbook that's had
        // sheets added/removed over the years may not even HAVE a
        // "sheet1.xml" (Excel doesn't renumber remaining parts, e.g. only
        // "sheet14.xml" might exist). Normalize separators/case and accept
        // any worksheet part, preferring the lowest sheetN number if several.
        $numbered = [];
        $anyXml   = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string)$zip->getNameIndex($i);
            $norm = str_replace('\\', '/', $name);
            if (preg_match('#^xl/worksheets/sheet(\d+)\.xml$#i', $norm, $m)) {
                $numbered[(int)$m[1]] = $name;
            } elseif (preg_match('#^xl/worksheets/[^/]+\.xml$#i', $norm)) {
                $anyXml[] = $name;
            }
        }
        if ($numbered) {
            ksort($numbered);
            return reset($numbered);
        }
        if ($anyXml) {
            return $anyXml[0];
        }

        // Genuinely nothing worksheet-shaped in this archive — list what IS
        // there so the real cause (wrong file type, corrupted export, etc.)
        // is visible instead of a bare "not found".
        $sample = [];
        for ($i = 0; $i < min($zip->numFiles, 8); $i++) {
            $sample[] = $zip->getNameIndex($i);
        }
        throw new Exception(
            'No worksheet found inside the uploaded file. This usually means it isn\'t a real .xlsx ' .
            '(e.g. it\'s actually .xls, or was exported/renamed incorrectly). ' .
            'Found inside the file: ' . ($sample ? implode(', ', $sample) : '(nothing — empty archive)')
        );
    }

    /** Buffered path — the whole worksheet part parsed as one SimpleXML document. */
    private static function parseSheetXml(string $xml, array $sharedStrings): array
    {
        $doc = self::loadXml($xml, $errorDetail);
        if (!$doc) {
            throw new Exception('Could not parse the worksheet XML' . ($errorDetail ? " ($errorDetail)" : ''));
        }
        if (!isset($doc->sheetData)) {
            throw new Exception('The worksheet is missing its data section (<sheetData>) — this file format isn\'t supported yet.');
        }

        $rows = [];
        foreach ($doc->sheetData->row as $row) {
            $cells = [];
            foreach ($row->c as $c) {
                $ref = (string)$c['r']; // e.g. "C7"
                $colIndex = self::columnLetterToIndex($ref);
                $type = (string)$c['t'];

                if ($type === 's') {
                    $idx = (int)$c->v;
                    $value = $sharedStrings[$idx] ?? '';
                } elseif ($type === 'inlineStr') {
                    $value = (string)($c->is->t ?? '');
                } else {
                    // Plain number, formula result, or boolean — all fine as raw text
                    $value = (string)$c->v;
                }
                $cells[$colIndex] = self::cleanCellText($value);
            }
            if (!$cells) continue; // fully blank row
            $maxCol = max(array_keys($cells));
            $ordered = [];
            for ($i = 0; $i <= $maxCol; $i++) $ordered[$i] = $cells[$i] ?? '';
            $rows[] = $ordered;
        }

        return $rows;
    }

    /**
     * Trims a cell value and strips a leading straight apostrophe — Excel's
     * "store as text" prefix (used on ID numbers, phone numbers, etc. so
     * they don't get auto-converted to a number and lose leading zeros).
     * Excel itself hides that apostrophe in the grid; some export tools
     * write it as a literal character into the cell text instead of the
     * proper quotePrefix cell style, which otherwise leaks straight into
     * imported IDs (e.g. an Employee/Student ID column showing "'21-0001"
     * instead of "21-0001", silently breaking every login-by-ID lookup for
     * that row).
     */
    private static function cleanCellText(string $value): string
    {
        $value = trim($value);
        if (strlen($value) > 1 && $value[0] === "'") {
            $value = substr($value, 1);
        }
        return $value;
    }

    /**
     * Streaming path (large worksheets only) — walks one <row> at a time via
     * XMLReader::expand(), which materializes only that single row's DOM
     * subtree, keeping memory bounded regardless of overall file size.
     */
    private static function parseSheetStream(string $streamUri, array $sharedStrings): array
    {
        $reader = new XMLReader();
        $prevErrState = libxml_use_internal_errors(true);
        libxml_clear_errors();
        $opened = @$reader->open($streamUri);
        $openErrors = libxml_get_errors();
        libxml_use_internal_errors($prevErrState);

        if (!$opened) {
            $detail = $openErrors ? trim($openErrors[0]->message) : 'unknown error';
            throw new Exception("Could not open the worksheet for reading ($detail)");
        }

        $rows = [];
        $sawAnyRow = false;

        while ($reader->read()) {
            if ($reader->nodeType !== XMLReader::ELEMENT || $reader->localName !== 'row') {
                continue;
            }
            // Walk every <row> sibling from here via expand()+next(), so we
            // never re-scan from the document root.
            do {
                $sawAnyRow = true;
                $node = $reader->expand();
                if ($node instanceof DOMElement) {
                    $cells = self::extractRowCells($node, $sharedStrings);
                    if ($cells) {
                        $maxCol = max(array_keys($cells));
                        $ordered = [];
                        for ($i = 0; $i <= $maxCol; $i++) $ordered[$i] = $cells[$i] ?? '';
                        $rows[] = $ordered;
                    }
                }
            } while ($reader->next('row'));
            break;
        }
        $reader->close();

        if (!$sawAnyRow) {
            throw new Exception('The worksheet has no rows — the file may use a format this importer doesn\'t support yet.');
        }

        return $rows;
    }

    private static function extractRowCells(DOMElement $rowNode, array $sharedStrings): array
    {
        $cells = [];
        foreach ($rowNode->childNodes as $c) {
            if (!($c instanceof DOMElement) || $c->localName !== 'c') continue;

            $ref = $c->getAttribute('r'); // e.g. "C7"
            $colIndex = self::columnLetterToIndex($ref);
            $type = $c->getAttribute('t');

            if ($type === 's') {
                $vNode = self::firstChildNamed($c, 'v');
                $idx = $vNode ? (int)$vNode->textContent : 0;
                $value = $sharedStrings[$idx] ?? '';
            } elseif ($type === 'inlineStr') {
                $isNode = self::firstChildNamed($c, 'is');
                $value = $isNode ? $isNode->textContent : '';
            } else {
                // Plain number, formula result, or boolean — all fine as raw text
                $vNode = self::firstChildNamed($c, 'v');
                $value = $vNode ? $vNode->textContent : '';
            }
            $cells[$colIndex] = self::cleanCellText($value);
        }
        return $cells;
    }

    private static function firstChildNamed(DOMElement $el, string $name): ?DOMElement
    {
        foreach ($el->childNodes as $child) {
            if ($child instanceof DOMElement && $child->localName === $name) return $child;
        }
        return null;
    }

    /** "C7" -> 2 (zero-based column index) */
    private static function columnLetterToIndex(string $cellRef): int
    {
        preg_match('/^([A-Z]+)/i', $cellRef, $m);
        $letters = strtoupper($m[1] ?? 'A');
        $index = 0;
        foreach (str_split($letters) as $ch) {
            $index = $index * 26 + (ord($ch) - ord('A') + 1);
        }
        return $index - 1;
    }
}
