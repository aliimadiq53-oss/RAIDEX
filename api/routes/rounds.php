<?php
// GET /rounds?tournament_id=...
// POST /rounds
// PUT /rounds/:id
// DELETE /rounds/:id
$uri = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];
if ($method === 'GET') {
    $tournamentId = $_GET['tournament_id'] ?? null;
    if ($tournamentId) {
        $stmt = db()->prepare('SELECT * FROM tournament_rounds WHERE tournament_id = ? ORDER BY round_number');
        $stmt->execute([$tournamentId]);
    } else {
        $stmt = db()->query('SELECT * FROM tournament_rounds ORDER BY tournament_id, round_number');
    }
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) $row['judge_ids'] = json_decode($row['judge_ids'] ?? '[]', true);
    json_ok($rows);
}
require_role(['super_admin', 'admin']);
$id = null;
if (preg_match('#^/([^/]+)$#', $uri, $m)) $id = $m[1];
if ($method === 'POST' && !$id) {
    $b = body();
    foreach (['tournament_id','round_number','name'] as $field) if (!isset($b[$field]) || $b[$field] === '') json_error("Field '$field' is required");
    $newId = uuid();
    db()->prepare('INSERT INTO tournament_rounds (id,tournament_id,round_number,name,status,judge_ids) VALUES (?,?,?,?,?,?)')
        ->execute([$newId, $b['tournament_id'], $b['round_number'], $b['name'], $b['status'] ?? 'not_started', json_encode($b['judge_ids'] ?? [])]);
    json_ok(['id' => $newId], 201);
}
if ($method === 'PUT' && $id) {
    $b = body(); $fields = []; $values = [];
    foreach (['round_number','name','status'] as $field) if (isset($b[$field])) { $fields[] = "$field = ?"; $values[] = $b[$field]; }
    if (isset($b['judge_ids'])) { $fields[] = 'judge_ids = ?'; $values[] = json_encode($b['judge_ids']); }
    if (!$fields) json_error('Nothing to update');
    $values[] = $id;
    db()->prepare('UPDATE tournament_rounds SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
    json_ok(['message' => 'Round updated']);
}
if ($method === 'DELETE' && $id) {
    db()->prepare('DELETE FROM tournament_rounds WHERE id = ?')->execute([$id]);
    json_ok(['message' => 'Round deleted']);
}
json_error('Not found', 404);
