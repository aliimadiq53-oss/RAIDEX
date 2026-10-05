<?php
header('Content-Type: application/json; charset=utf-8');

echo json_encode([
    'status' => 'hello',
    'root' => __DIR__,
    'config_exists' => file_exists(__DIR__ . '/config.php'),
    'helpers_exists' => file_exists(__DIR__ . '/helpers.php'),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
