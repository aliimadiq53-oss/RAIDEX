<?php
// GET    /players
// POST   /players
// GET    /players/:id
// PUT    /players/:id
// DELETE /players/:id

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];
$auth   = null;
if ($method !== 'GET') $auth = require_auth();

$id = $action = null;
if (preg_match('#^/([^/]+)/([^/]+)$#', $uri, $m)) { $id = $m[1]; $action = $m[2]; }
elseif (preg_match('#^/([^/]+)$#', $uri, $m)) $id = $m[1];

if ($method === 'POST' && $id && $action === 'ban') {
    require_permission('حظر لاعب');
    $reason = trim((string)(body()['reason'] ?? ''));
    if ($reason === '') json_error('Ban reason is required');
    $stmt = db()->prepare('UPDATE players SET status = ?, banned_reason = ?, banned_at = NOW() WHERE id = ?');
    $stmt->execute(['banned', $reason, $id]);
    if ($stmt->rowCount() === 0) {
        $exists = db()->prepare('SELECT id FROM players WHERE id = ?');
        $exists->execute([$id]);
        if (!$exists->fetch()) json_error('Player not found', 404);
    }
    json_ok(['message' => 'Player banned']);
}

/* List — optional ?tournament_id= filter */
if ($method === 'GET' && !$id) {
    $tId = $_GET['tournament_id'] ?? null;
    if ($tId) {
        $stmt = db()->prepare('SELECT * FROM players WHERE tournament_id = ? ORDER BY name');
        $stmt->execute([$tId]);
    } else {
        $stmt = db()->query('SELECT * FROM players ORDER BY name');
    }
    json_ok($stmt->fetchAll());
}

/* Single */
if ($method === 'GET' && $id) {
    $stmt = db()->prepare('SELECT * FROM players WHERE id = ?');
    $stmt->execute([$id]);
    $r = $stmt->fetch();
    if (!$r) json_error('Player not found', 404);
    json_ok($r);
}

/* Create */
if ($method === 'POST' && !$id) {
    require_role(['super_admin', 'admin', 'data_entry']);
    $b = body();
    if (empty($b['name'])) json_error('Name is required');
    $newId = uuid();
    db()->prepare('INSERT INTO players (id, name, country, club, horse, category, tournament_id) VALUES (?,?,?,?,?,?,?)')
        ->execute([$newId, $b['name'], $b['country'] ?? '', $b['club'] ?? '', $b['horse'] ?? '', $b['category'] ?? '', $b['tournament_id'] ?? null]);
    json_ok(['id' => $newId, 'message' => 'Player created'], 201);
}

/* Update */
if ($method === 'PUT' && $id) {
    require_role(['super_admin', 'admin', 'data_entry']);
    $b = body();
    $fields = []; $vals = [];
    foreach (['name','country','club','horse','category','tournament_id','status','banned_reason','banned_at'] as $f) {
        if (isset($b[$f])) { $fields[] = "$f = ?"; $vals[] = $b[$f]; }
    }
    if (empty($fields)) json_error('Nothing to update');
    $vals[] = $id;
    db()->prepare('UPDATE players SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($vals);
    json_ok(['message' => 'Player updated']);
}

/* Delete */
if ($method === 'DELETE' && $id) {
    require_role(['super_admin', 'admin']);
    db()->prepare('DELETE FROM players WHERE id = ?')->execute([$id]);
    json_ok(['message' => 'Player deleted']);
}

json_error('Not found', 404);
