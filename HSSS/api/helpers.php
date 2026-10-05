<?php
require_once __DIR__ . '/config.php';

/* ── CORS ── */
function cors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, ALLOWED_ORIGINS, true)) {
        header("Access-Control-Allow-Origin: $origin");
    } else {
        header("Access-Control-Allow-Origin: https://hr-ride.com");
    }
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/* ── Response helpers ── */
function json_ok(mixed $data, int $code = 200): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $code = 400): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    if ($raw !== false && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) return $decoded;
        parse_str($raw, $parsed);
        if (is_array($parsed) && $parsed !== []) return $parsed;
    }
    if (!empty($_POST) && is_array($_POST)) return $_POST;
    return [];
}

/* ── UUID ── */
function uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

/* ── JWT ── */
function b64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function b64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwt_create(array $payload): string {
    $header  = b64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload['exp'] = time() + JWT_EXPIRY;
    $payload['iat'] = time();
    $body    = b64url_encode(json_encode($payload));
    $sig     = b64url_encode(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
    return "$header.$body.$sig";
}

function jwt_verify(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $body, $sig] = $parts;
    $expected = b64url_encode(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $payload = json_decode(b64url_decode($body), true);
    if (!$payload || (isset($payload['exp']) && $payload['exp'] < time())) return null;
    return $payload;
}

/* ── Auth middleware ── */
function require_auth(): array {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($header, 'Bearer ')) json_error('Unauthorized', 401);
    $token = substr($header, 7);
    $payload = jwt_verify($token);
    if (!$payload) json_error('Invalid or expired token', 401);
    return $payload;
}

function require_role(array $roles): array {
    $user = require_auth();
    if (!in_array($user['role'], $roles, true)) json_error('Forbidden', 403);
    return $user;
}

function require_permission(string $permission): array {
    $user = require_auth();
    if (in_array($user['role'] ?? '', ['super_admin', 'admin'], true)) return $user;

    $stmt = db()->prepare('SELECT permissions FROM role_permissions WHERE role = ?');
    $stmt->execute([$user['role'] ?? '']);
    $stored = $stmt->fetchColumn();
    $permissions = $stored === false ? null : json_decode($stored, true);

    if (is_array($permissions)) {
        $keyLabels = ['disqualify_player' => 'استبعاد لاعب', 'ban_player' => 'حظر لاعب'];
        $allowed = in_array($permission, $permissions, true) || ($permissions[$permission] ?? false) === true;
        foreach ($keyLabels as $key => $label) {
            if ($label === $permission && ($permissions[$key] ?? false) === true) $allowed = true;
        }
        if ($allowed) return $user;
    } elseif (($user['role'] ?? '') === 'judge' && in_array($permission, ['استبعاد لاعب', 'حظر لاعب'], true)) {
        return $user;
    }

    json_error('لا تملك صلاحية تنفيذ هذا الإجراء', 403);
}
