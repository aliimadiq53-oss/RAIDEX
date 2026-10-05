<?php
// GET    /tournaments
// POST   /tournaments
// GET    /tournaments/:id
// PUT    /tournaments/:id
// DELETE /tournaments/:id
// POST   /tournaments/:id/start
// POST   /tournaments/:id/cancel
// POST   /tournaments/:id/complete

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];
$auth   = null;
if ($method !== 'GET') $auth = require_auth();

// Parse ID and action
$id = $action = null;
if (preg_match('#^/([^/]+)/([^/]+)$#', $uri, $m)) { $id = $m[1]; $action = $m[2]; }
elseif (preg_match('#^/([^/]+)$#', $uri, $m))       { $id = $m[1]; }

if ($method === 'POST' && $id && $action === 'disqualify') {
    require_permission('استبعاد لاعب');
    $b = body();
    $participantId = trim((string)($b['participant_id'] ?? ''));
    $reason = trim((string)($b['reason'] ?? ''));
    if ($participantId === '' || $reason === '') json_error('Participant and reason are required');

    $stmt = db()->prepare('SELECT participants FROM tournaments WHERE id = ?');
    $stmt->execute([$id]);
    $participantsJson = $stmt->fetchColumn();
    if ($participantsJson === false) json_error('Tournament not found', 404);
    $participants = json_decode($participantsJson ?: '[]', true);
    if (!is_array($participants)) json_error('Invalid tournament participants data', 500);

    $found = false;
    foreach ($participants as &$participant) {
        if ((string)($participant['id'] ?? '') !== $participantId) continue;
        $participant['status'] = 'disqualified';
        $participant['disqualifiedReason'] = $reason;
        $found = true;
        break;
    }
    unset($participant);
    if (!$found) json_error('Participant not found', 404);

    db()->prepare('UPDATE tournaments SET participants = ? WHERE id = ?')->execute([json_encode($participants, JSON_UNESCAPED_UNICODE), $id]);
    json_ok(['message' => 'Participant disqualified']);
}

if ($method === 'GET' && $id && $action === 'results') {
    $stmt = db()->prepare(
        'SELECT r.id, r.tournament_id AS tournamentId, r.player_id AS playerId,
                COALESCE(NULLIF(p.name, ""), r.player_id) AS playerName,
                r.competition_number AS competitionNumber, r.round_id AS roundId,
                r.round AS roundNumber, r.round_name AS roundName,
                r.tournament_name AS tournamentName, r.horse_name AS horseName,
                r.judge_id AS judgeId, COALESCE(u.name, "") AS judgeName,
                r.time, r.faults, r.scores AS scoresJson, r.status,
                r.approved_by AS approvedBy, r.approved_at AS approvedAt,
                r.rejected_reason AS rejectedReason, r.submitted_at AS submittedAt
         FROM judge_results r
         LEFT JOIN players p ON p.id = r.player_id
         LEFT JOIN users u ON u.id = r.judge_id
         WHERE r.tournament_id = ? AND r.status = "approved"
         ORDER BY r.round ASC, r.submitted_at ASC'
    );
    $stmt->execute([$id]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['roundNumber'] = (int)$row['roundNumber'];
        $row['faults'] = json_decode($row['faults'] ?? '[]', true) ?: [];
        $scores = json_decode($row['scoresJson'] ?? '{}', true) ?: [];
        $row['systemScore'] = (float)($scores['systemScore'] ?? 0);
        $row['published'] = false;
        unset($row['scoresJson']);
    }
    unset($row);
    json_ok($rows);
}

