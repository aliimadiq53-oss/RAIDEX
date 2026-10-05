<?php
// ─── ONE-TIME SETUP SCRIPT ────────────────────────────────────────────────────
// Visit https://hr-ride.com/api/setup_users.php?confirm=RESET_USERS to reset users.
// DELETE this file after running it!
// ─────────────────────────────────────────────────────────────────────────────
require_once __DIR__ . '/helpers.php';

if (($_GET['confirm'] ?? '') !== 'RESET_USERS') {
    http_response_code(400);
    exit('Add ?confirm=RESET_USERS to delete all existing users and create the new administrator.');
}

$users = [
    ['id' => uuid(), 'name' => 'حسن الربيعي', 'username' => 'hs', 'email' => '', 'password' => '12344', 'role' => 'super_admin'],
];

db()->exec('DELETE FROM users');

$inserted = 0;
$skipped  = 0;

foreach ($users as $u) {
    $hash = password_hash($u['password'], PASSWORD_BCRYPT);
    db()->prepare('INSERT INTO users (id, name, username, email, password_hash, role, status, assigned_tournaments) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$u['id'], $u['name'], $u['username'], $u['email'], $hash, $u['role'], 'active', '[]']);
    $inserted++;
}

header('Content-Type: text/html; charset=utf-8');
echo "<h2>✅ Setup Complete</h2>";
echo "<p>Inserted: <b>$inserted</b> users</p>";
echo "<p>All previous users were deleted.</p>";
echo "<hr><h3>Test Credentials:</h3><ul>";
foreach ($users as $u) {
    echo "<li><b>{$u['username']}</b> / {$u['password']} — {$u['role']}</li>";
}
echo "</ul>";
echo "<p style='color:red'><b>⚠️ DELETE this file now from Hostinger File Manager!</b></p>";
