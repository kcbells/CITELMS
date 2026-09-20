<?php
/**
 * Minimal test harness — no Composer, no PHPUnit.
 *
 * The project has no dependency manager, so pulling in PHPUnit would mean
 * introducing Composer just to run a few assertions. These suites are plain
 * PHP instead: run them with the XAMPP binary and read the exit code.
 *
 *   php tools/tests/unit-tests.php
 *   php tools/tests/integration-tests.php --user=<id> --pass=<password>
 *
 * Exit code is 0 when everything passes, 1 otherwise, so this drops straight
 * into CI or a pre-deploy check later without modification.
 */

final class TestRunner
{
    private array $results = [];
    private string $currentUnit = '';
    private string $currentDesc = '';

    public function __construct(private string $suiteName) {}

    /** Declare which registry entry the following assertions belong to. */
    public function unit(string $id, string $description): void
    {
        $this->currentUnit = $id;
        $this->currentDesc = $description;
    }

    public function ok(bool $condition, string $assertion, string $detail = ''): void
    {
        $this->results[] = [
            'unit'   => $this->currentUnit,
            'desc'   => $this->currentDesc,
            'assert' => $assertion,
            'pass'   => $condition,
            'detail' => $detail,
        ];
    }

    public function same($expected, $actual, string $assertion): void
    {
        $this->ok(
            $expected === $actual,
            $assertion,
            $expected === $actual ? '' : 'expected ' . $this->show($expected) . ', got ' . $this->show($actual)
        );
    }

    /** Asserts a string contains a fragment — used for validator messages. */
    public function contains(string $needle, $haystack, string $assertion): void
    {
        $hit = is_string($haystack) && str_contains($haystack, $needle);
        $this->ok($hit, $assertion, $hit ? '' : 'expected text containing "' . $needle . '", got ' . $this->show($haystack));
    }

    private function show($v): string
    {
        if ($v === null)  return 'null';
        if ($v === true)  return 'true';
        if ($v === false) return 'false';
        if (is_string($v)) return '"' . (strlen($v) > 70 ? substr($v, 0, 67) . '...' : $v) . '"';
        return (string)$v;
    }

    /** Prints the report and returns the process exit code. */
    public function report(): int
    {
        $byUnit = [];
        foreach ($this->results as $r) {
            $byUnit[$r['unit']]['desc'] = $r['desc'];
            $byUnit[$r['unit']]['rows'][] = $r;
        }

        $line = str_repeat('=', 72);
        echo "\n$line\n{$this->suiteName}\n$line\n";

        $passed = $failed = 0;
        foreach ($byUnit as $id => $group) {
            $unitFailed = 0;
            foreach ($group['rows'] as $r) { if (!$r['pass']) $unitFailed++; }
            $badge = $unitFailed === 0 ? '[PASS]' : '[FAIL]';
            echo "\n$badge $id — {$group['desc']}\n";
            foreach ($group['rows'] as $r) {
                $mark = $r['pass'] ? '  ok  ' : '  XX  ';
                echo $mark . $r['assert'] . "\n";
                if (!$r['pass'] && $r['detail'] !== '') {
                    echo "        " . $r['detail'] . "\n";
                }
                $r['pass'] ? $passed++ : $failed++;
            }
        }

        $total = $passed + $failed;
        echo "\n$line\n";
        echo "$passed/$total assertions passed";
        echo $failed === 0 ? " — OK\n" : " — $failed FAILED\n";
        echo "$line\n";

        return $failed === 0 ? 0 : 1;
    }
}