/* List */
if ($method === 'GET' && !$id) {
    $rows = db()->query('SELECT * FROM tournaments ORDER BY created_at DESC')->fetchAll();
    foreach ($rows as &$row) {
        $row['totalRounds'] = (int) $row['rounds'];
        foreach (['judge_ids', 'participants', 'round_data', 'faults', 'sponsors', 'website_images'] as $jsonField) $row[$jsonField] = json_decode($row[$jsonField] ?? '[]', true);
        $row['judgeIds'] = $row['judge_ids']; unset($row['judge_ids']);
        $row['rounds'] = $row['round_data']; unset($row['round_data']);
        $row['logoUrl'] = $row['logo_url'] ?? '';
        $row['sponsors'] = $row['sponsors'] ?? [];
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
    json_ok($rows);
}

/* Single */
if ($method === 'GET' && $id && !$action) {
    $stmt = db()->prepare('SELECT * FROM tournaments WHERE id = ?');
    $stmt->execute([$id]);
    $r = $stmt->fetch();
    if (!$r) json_error('Tournament not found', 404);
    foreach (['judge_ids', 'participants', 'round_data', 'faults', 'sponsors', 'website_images'] as $jsonField) $r[$jsonField] = json_decode($r[$jsonField] ?? '[]', true);
    $r['totalRounds'] = (int) $r['rounds'];
    $r['judgeIds'] = $r['judge_ids']; unset($r['judge_ids']);
    $r['rounds'] = $r['round_data']; unset($r['round_data']);
    $r['logoUrl'] = $r['logo_url'] ?? '';
    $r['sponsors'] = $r['sponsors'] ?? [];
    $r['logoPosition'] = $r['logo_position'] ?? 'top-left';
    $r['logoSize'] = (int)($r['logo_size'] ?? 96);
    $r['logoX'] = (float)($r['logo_x'] ?? 8);
    $r['logoY'] = (float)($r['logo_y'] ?? 8);
    $r['websiteTitle'] = $r['website_title'] ?? '';
    $r['websiteDescription'] = $r['website_description'] ?? '';
    $r['websiteTargetDate'] = $r['website_target_date'] ?? '';
    $r['websiteHeroImage'] = $r['website_hero_image'] ?? '';
    $r['websiteAboutImage'] = $r['website_about_image'] ?? '';
    $r['websiteImages'] = $r['website_images'] ?? [];
    $r['websiteShowParticipants'] = (bool)($r['website_show_participants'] ?? true);
    $r['websiteShowRounds'] = (bool)($r['website_show_rounds'] ?? true);
    $r['websiteShowSponsors'] = (bool)($r['website_show_sponsors'] ?? true);
    json_ok($r);
}

/* Create */
if ($method === 'POST' && !$id) {
    require_role(['super_admin', 'admin']);
    $b = body();
    if (empty($b['name'])) json_error('Name is required');
    $newId = uuid();
    db()->prepare('INSERT INTO tournaments (id, name, date, location, status, type, rounds, venue, description) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$newId, $b['name'], $b['date'] ?? '', $b['location'] ?? '', $b['status'] ?? 'upcoming', $b['type'] ?? '', $b['rounds'] ?? 3, $b['venue'] ?? '', $b['description'] ?? '']);
    json_ok(['id' => $newId, 'message' => 'Tournament created'], 201);
}

/* Update */
if ($method === 'PUT' && $id && !$action) {
    $b = body();
    $participantOnlyUpdate = isset($b['participants']) && array_diff(array_keys($b), ['participants']) === [];
    require_role($participantOnlyUpdate ? ['super_admin', 'admin', 'data_entry'] : ['super_admin', 'admin']);
    $fields = []; $vals = [];
    foreach (['name','date','location','status','type','rounds','venue','description','current_round','logo_url','logo_position','logo_size','logo_x','logo_y','website_title','website_description','website_target_date','website_hero_image','website_about_image','website_show_participants','website_show_rounds','website_show_sponsors'] as $f) {
        if (isset($b[$f])) { $fields[] = "$f = ?"; $vals[] = $b[$f]; }
    }
    foreach (['judge_ids' => 'judgeIds', 'participants' => 'participants', 'round_data' => 'rounds', 'faults' => 'faults', 'sponsors' => 'sponsors', 'website_images' => 'websiteImages'] as $column => $input) {
        if (isset($b[$input])) { $fields[] = "$column = ?"; $vals[] = json_encode($b[$input]); }
    }
    if (empty($fields)) json_error('Nothing to update');
    $vals[] = $id;
    db()->prepare('UPDATE tournaments SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($vals);
    json_ok(['message' => 'Tournament updated']);
}

/* Actions */
if ($method === 'POST' && $id && $action) {
    require_role(['super_admin', 'admin']);
    $statusMap = ['start' => 'active', 'cancel' => 'cancelled', 'complete' => 'completed'];
    if (!isset($statusMap[$action])) json_error('Unknown action', 404);
    db()->prepare('UPDATE tournaments SET status = ? WHERE id = ?')->execute([$statusMap[$action], $id]);
    json_ok(['message' => "Tournament $action successful"]);
}

/* Delete */
if ($method === 'DELETE' && $id) {
    require_role(['super_admin', 'admin']);
    db()->prepare('DELETE FROM tournaments WHERE id = ?')->execute([$id]);
    json_ok(['message' => 'Tournament deleted']);
}

json_error('Not found', 404);
