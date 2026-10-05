 <?php
// GET  /results
// POST /results
// PUT  /results/:id
// PUT  /results/:id/status
// POST /results/:id/publish

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];
$auth   = require_auth();

function parse_numeric_time_ms(?string $time): ?int {
    if (!is_string($time)) return null;
    $cleaned = trim(str_replace(['،', '٫'], '.', $time));
    if ($cleaned === '' || preg_match('#^0+(?:\.0+)?$#', $cleaned)) return null;
    if (preg_match('#^00:00(?:\.0{1,3})?$#', $cleaned)) return null;

    if (preg_match('#^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$#', $cleaned, $m)) {
        $minutes = (int)$m[1];
        $seconds = (int)$m[2];
        $ms = isset($m[3]) ? str_pad($m[3], 3, '0', STR_PAD_RIGHT) : '0';
        $total = ($minutes * 60 * 1000) + ($seconds * 1000) + (int)substr($ms, 0, 3);
        return $total > 0 ? $total : null;
    }

    if (preg_match('#^(\d+)(?:\.(\d{1,3}))?$#', $cleaned, $m)) {
        $whole = (int)$m[1];
        $fraction = isset($m[2]) ? str_pad($m[2], 3, '0', STR_PAD_RIGHT) : '0';
        $total = ($whole * 1000) + (int)substr($fraction, 0, 3);
        return $total > 0 ? $total : null;
    }

    return null;
}

function normalize_json_array(mixed $value): array {
    if (is_array($value)) return $value;
    if (is_object($value)) return (array)$value;
    if (!is_string($value)) return [];
    $trimmed = trim($value);
    if ($trimmed === '') return [];
    $decoded = json_decode($trimmed, true);
    return is_array($decoded) ? $decoded : [];
}

function normalize_json_object(mixed $value): array {
    if (is_array($value)) return $value;
    if (is_object($value)) return (array)$value;
    if (!is_string($value)) return [];
    $trimmed = trim($value);
    if ($trimmed === '') return [];
    $decoded = json_decode($trimmed, true);
    return is_array($decoded) ? $decoded : [];
}

function fault_total(mixed $faults): int {
    $sum = 0;
    foreach (normalize_json_array($faults) as $fault) {
        if (!is_array($fault)) continue;
        $count = (int)($fault['count'] ?? $fault['quantity'] ?? 0);
        $sum += max(0, $count);
    }
    return $sum;
}

function recalculate_round_scores_for_rows(array $rows): array {
    $scoreMap = [];
    $roundGroups = [];

    foreach ($rows as $row) {
        $roundNumber = (int)($row['round'] ?? 0);
        $roundKey = $roundNumber > 0
            ? ((string)($row['tournament_id'] ?? '') . ':' . $roundNumber)
            : ((string)($row['tournament_id'] ?? '') . ':' . (string)($row['round_id'] ?? ''));
        $roundGroups[$roundKey][] = $row;
    }

    foreach ($roundGroups as $roundResults) {
        $seenParticipants = [];
        $uniqueRoundResults = [];
        foreach ($roundResults as $row) {
            $participantKey = (string)($row['competition_number'] ?? '') !== ''
                ? (string)$row['competition_number']
                : ((string)($row['player_id'] ?? '') !== '' ? (string)$row['player_id'] : (string)$row['id']);
            if (isset($seenParticipants[$participantKey])) {
                $scoreMap[(string)$row['id']] = 0;
                continue;
            }
            $seenParticipants[$participantKey] = true;
            $uniqueRoundResults[] = $row;
        }
        $zeroFaultEntries = [];
        foreach ($uniqueRoundResults as $row) {
            $faults = normalize_json_array($row['faults'] ?? []);
            $timeMs = parse_numeric_time_ms((string)($row['time'] ?? ''));
            if (fault_total($faults) === 0 && $timeMs !== null) {
                $zeroFaultEntries[] = ['row' => $row, 'timeMs' => $timeMs];
            }
        }
        usort($zeroFaultEntries, fn($a, $b) => $a['timeMs'] <=> $b['timeMs']);

        for ($index = 0; $index < count($zeroFaultEntries);) {
            $tiedTime = $zeroFaultEntries[$index]['timeMs'];
            $rankScore = $index === 0 ? 4 : ($index === 1 ? 3 : ($index === 2 ? 2 : 1));
            $tiedEnd = $index + 1;
            while ($tiedEnd < count($zeroFaultEntries) && $zeroFaultEntries[$tiedEnd]['timeMs'] === $tiedTime) $tiedEnd++;
            for ($tiedIndex = $index; $tiedIndex < $tiedEnd; $tiedIndex++) {
                $rowId = (string)$zeroFaultEntries[$tiedIndex]['row']['id'];
                $scoreMap[$rowId] = $rankScore;
            }
            $index = $tiedEnd;
        }

        foreach ($uniqueRoundResults as $row) {
            $rowId = (string)$row['id'];
            $faults = normalize_json_array($row['faults'] ?? []);
            $faultTotal = fault_total($faults);
            $timeMs = parse_numeric_time_ms((string)($row['time'] ?? ''));

            if ($faultTotal >= 2) {
                $scoreMap[$rowId] = 0;
                continue;
            }

            if ($faultTotal === 1) {
                $scoreMap[$rowId] = 0.5;
                continue;
            }

            if ($timeMs === null) {
                $scoreMap[$rowId] = 0;
                continue;
            }

            if (!isset($scoreMap[$rowId])) {
                $scoreMap[$rowId] = 0;
            }
        }
    }

    return $scoreMap;
}

