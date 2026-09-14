<?php
/**
 * Minimal dependency-free .docx table reader.
 *
 * Like .xlsx, a .docx file is a ZIP archive of XML parts — the document
 * body lives at word/document.xml. This reads the FIRST <w:tbl> (table)
 * found in that body and turns it into the same row shape
 * XlsxReader::readFirstSheet() produces, so a roster pasted into a Word
 * table can be imported exactly like a spreadsheet. Body text outside a
 * table, headers/footers, and any tables after the first are ignored —
 * this is an importer for "one roster table," not a general document parser.
 */
class DocxTableReader
{
    private const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    /**
     * Opens word/document.xml and returns it as a namespace-registered
     * SimpleXMLElement — shared by readFirstTable() (table rows only) and
     * readAllText() (every paragraph, table cell, header/footer text run).
     */
    private static function loadDocumentXml(string $filePath): SimpleXMLElement
    {
        if (!extension_loaded('zip')) {
            throw new Exception('The "zip" PHP extension is not enabled on this server — ask whoever manages the server to enable it.');
        }

        $zip = new ZipArchive();
        if ($zip->open($filePath) !== true) {
            throw new Exception('Could not open the file — is it a valid .docx file?');
        }
        $xml = $zip->getFromName('word/document.xml');
        $zip->close();

        if ($xml === false) {
            throw new Exception('This .docx file doesn\'t look like a real Word document (missing word/document.xml).');
        }

        $prevErrState = libxml_use_internal_errors(true);
        libxml_clear_errors();
        $doc = simplexml_load_string($xml);
        libxml_use_internal_errors($prevErrState);

        // Strict `=== false` on purpose, not a truthy check — a
        // SimpleXMLElement whose root has only element children and no
        // direct text/attributes (exactly what <w:document><w:body>...
        // looks like) evaluates as falsy in a boolean context even though
        // parsing genuinely succeeded. `!$doc` would misreport that as a
        // parse failure.
        if ($doc === false) {
            throw new Exception('Could not parse the document\'s XML — the file may be corrupted.');
        }

        $doc->registerXPathNamespace('w', self::NS_W);
        return $doc;
    }

    /**
     * Every bit of text in the document — paragraphs AND table cells alike
     * (a <w:t> run appears in both), in document order. Unlike
     * readFirstTable(), this never requires a table to be present: it's for
     * content-sniffing a document's own text (e.g. a "Course Name: ITE 300 /
     * Module Number: 3" info block that's written as plain paragraphs rather
     * than a table), not for importing tabular data.
     */
    public static function readAllText(string $filePath): string
    {
        $doc = self::loadDocumentXml($filePath);
        $texts = $doc->xpath('//w:t');
        $parts = [];
        foreach ($texts as $t) {
            $parts[] = (string)$t;
        }
        return implode(' ', $parts);
    }

    public static function readFirstTable(string $filePath): array
    {
        $doc = self::loadDocumentXml($filePath);
        $tables = $doc->xpath('//w:tbl');
        if (!$tables) {
            throw new Exception('No table found in this document. Paste your roster into a Word table (Insert → Table) and try again.');
        }

        $table = $tables[0];
        $table->registerXPathNamespace('w', self::NS_W);

        $rows = [];
        foreach ($table->xpath('.//w:tr') as $tr) {
            $tr->registerXPathNamespace('w', self::NS_W);
            $cells = [];
            foreach ($tr->xpath('.//w:tc') as $tc) {
                $tc->registerXPathNamespace('w', self::NS_W);
                // Concatenate every text run in the cell — a cell can have
                // multiple <w:r><w:t> runs if it was formatted/edited piecemeal.
                $texts = $tc->xpath('.//w:t');
                $cellText = '';
                foreach ($texts as $t) {
                    $cellText .= (string)$t;
                }
                $cells[] = trim($cellText);
            }
            if ($cells) $rows[] = $cells;
        }

        if (!$rows) {
            throw new Exception('The table in this document has no rows.');
        }

        return $rows;
    }
}
