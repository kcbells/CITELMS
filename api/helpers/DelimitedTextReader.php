<?php
/**
 * Reads a plain delimited text file (.csv, .txt, or tab-separated text
 * however it got here — including OCR output, see OcrHelper.php) into the
 * same row shape XlsxReader::readFirstSheet() produces:
 *   array<int, array<int, string>>
 * so BulkImportAPI.php's header-matching / row processing never has to
 * know or care which file format it actually came from.
 */
class DelimitedTextReader
{
    public static function readFile(string $filePath): array
    {
        $text = file_get_contents($filePath);
        if ($text === false) {
            throw new Exception('Could not read the file');
        }
        return self::parseText($text);
    }

    /**
     * @param string|null $forceDelimiter  pass "\t" when the caller already
     *        knows the text is tab-separated (e.g. OCR.space's isTable
     *        output) instead of re-guessing.
     */
    public static function parseText(string $text, ?string $forceDelimiter = null): array
    {
        // Strip a UTF-8 BOM — common on CSVs exported from Excel.
        if (substr($text, 0, 3) === "\xEF\xBB\xBF") {
            $text = substr($text, 3);
        }
        $text = str_replace("\r\n", "\n", $text);
        $text = str_replace("\r", "\n", $text);
        $lines = explode("\n", $text);

        $delimiter = $forceDelimiter ?? self::detectDelimiter($lines);

        $rows = [];
        foreach ($lines as $line) {
            if (trim($line) === '') continue;
            $cells = $delimiter === null
                ? [trim($line)] // no delimiter found — treat the whole line as one column
                : self::splitLine($line, $delimiter);
            $rows[] = array_map('trim', $cells);
        }

        return $rows;
    }

    /** Proper CSV-aware split (handles quoted fields containing the delimiter) for comma/semicolon; plain explode for tab. */
    private static function splitLine(string $line, string $delimiter): array
    {
        if ($delimiter === "\t") {
            return explode("\t", $line);
        }
        return str_getcsv($line, $delimiter);
    }

    /** Picks whichever of tab / comma / semicolon appears most consistently across the first several non-blank lines. */
    private static function detectDelimiter(array $lines): ?string
    {
        $candidates = ["\t", ',', ';'];
        $sample = array_slice(array_filter($lines, fn($l) => trim($l) !== ''), 0, 10);
        if (!$sample) return null;

        $bestDelim = null;
        $bestScore = 0;
        foreach ($candidates as $delim) {
            $counts = array_map(fn($l) => substr_count($l, $delim), $sample);
            if (!$counts || max($counts) === 0) continue;
            // A good delimiter shows up the same number of times on every line.
            $consistent = count(array_unique($counts)) === 1;
            $score = $consistent ? max($counts) + 100 : max($counts);
            if ($score > $bestScore) {
                $bestScore = $score;
                $bestDelim = $delim;
            }
        }
        return $bestDelim;
    }
}