$id = $action = null;
if (preg_match('#^/([^/]+)/([^/]+)$#', $uri, $m)) { $id = $m[1]; $action = $m[2]; }
elseif (preg_match('#^/([^/]+)$#', $uri, $m))       { $id = $m[1]; }

/* List — optional filters */
if ($method === 'GET' && !$id) {
    $where = []; $vals = [];
    if (!empty($_GET['tournament_id'])) { $where[] = 'judge_results.tournament_id = ?'; $vals[] = $_GET['tournament_id']; }
    if (!empty($_GET['judge_id']))      { $where[] = 'judge_results.judge_id = ?';      $vals[] = $_GET['judge_id']; }
    if (!empty($_GET['player_id']))     { $where[] = 'judge_results.player_id = ?';     $vals[] = $_GET['player_id']; }
    $sql = 'SELECT judge_results.*, players.name AS player_name, users.name AS judge_name FROM judge_results LEFT JOIN players ON players.id = judge_results.player_id LEFT JOIN users ON users.id = judge_results.judge_id' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY submitted_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($vals);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['scores'] = normalize_json_object($r['scores'] ?? '{}');
        $r['faults'] = normalize_json_array($r['faults'] ?? '[]');
    }
    json_ok($rows);
}

/* Create (judge submits result) */
if ($method === 'POST' && !$id) {
    require_role(['judge', 'admin', 'super_admin']);
    $b = body();
    foreach (['player_id','tournament_id','scores'] as $f) {
        if (empty($b[$f])) json_error("Field '$f' is required");
    }
    if (parse_numeric_time_ms((string)($b['time'] ?? '')) === null) {
        json_error('A valid time greater than zero is required', 422);
    }
    $duplicateStmt = db()->prepare(
        'SELECT id FROM judge_results
         WHERE tournament_id = ?
         AND (round_id = ? OR round = ?)
         AND (player_id = ? OR CAST(competition_number AS UNSIGNED) = ?)
         LIMIT 1'
    );
    $duplicateStmt->execute([
        $b['tournament_id'],
        $b['round_id'] ?? '',
        $b['round'] ?? 1,
        $b['player_id'],
        (int)($b['competition_number'] ?? 0),
    ]);
    if ($duplicateStmt->fetch()) {
        json_error('A result already exists for this participant in this round', 409);
    }
    $newId = uuid();
    $total = array_sum((array)$b['scores']);
    db()->prepare('INSERT INTO judge_results (id, player_id, tournament_id, judge_id, competition_number, round_id, round, round_name, tournament_name, horse_name, time, faults, scores, total, status, notes, submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())')
        ->execute([$newId, $b['player_id'], $b['tournament_id'], $auth['sub'], $b['competition_number'] ?? '', $b['round_id'] ?? '', $b['round'] ?? 1, $b['round_name'] ?? '', $b['tournament_name'] ?? '', $b['horse_name'] ?? '', $b['time'] ?? '', json_encode($b['faults'] ?? []), json_encode($b['scores']), $total, 'submitted', $b['notes'] ?? '']);
    json_ok(['id' => $newId, 'message' => 'Result submitted'], 201);
}

