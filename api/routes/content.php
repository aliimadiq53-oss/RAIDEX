<?php
// GET /content/:type          — public
// POST /content/:type         — admin: create item
// PUT  /content/:type/:id     — admin: update item
// DELETE /content/:type/:id   — admin: delete
// PUT  /content/:type/reorder — admin: reorder

// Types: hero_slides | gallery | champions | news | sponsors

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];

$type = $id = $action = null;
if (preg_match('#^/([^/]+)/([^/]+)/([^/]+)$#', $uri, $m)) { $type = $m[1]; $id = $m[2]; $action = $m[3]; }
elseif (preg_match('#^/([^/]+)/([^/]+)$#', $uri, $m))      { $type = $m[1]; $id = $m[2]; }
elseif (preg_match('#^/([^/]+)$#', $uri, $m))               { $type = $m[1]; }

$allowed = ['hero_slides','gallery','champions','news','sponsors'];
if (!$type || !in_array($type, $allowed, true)) json_error('Invalid content type');

$table = 'content_' . $type;

/* List (public) */
if ($method === 'GET' && !$id) {
    $rows = db()->query("SELECT * FROM $table ORDER BY sort_order ASC, id ASC")->fetchAll();
    foreach ($rows as &$r) if (isset($r['meta'])) $r['meta'] = json_decode($r['meta'], true);
    json_ok($rows);
}

/* Create */
if ($method === 'POST' && !$id) {
    require_role(['super_admin', 'admin']);
    $b = body();
    $newId = uuid();
    $meta  = json_encode($b['meta'] ?? []);
    $maxOrder = db()->query("SELECT COALESCE(MAX(sort_order),0)+1 FROM $table")->fetchColumn();
    db()->prepare("INSERT INTO $table (id, title, subtitle, body, image_url, meta, sort_order, is_active) VALUES (?,?,?,?,?,?,?,?)")
        ->execute([$newId, $b['title'] ?? '', $b['subtitle'] ?? '', $b['body'] ?? '', $b['image_url'] ?? '', $meta, $maxOrder, $b['is_active'] ?? 1]);
    json_ok(['id' => $newId, 'message' => 'Item created'], 201);
}

/* Reorder */
if ($method === 'PUT' && $id === 'reorder') {
    require_role(['super_admin', 'admin']);
    $b = body(); // { ids: ['id1','id2',...] }
    foreach (($b['ids'] ?? []) as $i => $rid) {
        db()->prepare("UPDATE $table SET sort_order = ? WHERE id = ?")->execute([$i, $rid]);
    }
    json_ok(['message' => 'Reordered']);
}

/* Update */
if ($method === 'PUT' && $id && !$action) {
    require_role(['super_admin', 'admin']);
    $b = body();
    $fields = []; $vals = [];
    foreach (['title','subtitle','body','image_url','is_active','sort_order'] as $f) {
        if (isset($b[$f])) { $fields[] = "$f = ?"; $vals[] = $b[$f]; }
    }
    if (isset($b['meta'])) { $fields[] = 'meta = ?'; $vals[] = json_encode($b['meta']); }
    if (empty($fields)) json_error('Nothing to update');
    $vals[] = $id;
    db()->prepare("UPDATE $table SET " . implode(', ', $fields) . " WHERE id = ?")->execute($vals);
    json_ok(['message' => 'Item updated']);
}

/* Delete */
if ($method === 'DELETE' && $id) {
    require_role(['super_admin', 'admin']);
    db()->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
    json_ok(['message' => 'Item deleted']);
}

json_error('Not found', 404);
