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

        $dom = self::loadDom($xml, $errorDetail);
        if (!$dom) return [];

        // Concatenating every descendant <t> in document order handles both
        // shapes at once: a plain string is exactly one <t> (a direct child
        // of <si>), rich text is several <t>s nested one level deeper inside
        // <r> (one per run) — either way, walking descendants and joining
        // their text is the right result without needing to branch on which
        // shape a given <si> happens to be.
        $strings = [];
        foreach ($dom->getElementsByTagName('si') as $si) {
            $text = '';
            foreach ($si->getElementsByTagName('t') as $t) {
                $text .= $t->textContent;
            }
            $strings[] = $text;
        }
        return $strings;
    }

    /**
     * Parses an XML string into a DOMDocument, tolerating a leading UTF-8 BOM
     * (some tools prepend one before the XML declaration, which trips up
     * libxml with "Start tag expected" even though the document is otherwise
     * valid). On failure, $errorDetail is filled with libxml's actual
     * complaint instead of a bare true/false, so real parse failures are
     * diagnosable.
     *
     * DOMDocument, not SimpleXML: a worksheet part whose elements carry an
     * explicit namespace prefix (e.g. some non-Excel exporters emit
     * <x:worksheet>/<x:row>/<x:c> instead of Excel's own unprefixed-default-
     * namespace convention) parses fine as a DOM tree, but SimpleXML can
     * fail outright on the exact same bytes — both simplexml_load_string()
     * and simplexml_import_dom() on an already-successfully-parsed
     * DOMDocument were observed returning false, silently, with zero libxml
     * errors, on a real prefixed worksheet. DOMDocument's own parse of that
     * same content succeeds every time, and callers here walk it by
     * ->localName (see extractRowCells()), which doesn't care whether a
     * prefix is present at all — sidestepping the bug entirely rather than
     * working around it.
     */
    private static function loadDom(string $xml, ?string &$errorDetail = null): ?DOMDocument
    {
        if (substr($xml, 0, 3) === "\xEF\xBB\xBF") {
            $xml = substr($xml, 3);
        }

        $prevErrState = libxml_use_internal_errors(true);
        libxml_clear_errors();
        $dom = new DOMDocument();
        $ok = @$dom->loadXML($xml, LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_PARSEHUGE);
        $errors = libxml_get_errors();

        if (!$ok) {
            // Some real-world exporters (older Excel versions, WPS Office,
            // third-party report generators) drop a handful of bytes XML 1.0
            // doesn't actually allow — stray control characters inside cell
            // text, or the odd malformed tag — that a strict one-shot parse
            // rejects outright even though the sheet is otherwise fine.
            // Retry tolerantly instead of failing the whole import over one
            // bad byte in a 150KB file: strip the illegal control characters,
            // then fall back to libxml's own recovery mode (best-effort
            // parsing that skips what it can't fix) if a straight reparse
            // still doesn't work.
            libxml_clear_errors();
            $sanitized = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $xml);
            $dom = new DOMDocument();
            $ok = @$dom->loadXML($sanitized, LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_PARSEHUGE);
            if (!$ok) {
                libxml_clear_errors();
                $dom = new DOMDocument();
                $ok = @$dom->loadXML($sanitized, LIBXML_RECOVER | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_PARSEHUGE)
                    && $dom->documentElement;
            }
            $errors = libxml_get_errors();
        }

        libxml_use_internal_errors($prevErrState);

        if (!$ok || !$dom->documentElement) {
            $errorDetail = $errors ? trim($errors[0]->message) : ('empty or non-XML content, ' . strlen($xml) . ' bytes');
            return null;
        }
        $errorDetail = null;
        return $dom;
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

    /**
     * Resolves the zip path of the first non-hidden sheet, in the workbook's
     * own tab order — or null if workbook.xml/its rels can't be read, so the
     * caller can fall back to the tolerant filename-based scan instead.
     */
    private static function firstVisibleSheetPathFromWorkbook(ZipArchive $zip): ?string
    {
        $workbookXml = $zip->getFromName('xl/workbook.xml');
        $relsXml     = $zip->getFromName('xl/_rels/workbook.xml.rels');
        if ($workbookXml === false || $relsXml === false) return null;

        $wb = self::loadDom($workbookXml);
        $rl = self::loadDom($relsXml);
        if (!$wb || !$rl) return null;

        // r:id -> target part path, from the rels file (targets are relative to "xl/").
        $targets = [];
        foreach ($rl->getElementsByTagName('Relationship') as $rel) {
            $id = $rel->getAttribute('Id');
            $target = $rel->getAttribute('Target');
            if ($id === '' || $target === '') continue;
            $targets[$id] = 'xl/' . ltrim(str_replace('\\', '/', $target), '/');
        }
        if (!$targets) return null;

        // <sheets><sheet name="..." sheetId=".." state="hidden|veryHidden" r:id="rIdX"/>...
        // Document order here IS tab order; state is absent for a normal visible tab.
        foreach ($wb->getElementsByTagName('sheet') as $sheet) {
            $state = strtolower($sheet->getAttribute('state'));
            if ($state === 'hidden' || $state === 'veryhidden') continue;
            // r:id is namespaced — getAttribute('r:id') only works when the
            // prefix is literally "r" (always true for genuine Excel/OOXML
            // output), which covers every real-world file this matters for.
            $rid = $sheet->getAttribute('r:id');
            if ($rid !== '' && isset($targets[$rid])) {
                return $targets[$rid];
            }
        }
        return null;
    }

    private static function firstSheetPath(ZipArchive $zip): string
    {
        // The correct notion of "first sheet" is whichever TAB is first and
        // visible in Excel's own tab order — NOT whichever worksheetN.xml
        // happens to be numbered lowest. Those two can disagree: Excel
        // doesn't rename/renumber a sheet's internal XML file when tabs are
        // reordered or hidden, so a workbook can easily have an internal
        // "sheet1.xml" that's actually a hidden reference/scratch tab, while
        // the real, visible "Sheet1" the user sees and expects to be read
        // lives in "sheet2.xml" or beyond. Resolve the real order via
        // xl/workbook.xml's <sheets> list (document order = tab order,
        // state="hidden"/"veryHidden" = not shown) and follow each sheet's
        // r:id to its actual part through xl/_rels/workbook.xml.rels, the
        // same two-step lookup Excel itself does.
        $resolved = self::firstVisibleSheetPathFromWorkbook($zip);
        if ($resolved !== null && $zip->locateName($resolved) !== false) {
            return $resolved;
        }

        // Fallback below only for a workbook.xml/rels that's missing, malformed,
        // or resolves to nothing real — same tolerant scan as before.

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

    /**
     * Buffered path — the whole worksheet part parsed as one DOM document,
     * then walked exactly like the streaming path below (same
     * extractRowCells() helper), so both paths agree on every quirk
     * (namespace prefixes, inline strings, the apostrophe-prefix cleanup)
     * instead of maintaining two slightly different implementations.
     */
    private static function parseSheetXml(string $xml, array $sharedStrings): array
    {
        $dom = self::loadDom($xml, $errorDetail);
        if (!$dom) {
            throw new Exception('Could not parse the worksheet XML' . ($errorDetail ? " ($errorDetail)" : ''));
        }
        $sheetDataList = $dom->getElementsByTagName('sheetData');
        if ($sheetDataList->length === 0) {
            throw new Exception('The worksheet is missing its data section (<sheetData>) — this file format isn\'t supported yet.');
        }

        $rows = [];
        foreach ($sheetDataList->item(0)->childNodes as $rowNode) {
            if (!($rowNode instanceof DOMElement) || $rowNode->localName !== 'row') continue;
            $cells = self::extractRowCells($rowNode, $sharedStrings);
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
