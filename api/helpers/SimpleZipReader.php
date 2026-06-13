<?php
/**
 * Minimal ZIP reader for Office Open XML (.xlsx, .docx) without ZipArchive.
 */
class SimpleZipReader {

    private $entries = [];

    public static function open($path) {
        $reader = new self();
        if (!$reader->parse($path)) {
            return null;
        }
        return $reader;
    }

    public function getFromName($name) {
        $name = str_replace('\\', '/', $name);
        foreach ($this->entries as $entry) {
            if ($entry['name'] === $name) {
                return $entry['data'];
            }
        }
        return false;
    }

    public function namesMatching($pattern) {
        $out = [];
        foreach ($this->entries as $entry) {
            if (preg_match($pattern, $entry['name'])) {
                $out[] = $entry['name'];
            }
        }
        return $out;
    }

    public function numFiles() {
        return count($this->entries);
    }

    public function getNameIndex($index) {
        return $this->entries[$index]['name'] ?? false;
    }

    public function getFromIndex($index) {
        return $this->entries[$index]['data'] ?? false;
    }

    private function parse($path) {
        $fh = @fopen($path, 'rb');
        if (!$fh) {
            return false;
        }

        fseek($fh, -22, SEEK_END);
        $eocdPos = $this->findEocd($fh);
        if ($eocdPos === false) {
            fclose($fh);
            return false;
        }

        fseek($fh, $eocdPos);
        $eocd = fread($fh, 22);
        if (strlen($eocd) < 22 || substr($eocd, 0, 4) !== "PK\x05\x06") {
            fclose($fh);
            return false;
        }

        $cdCount     = unpack('v', substr($eocd, 10, 2))[1];
        $cdOffset    = unpack('V', substr($eocd, 16, 4))[1];
        $cdSize      = unpack('V', substr($eocd, 12, 4))[1];

        fseek($fh, $cdOffset);
        $cdData = fread($fh, $cdSize);
        fclose($fh);

        $pos = 0;
        $len = strlen($cdData);
        while ($pos + 46 <= $len && count($this->entries) < $cdCount) {
            if (substr($cdData, $pos, 4) !== "PK\x01\x02") {
                break;
            }
            $compMethod  = unpack('v', substr($cdData, $pos + 10, 2))[1];
            $compSize    = unpack('V', substr($cdData, $pos + 20, 4))[1];
            $uncompSize  = unpack('V', substr($cdData, $pos + 24, 4))[1];
            $nameLen     = unpack('v', substr($cdData, $pos + 28, 2))[1];
            $extraLen    = unpack('v', substr($cdData, $pos + 30, 2))[1];
            $commentLen  = unpack('v', substr($cdData, $pos + 32, 2))[1];
            $localOffset = unpack('V', substr($cdData, $pos + 42, 4))[1];
            $name        = substr($cdData, $pos + 46, $nameLen);

            $data = $this->readEntryData($path, $localOffset, $compMethod, $compSize, $uncompSize);
            if ($data !== false) {
                $this->entries[] = ['name' => str_replace('\\', '/', $name), 'data' => $data];
            }

            $pos += 46 + $nameLen + $extraLen + $commentLen;
        }

        return count($this->entries) > 0;
    }

    private function findEocd($fh) {
        $size = filesize(stream_get_meta_data($fh)['uri']);
        $scan = min($size, 65557);
        fseek($fh, -$scan, SEEK_END);
        $buf = fread($fh, $scan);
        $pos = strrpos($buf, "PK\x05\x06");
        return $pos === false ? false : $size - $scan + $pos;
    }

    private function readEntryData($path, $offset, $compMethod, $compSize, $uncompSize) {
        $fh = @fopen($path, 'rb');
        if (!$fh) {
            return false;
        }
        fseek($fh, $offset);
        $local = fread($fh, 30);
        if (strlen($local) < 30 || substr($local, 0, 4) !== "PK\x03\x04") {
            fclose($fh);
            return false;
        }
        $nameLen  = unpack('v', substr($local, 26, 2))[1];
        $extraLen = unpack('v', substr($local, 28, 2))[1];
        fseek($fh, $offset + 30 + $nameLen + $extraLen);
        $raw = fread($fh, $compSize);
        fclose($fh);

        if ($compMethod === 0) {
            return $raw;
        }
        if ($compMethod === 8 && function_exists('gzinflate')) {
            // ZIP uses raw deflate — skip zlib wrapper bytes
            $result = @gzinflate(substr($raw, 2, -4));
            if ($result !== false) {
                return $result;
            }
            $result = @gzinflate($raw);
            if ($result !== false) {
                return $result;
            }
        }
        return false;
    }
}
