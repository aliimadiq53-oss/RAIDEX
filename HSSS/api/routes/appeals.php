<?php
// GET  /appeals
// POST /appeals
// PUT  /appeals/:id

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];
$id = $action = null;
if (preg_match('#^/([^/]+)/([^/]+)$#', $uri, $m)) { $id = $m[1]; $action = $m[2]; }
elseif (preg_match('#^/([^/]+)$#', $uri, $m)) $id = $m[1];

$auth   = null;
if ($method === 'PUT' || ($method === 'GET' && $id && $action !== 'public')) $auth = require_auth();

/* List */
if ($method === 'GET' && !$id) {
    $where = []; $vals = [];
    if (!empty($_GET['tournament_id'])) { $where[] = 'tournament_id = ?'; $vals[] = $_GET['tournament_id']; }
    if (!empty($_GET['status']))        { $where[] = 'status = ?';        $vals[] = $_GET['status']; }
    $sql  = 'SELECT * FROM appeals' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY submitted_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($vals);
    json_ok($stmt->fetchAll());
}

/* Public resolved appeals for a tournament report; pending appeals remain private. */
if ($method === 'GET' && $id && $action === 'public') {
    $stmt = db()->prepare(
        'SELECT id, player_id, reason, round, status, admin_notes, submitted_at
         FROM appeals
         WHERE tournament_id = ? AND status IN ("reviewed", "rejected")
         ORDER BY submitted_at ASC'
    );
    $stmt->execute([$id]);
    json_ok($stmt->fetchAll());
}

/* Submit appeal */
if ($method === 'POST' && !$id) {
    $b = body();
    foreach (['player_id','tournament_id','reason'] as $f) {
        if (empty($b[$f])) json_error("Field '$f' is required");
    }
    $newId = uuid();
    db()->prepare('INSERT INTO appeals (id, player_id, tournament_id, judge_id, round, reason, status) VALUES (?,?,?,?,?,?,?)')
        ->execute([$newId, $b['player_id'], $b['tournament_id'], $b['judge_id'] ?? null, $b['round'] ?? null, $b['reason'], 'pending']);
    json_ok(['id' => $newId, 'message' => 'Appeal submitted'], 201);
}

/* Update appeal status */
if ($method === 'PUT' && $id) {
    require_role(['super_admin', 'admin']);
    $b = body();
    $fields = []; $vals = [];
    if (isset($b['status']))      { $fields[] = 'status = ?';       $vals[] = $b['status']; }
    if (isset($b['admin_notes'])) { $fields[] = 'admin_notes = ?';  $vals[] = $b['admin_notes']; }
    if (empty($fields)) json_error('Nothing to update');
    $vals[] = $id;
    db()->prepare('UPDATE appeals SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($vals);
    json_ok(['message' => 'Appeal updated']);
}

json_error('Not found', 404);
