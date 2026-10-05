<?php
// GET /participants?tournament_id=...
// POST /participants
// PUT /participants/:id
// DELETE /participants/:id
$uri = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];
if ($method === 'GET') {
    $tournamentId = $_GET['tournament_id'] ?? null;
    if ($tournamentId) {
        $stmt = db()->prepare('SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY competition_number');
        $stmt->execute([$tournamentId]);
    } else {
        $stmt = db()->query('SELECT * FROM tournament_participants ORDER BY created_at DESC');
    }
    json_ok($stmt->fetchAll());
}
require_role(['super_admin', 'admin', 'data_entry']);
$id = null;
if (preg_match('#^/([^/]+)$#', $uri, $m)) $id = $m[1];
if ($method === 'POST' && !$id) {
    $b = body();
    foreach (['tournament_id','player_id','competition_number','appeal_code'] as $field) if (empty($b[$field])) json_error("Field '$field' is required");
    $newId = uuid();
    db()->prepare('INSERT INTO tournament_participants (id,tournament_id,player_id,horse_id,competition_number,category,status,rounds_completed,appeal_code) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$newId, $b['tournament_id'], $b['player_id'], $b['horse_id'] ?? null, $b['competition_number'], $b['category'] ?? '', $b['status'] ?? 'active', $b['rounds_completed'] ?? 0, strtoupper($b['appeal_code'])]);
    json_ok(['id' => $newId], 201);
}
if (($method === 'PUT' || $method === 'DELETE') && !$id) json_error('Participant id required');
if ($method === 'PUT' && $id) {
    $b = body(); $fields = []; $values = [];
    foreach (['horse_id','competition_number','category','status','rounds_completed','appeal_code'] as $field) {
        if (isset($b[$field])) { $fields[] = "$field = ?"; $values[] = $field === 'appeal_code' ? strtoupper($b[$field]) : $b[$field]; }
    }
    if (!$fields) json_error('Nothing to update');
    $values[] = $id;
    db()->prepare('UPDATE tournament_participants SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
    json_ok(['message' => 'Participant updated']);
}
if ($method === 'DELETE' && $id) {
    db()->prepare('DELETE FROM tournament_participants WHERE id = ?')->execute([$id]);
    json_ok(['message' => 'Participant deleted']);
}
json_error('Not found', 404);
