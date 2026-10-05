<?php
require_once __DIR__ . '/helpers.php';

cors();

$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Strip /api prefix if present
$uri = preg_replace('#^/api#', '', $uri);
$uri = rtrim($uri, '/') ?: '/';

// Route dispatch
$routes = [
    '#^/auth#'        => 'auth',
    '#^/users#'       => 'users',
    '#^/tournaments#' => 'tournaments',
    '#^/players#'     => 'players',
    '#^/horses#'      => 'horses',
    '#^/participants#'=> 'participants',
    '#^/rounds#'      => 'rounds',
    '#^/results#'     => 'results',
    '#^/appeals#'     => 'appeals',
    '#^/audit#'       => 'audit',
    '#^/settings#'    => 'settings',
    '#^/content#'     => 'content',
    '#^/live#'        => 'live',
    '#^/sync#'        => 'sync',
    '#^/upload#'      => 'upload',
];

foreach ($routes as $pattern => $file) {
    if (preg_match($pattern, $uri)) {
        // Pass sub-path to route file
        $GLOBALS['_URI']    = preg_replace($pattern, '', $uri) ?: '/';
        $GLOBALS['_METHOD'] = $method;
        require __DIR__ . "/routes/$file.php";
        exit;
    }
}

json_error('Not found', 404);
