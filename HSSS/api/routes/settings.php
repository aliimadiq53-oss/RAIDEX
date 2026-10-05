<?php
// GET /settings
// PUT /settings
// GET /settings/roles
// PUT /settings/roles

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];

/* Public: GET site settings */
if ($method === 'GET' && ($uri === '/' || $uri === '')) {
    $row = db()->query('SELECT settings FROM site_settings WHERE id = 1')->fetch();
    $settings = $row ? json_decode($row['settings'], true) : [];
    json_ok($settings);
}

/* Admin: PUT site settings */
if ($method === 'PUT' && ($uri === '/' || $uri === '')) {
    require_role(['super_admin', 'admin']);
    $b = body();
    $json = json_encode($b);
    $exists = db()->query('SELECT id FROM site_settings WHERE id = 1')->fetch();
    if ($exists) {
        db()->prepare('UPDATE site_settings SET settings = ?, updated_at = NOW() WHERE id = 1')->execute([$json]);
    } else {
        db()->prepare('INSERT INTO site_settings (id, settings) VALUES (1, ?)')->execute([$json]);
    }
    json_ok(['message' => 'Settings saved']);
}

/* GET role permissions */
if ($method === 'GET' && $uri === '/roles') {
    require_auth();
    $rows = db()->query('SELECT role, permissions FROM role_permissions')->fetchAll();
    $result = [];
    foreach ($rows as $r) $result[$r['role']] = json_decode($r['permissions'], true);
    json_ok($result);
}

/* PUT role permissions */
if ($method === 'PUT' && $uri === '/roles') {
    require_role(['super_admin', 'admin']);
    $b = body();
    // $b = { role: 'admin', permissions: { view_results: true, ... } }
    if (empty($b['role']) || !isset($b['permissions'])) json_error('role and permissions required');
    $exists = db()->prepare('SELECT role FROM role_permissions WHERE role = ?');
    $exists->execute([$b['role']]);
    if ($exists->fetch()) {
        db()->prepare('UPDATE role_permissions SET permissions = ? WHERE role = ?')->execute([json_encode($b['permissions']), $b['role']]);
    } else {
        db()->prepare('INSERT INTO role_permissions (role, permissions) VALUES (?,?)')->execute([$b['role'], json_encode($b['permissions'])]);
    }
    json_ok(['message' => 'Permissions saved']);
}

json_error('Not found', 404);
