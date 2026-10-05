<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'u489632237_alafand1');
define('DB_USER', 'u489632237_alafand12');
define('DB_PASS', 'pRrgrm3nt?C0');
define('DB_CHARSET', 'utf8mb4');

define('JWT_SECRET', 'AlAfandi2026!SecretKey#Iraqi@Equestrian');
define('JWT_EXPIRY', 60 * 60 * 24 * 7); // 7 days

define('UPLOAD_DIR', __DIR__ . '/uploads/');
define('UPLOAD_URL', 'https://hr-ride.com/api/uploads/');
define('ALLOWED_ORIGINS', ['https://hr-ride.com', 'https://www.hr-ride.com', 'https://alafandiequestrian.eu', 'http://localhost:5173', 'http://localhost:8443']);

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}
