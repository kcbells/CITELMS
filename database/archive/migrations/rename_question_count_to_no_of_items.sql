-- Rename question_count column to no_of_items in quiz table
-- Run this in phpMyAdmin

ALTER TABLE quiz CHANGE COLUMN question_count no_of_items INT(11) DEFAULT 0;
