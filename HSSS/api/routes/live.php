<?php
// GET /live         — get live state (public)
// PUT /live         — update live state (admin)
// DELETE /live      — reset live state

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];

if ($method === 'GET') {
    try {
        $row = db()->query('SELECT * FROM live_state WHERE id = 1')->fetch();
    } catch (Throwable $error) {
        error_log('Live GET failed: ' . $error->getMessage());
        json_error('Live GET failed: ' . $error->getMessage(), 500);
    }
    if (!$row) json_ok(['is_active' => false, 'current_player_id' => null, 'current_tournament_id' => null, 'display_data' => null]);
    $row['display_data'] = json_decode($row['display_data'] ?? 'null', true);
    if (is_array($row['display_data']) && empty($row['display_data']['displayState'])) {
        $row['display_data']['displayState'] = $row['display_state'] ?? 'waiting';
    }
    json_ok($row);
}

if ($method === 'PUT') {
    require_role(['super_admin', 'admin', 'screen_controller']);
    $b = body();
    $display = json_encode($b['display_data'] ?? null);
    $displayState = (string)($b['display_state'] ?? ($b['display_data']['displayState'] ?? 'waiting'));
    $exists = db()->query('SELECT id FROM live_state WHERE id = 1')->fetch();
    if ($exists) {
        db()->prepare('UPDATE live_state SET current_player_id = ?, current_tournament_id = ?, is_active = ?, display_state = ?, display_data = ?, updated_at = NOW() WHERE id = 1')
            ->execute([$b['current_player_id'] ?? null, $b['current_tournament_id'] ?? null, $b['is_active'] ? 1 : 0, $displayState, $display]);
    } else {
        db()->prepare('INSERT INTO live_state (id, current_player_id, current_tournament_id, is_active, display_state, display_data) VALUES (1,?,?,?,?,?)')
            ->execute([$b['current_player_id'] ?? null, $b['current_tournament_id'] ?? null, $b['is_active'] ? 1 : 0, $displayState, $display]);
    }
    json_ok(['message' => 'Live state updated']);
}

if ($method === 'DELETE') {
    require_role(['super_admin', 'admin']);
    db()->query('UPDATE live_state SET is_active = 0, current_player_id = NULL, display_data = NULL WHERE id = 1');
    json_ok(['message' => 'Live state reset']);
}

json_error('Not found', 404);
