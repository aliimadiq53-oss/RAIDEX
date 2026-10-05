<?php
// GET    /users
// POST   /users
// GET    /users/:id
// PUT    /users/:id
// DELETE /users/:id

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];
$auth   = require_role(['super_admin', 'admin']);

// Keep the role list aligned with the frontend and the default role permissions.
db()->exec("ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','admin','tournament_manager','data_entry','judge','result_reviewer','screen_controller') NOT NULL");

// Extract optional ID
$id = null;
if (preg_match('#^/([^/]+)$#', $uri, $m)) $id = $m[1];

/* List */
if ($method === 'GET' && !$id) {
    $rows = db()->query('SELECT id, name, username, email, role, status, assigned_tournaments, last_login FROM users ORDER BY name')->fetchAll();
    foreach ($rows as &$r) {
        $r['assignedTournaments'] = json_decode($r['assigned_tournaments'] ?? '[]', true);
        unset($r['assigned_tournaments']);
    }
    json_ok($rows);
}

/* Single */
if ($method === 'GET' && $id) {
    $stmt = db()->prepare('SELECT id, name, username, email, role, status, assigned_tournaments, last_login FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $r = $stmt->fetch();
    if (!$r) json_error('User not found', 404);
    $r['assignedTournaments'] = json_decode($r['assigned_tournaments'] ?? '[]', true);
    unset($r['assigned_tournaments']);
    json_ok($r);
}

/* Create */
if ($method === 'POST' && !$id) {
    require_role(['super_admin']);
    $b = body();
    $required = ['name', 'username', 'password', 'role'];
    foreach ($required as $f) {
        if (empty($b[$f])) json_error("Field '$f' is required");
    }
    $allowed_roles = ['super_admin', 'admin', 'tournament_manager', 'data_entry', 'judge', 'result_reviewer', 'screen_controller'];
    if (!in_array($b['role'], $allowed_roles, true)) json_error('Invalid role');

    // Check username unique
    $chk = db()->prepare('SELECT id FROM users WHERE username = ?');
    $chk->execute([$b['username']]);
    if ($chk->fetch()) json_error('Username already exists');

    $newId = uuid();
    $hash  = password_hash($b['password'], PASSWORD_BCRYPT);
    $tournaments = json_encode($b['assignedTournaments'] ?? []);

    db()->prepare('INSERT INTO users (id, name, username, email, password_hash, role, status, assigned_tournaments) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$newId, $b['name'], $b['username'], $b['email'] ?? '', $hash, $b['role'], $b['status'] ?? 'active', $tournaments]);

    json_ok(['id' => $newId, 'message' => 'User created'], 201);
}

/* Update */
if ($method === 'PUT' && $id) {
    $b = body();
    $fields = [];
    $vals   = [];

    if (isset($b['name']))   { $fields[] = 'name = ?';   $vals[] = $b['name']; }
    if (isset($b['email']))  { $fields[] = 'email = ?';  $vals[] = $b['email']; }
    if (isset($b['role']))   { $fields[] = 'role = ?';   $vals[] = $b['role']; }
    if (isset($b['status'])) { $fields[] = 'status = ?'; $vals[] = $b['status']; }
    if (isset($b['assignedTournaments'])) {
        $fields[] = 'assigned_tournaments = ?';
        $vals[]   = json_encode($b['assignedTournaments']);
    }
    if (!empty($b['password'])) {
        $fields[] = 'password_hash = ?';
        $vals[]   = password_hash($b['password'], PASSWORD_BCRYPT);
    }

    if (empty($fields)) json_error('Nothing to update');
    $vals[] = $id;
    db()->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($vals);
    json_ok(['message' => 'User updated']);
}

/* Delete */
if ($method === 'DELETE' && $id) {
    require_role(['super_admin']);
    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    json_ok(['message' => 'User deleted']);
}

json_error('Not found', 404);
