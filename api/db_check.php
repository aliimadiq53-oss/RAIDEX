<?php
header('Content-Type: application/json; charset=utf-8');

try {
    require_once __DIR__ . '/config.php';
    echo json_encode([
        'status' => 'config_loaded',
        'db_host' => DB_HOST,
        'db_name' => DB_NAME,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    echo json_encode([
        'status' => 'config_error',
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = db();
    $stmt = $pdo->query('SELECT 1');
    $value = $stmt ? $stmt->fetchColumn() : null;

    echo json_encode([
        'status' => 'db_ok',
        'db_query_result' => $value,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    echo json_encode([
        'status' => 'db_error',
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
