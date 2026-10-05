<?php
// GET /sync - one protected snapshot for dashboard devices
$method = $GLOBALS['_METHOD'];
if ($method !== 'GET') json_error('Method not allowed', 405);
$auth = require_auth();

$tournaments = db()->query('SELECT * FROM tournaments ORDER BY created_at DESC')->fetchAll();
foreach ($tournaments as &$row) {
    $row['totalRounds'] = (int)$row['rounds'];
    foreach (['judge_ids', 'participants', 'round_data', 'faults', 'sponsors', 'website_images'] as $field) {
        $row[$field] = json_decode($row[$field] ?? '[]', true);
    }
    $row['judgeIds'] = $row['judge_ids']; unset($row['judge_ids']);
    $row['rounds'] = $row['round_data']; unset($row['round_data']);
    $row['logoUrl'] = $row['logo_url'] ?? '';
    $row['logoPosition'] = $row['logo_position'] ?? 'top-left';
    $row['logoSize'] = (int)($row['logo_size'] ?? 96);
    $row['logoX'] = (float)($row['logo_x'] ?? 8);
    $row['logoY'] = (float)($row['logo_y'] ?? 8);
    $row['websiteTitle'] = $row['website_title'] ?? '';
    $row['websiteDescription'] = $row['website_description'] ?? '';
    $row['websiteTargetDate'] = $row['website_target_date'] ?? '';
    $row['websiteHeroImage'] = $row['website_hero_image'] ?? '';
    $row['websiteAboutImage'] = $row['website_about_image'] ?? '';
    $row['websiteImages'] = $row['website_images'] ?? [];
    $row['websiteShowParticipants'] = (bool)($row['website_show_participants'] ?? true);
    $row['websiteShowRounds'] = (bool)($row['website_show_rounds'] ?? true);
    $row['websiteShowSponsors'] = (bool)($row['website_show_sponsors'] ?? true);
}
unset($row);

$players = db()->query('SELECT * FROM players ORDER BY name')->fetchAll();
$sql = 'SELECT judge_results.*, players.name AS player_name, users.name AS judge_name
        FROM judge_results
        LEFT JOIN players ON players.id = judge_results.player_id
        LEFT JOIN users ON users.id = judge_results.judge_id
        ORDER BY submitted_at DESC';
$results = db()->query($sql)->fetchAll();
foreach ($results as &$result) {
    $result['scores'] = json_decode($result['scores'] ?? '{}', true) ?: [];
    $result['faults'] = json_decode($result['faults'] ?? '[]', true) ?: [];
}
unset($result);

$live = db()->query('SELECT * FROM live_state WHERE id = 1')->fetch();
if ($live) $live['display_data'] = json_decode($live['display_data'] ?? 'null', true);

json_ok([
    'tournaments' => $tournaments,
    'players' => $players,
    'results' => $results,
    'live' => $live,
    'updatedAt' => gmdate('c'),
]);
