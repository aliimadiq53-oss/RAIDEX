<?php
// GET /horses
// POST /horses
// PUT /horses/:id
// DELETE /horses/:id
$uri = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];
if ($method === 'GET') {
    $stmt = db()->query('SELECT * FROM horses ORDER BY name');
    json_ok($stmt->fetchAll());
}
require_role(['super_admin', 'admin']);
$id = null;
if (preg_match('#^/([^/]+)$#', $uri, $m)) $id = $m[1];
if ($method === 'POST' && !$id) {
    $b = body();
    if (empty($b['name'])) json_error('Name is required');
    $newId = uuid();
    db()->prepare('INSERT INTO horses (id,name,registration_no,breed,age,gender,color,owner) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$newId, $b['name'], $b['registration_no'] ?? '', $b['breed'] ?? '', $b['age'] ?? 0, $b['gender'] ?? '', $b['color'] ?? '', $b['owner'] ?? '']);
    json_ok(['id' => $newId], 201);
}
if ($method === 'PUT' && $id) {
    $b = body(); $fields = []; $values = [];
    foreach (['name','registration_no','breed','age','gender','color','owner'] as $field) {
        if (isset($b[$field])) { $fields[] = "$field = ?"; $values[] = $b[$field]; }
    }
    if (!$fields) json_error('Nothing to update');
    $values[] = $id;
    db()->prepare('UPDATE horses SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
    json_ok(['message' => 'Horse updated']);
}
if ($method === 'DELETE' && $id) {
    db()->prepare('DELETE FROM horses WHERE id = ?')->execute([$id]);
    json_ok(['message' => 'Horse deleted']);
}
json_error('Not found', 404);
