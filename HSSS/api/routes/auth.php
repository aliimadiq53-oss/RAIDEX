<?php
// POST /auth/login
// POST /auth/logout
// GET  /auth/me

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];

if ($method === 'POST' && $uri === '/login') {
    $b = body();
    $username = trim($b['username'] ?? '');
    $password = $b['password'] ?? '';
    if (!$username || !$password) json_error('Username and password required');

    $stmt = db()->prepare('SELECT * FROM users WHERE username = ? AND status = "active"');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_error('Invalid username or password', 401);
    }

    // Update last login
    db()->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$user['id']]);

    $token = jwt_create([
        'sub'      => $user['id'],
        'username' => $user['username'],
        'role'     => $user['role'],
    ]);

    unset($user['password_hash']);
    $user['assignedTournaments'] = json_decode($user['assigned_tournaments'] ?? '[]', true);
    unset($user['assigned_tournaments']);

    json_ok(['token' => $token, 'user' => $user]);
}

if ($method === 'GET' && $uri === '/me') {
    $auth = require_auth();
    $stmt = db()->prepare('SELECT id, name, username, email, role, status, assigned_tournaments, last_login FROM users WHERE id = ?');
    $stmt->execute([$auth['sub']]);
    $user = $stmt->fetch();
    if (!$user) json_error('User not found', 404);
    $user['assignedTournaments'] = json_decode($user['assigned_tournaments'] ?? '[]', true);
    unset($user['assigned_tournaments']);
    json_ok($user);
}

if ($method === 'POST' && $uri === '/logout') {
    json_ok(['message' => 'Logged out']);
}

json_error('Not found', 404);