/* Recalculate round scores for one or all tournaments */
if ($method === 'POST' && ($uri === '/recalculate' || $id === 'recalculate')) {
    require_role(['super_admin', 'admin']);
    $tournamentId = null;
    $b = body();
    if (!empty($b['tournament_id'])) $tournamentId = (string)$b['tournament_id'];

    $where = [];
    $vals = [];
    if ($tournamentId) {
        $where[] = 'tournament_id = ?';
        $vals[] = $tournamentId;
    }

    $sql = 'SELECT * FROM judge_results' . ($where ? ' WHERE ' . implode(' AND ', $where) : '');
    $stmt = db()->prepare($sql);
    $stmt->execute($vals);
    $rows = $stmt->fetchAll();

    $scoreMap = recalculate_round_scores_for_rows($rows);
    $updated = 0;
    foreach ($rows as $row) {
        $rowId = (string)$row['id'];
        if (!isset($scoreMap[$rowId])) continue;
        $score = (float)$scoreMap[$rowId];
        db()->prepare('UPDATE judge_results SET scores = ?, total = ? WHERE id = ?')
            ->execute([json_encode(['systemScore' => $score]), $score, $rowId]);
        $updated++;
    }

    json_ok(['updated' => $updated, 'tournament_id' => $tournamentId ?: 'all']);
}

/* Update status */
if ($method === 'PUT' && $id && $action === 'status') {
    $b = body();
    if (empty($b['status'])) json_error('Status required');
    if ($b['status'] === 'approved') require_permission('اعتماد نتيجة');
    elseif ($b['status'] === 'rejected') require_permission('رفض نتيجة');
    elseif ($b['status'] === 'pending') require_role(['super_admin', 'admin']);
    else json_error('Invalid result status');
    $fields = ['status = ?'];
    $values = [$b['status']];
    if ($b['status'] === 'approved') $fields[] = 'approved_at = NOW()';
    if (isset($b['approved_by'])) { $fields[] = 'approved_by = ?'; $values[] = $b['approved_by']; }
    if (isset($b['rejected_reason'])) { $fields[] = 'rejected_reason = ?'; $values[] = $b['rejected_reason']; }
    $values[] = $id;
    db()->prepare('UPDATE judge_results SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
    json_ok(['message' => 'Status updated']);
}

/* Publish (make visible on live display) */
if ($method === 'POST' && $id && $action === 'publish') {
    require_role(['super_admin', 'admin']);
    db()->prepare('UPDATE judge_results SET status = "approved" WHERE id = ?')->execute([$id]);
    json_ok(['message' => 'Result published']);
}

/* Update result */
if ($method === 'PUT' && $id && !$action) {
    require_role(['super_admin', 'admin']);
    $b = body();
    $fields = []; $vals = [];
    $hasResultEdit = isset($b['time']) || isset($b['faults']);
    if ($hasResultEdit) {
        if (($auth['username'] ?? '') !== 'hs') json_error('Only hs can edit result time or faults', 403);
        $resultStatusStmt = db()->prepare('SELECT status FROM judge_results WHERE id = ?');
        $resultStatusStmt->execute([$id]);
        $resultStatus = $resultStatusStmt->fetchColumn();
        if ($resultStatus !== 'rejected') {
            $appealStmt = db()->prepare(
                'SELECT a.id FROM appeals a
                 INNER JOIN judge_results r ON r.tournament_id = a.tournament_id
                 AND (r.player_id = a.player_id OR r.competition_number = a.competition_number)
                 WHERE r.id = ? LIMIT 1'
            );
            $appealStmt->execute([$id]);
            if (!$appealStmt->fetch()) json_error('A related appeal is required before editing this result', 403);
        }
    }
    if (isset($b['time'])) {
        $time = trim((string)$b['time']);
        if (parse_numeric_time_ms($time) === null) json_error('A valid time greater than zero is required', 422);
        $fields[] = 'time = ?'; $vals[] = $time;
    }
    if (isset($b['faults'])) {
        if (!is_array($b['faults'])) json_error('Faults must be an array', 422);
        $faultsJson = json_encode($b['faults'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $fields[] = 'faults = ?'; $vals[] = $faultsJson;
    }
    if (isset($b['scores'])) { $fields[] = 'scores = ?'; $vals[] = json_encode($b['scores']); $fields[] = 'total = ?'; $vals[] = array_sum((array)$b['scores']); }
    if (isset($b['status'])) { $fields[] = 'status = ?'; $vals[] = $b['status']; }
    if (isset($b['notes']))  { $fields[] = 'notes = ?';  $vals[] = $b['notes']; }
    if (empty($fields)) json_error('Nothing to update');
    $vals[] = $id;
    try {
        db()->prepare('UPDATE judge_results SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($vals);
    } catch (Throwable $error) {
        error_log('Failed to update judge result ' . $id . ': ' . $error->getMessage());
        json_error('تعذر تحديث النتيجة في قاعدة البيانات: ' . $error->getMessage(), 500);
    }
    json_ok(['message' => 'Result updated']);
}

json_error('Not found', 404);
