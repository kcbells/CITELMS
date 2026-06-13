<?php
/**
 * Overlay cit_lms_restored with data from orphaned cit_lms .ibd files.
 * Run: php tools/restore-from-ibd.php
 */
require_once __DIR__ . '/../config/database.php';

$sourceDir = 'c:/xampp_nen/mysql/data/cit_lms';
$targetDb  = 'cit_lms_restored';
$backupDir = __DIR__ . '/recovery';

$tables = [
    'users', 'student_subject', 'quiz', 'lessons', 'subject', 'section',
    'subject_offered', 'section_subject', 'student_progress', 'announcement',
    'messages', 'quiz_questions', 'questions', 'question_option',
    'student_quiz_attempts', 'student_quiz_answers', 'lesson_materials',
];

$pdo = pdo();

function recoverTable(PDO $pdo, string $targetDb, string $table, string $sourceDir, string $backupDir): array {
    $ibd = "$sourceDir/$table.ibd";
    if (!is_readable($ibd)) {
        return ['table' => $table, 'status' => 'skip', 'reason' => 'no ibd'];
    }

    $exists = $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$targetDb' AND table_name='$table'")->fetchColumn();
    if (!$exists) {
        return ['table' => $table, 'status' => 'skip', 'reason' => 'no table'];
    }

    if (!is_dir("$backupDir/$table")) {
        mkdir("$backupDir/$table", 0777, true);
    }
    copy($ibd, "$backupDir/$table/$table.ibd");

    try {
        $pdo->exec("USE `$targetDb`");
        $indexes = $pdo->query("SHOW INDEX FROM `$table` WHERE Key_name != 'PRIMARY'")->fetchAll(PDO::FETCH_ASSOC);
        $dropped = [];
        foreach ($indexes as $idx) {
            $name = $idx['Key_name'];
            if (isset($dropped[$name])) {
                continue;
            }
            $pdo->exec("ALTER TABLE `$table` DROP INDEX `$name`");
            $dropped[$name] = true;
        }
        $pdo->exec("ALTER TABLE `$table` DISCARD TABLESPACE");
        $targetIbd = "c:/xampp_nen/mysql/data/$targetDb/$table.ibd";
        copy($ibd, $targetIbd);
        $pdo->exec("ALTER TABLE `$table` IMPORT TABLESPACE");
        $count = (int)$pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
        return ['table' => $table, 'status' => 'ok', 'rows' => $count];
    } catch (Throwable $e) {
        return ['table' => $table, 'status' => 'fail', 'error' => $e->getMessage()];
    }
}

$results = [];
foreach ($tables as $table) {
    $results[] = recoverTable($pdo, $targetDb, $table, $sourceDir, $backupDir);
}

echo "Restore results:\n";
foreach ($results as $r) {
    echo json_encode($r) . "\n";
}

$compare = [
    'users' => 'SELECT COUNT(*) FROM %s.users',
    'student_subject' => 'SELECT COUNT(*) FROM %s.student_subject',
    'quiz' => 'SELECT COUNT(*) FROM %s.quiz',
    'lessons' => 'SELECT COUNT(*) FROM %s.lessons',
];
echo "\nComparison restored vs live:\n";
foreach ($compare as $name => $sql) {
    $rest = (int)$pdo->query(sprintf($sql, 'cit_lms_restored'))->fetchColumn();
    $live = (int)$pdo->query(sprintf($sql, 'cit_lms_live'))->fetchColumn();
    echo "$name: restored=$rest live=$live\n";
}
