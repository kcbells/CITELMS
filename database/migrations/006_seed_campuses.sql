-- ============================================================
-- Migration 006: Seed the 4 PHINMA COC campuses
-- Safe to run multiple times — uses INSERT IGNORE so existing
-- rows (campus_id=1 Main Campus) are not duplicated.
-- ============================================================

INSERT IGNORE INTO `campus`
    (`campus_id`, `campus_name`, `campus_code`, `address`, `status`)
VALUES
    (1, 'Main Campus',   'MAIN',   'Max Suniel St., Carmen, Cagayan de Oro City', 'active'),
    (2, 'Iligan Campus', 'ILIGAN', 'Iligan City, Lanao del Norte',                'active'),
    (3, 'Puerto Campus', 'PUERTO', 'Puerto, Cagayan de Oro City',                 'active'),
    (4, 'Butuan Campus', 'BUTUAN', 'Butuan City, Agusan del Norte',               'active');
