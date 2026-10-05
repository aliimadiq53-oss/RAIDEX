<?php
// GET /audit? tournament_id=...
// POST /audit

$uri = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];

if ($method === 'GET') {
    $auth = require_auth();
    $where = [];
    $values = [];
    if (!empty($_GET['tournament_id'])) {
        $where[] = 'tournament_id = ?';
        $values[] = $_GET['tournament_id'];
    }
    $sql = 'SELECT id, tournament_id AS tournamentId, action, description, user_id AS userId, user_name AS userName, category, created_at AS timestamp FROM audit_log' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($values);
    json_ok($stmt->fetchAll());
}

if ($method === 'POST') {
    $auth = require_auth();
    require_role(['super_admin', 'admin', 'judge']);
    $b = body();
    foreach (['action', 'description', 'category'] as $field) {
        if (empty($b[$field])) json_error("Field '$field' is required");
    }
    db()->prepare('INSERT INTO audit_log (id, tournament_id, action, description, user_id, user_name, category) VALUES (?,?,?,?,?,?,?)')
        ->execute([uuid(), $b['tournament_id'] ?? null, $b['action'], $b['description'], $auth['sub'], $b['user_name'] ?? ($auth['name'] ?? $auth['username'] ?? ''), $b['category']]);
    json_ok(['message' => 'Audit entry created'], 201);
}

json_error('Not found', 404);
