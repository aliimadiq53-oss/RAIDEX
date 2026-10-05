<?php
// POST /upload   — upload image, returns URL
// GET  /upload   — list uploaded files

$uri    = $GLOBALS['_URI'];
$method = $GLOBALS['_METHOD'];

$allowed_mime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
$max_size     = 5 * 1024 * 1024; // 5 MB

// Uploaded images are public site content; only UUID filenames and image types are served here.
if ($method === 'GET' && preg_match('#^s/([a-f0-9-]{36}\.(?:jpg|jpeg|png|webp|gif))$#i', $uri, $match)) {
    $path = UPLOAD_DIR . $match[1];
    if (!is_file($path)) json_error('Image not found', 404);

    $mime = mime_content_type($path);
    if (!in_array($mime, $allowed_mime, true)) json_error('Invalid image type', 404);

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

$auth = require_role(['super_admin', 'admin']);

if ($method === 'POST') {
    if (empty($_FILES['file'])) json_error('No file uploaded');
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) json_error('Upload error: ' . $file['error']);
    if ($file['size'] > $max_size) json_error('File too large (max 5 MB)');

    $mime = mime_content_type($file['tmp_name']);
    if (!in_array($mime, $allowed_mime, true)) json_error('Invalid file type. Allowed: jpg, png, webp, gif');

    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    $ext      = $extensions[$mime];
    $filename = uuid() . '.' . strtolower($ext);
    $dest     = UPLOAD_DIR . $filename;

    if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
    if (!move_uploaded_file($file['tmp_name'], $dest)) json_error('Failed to save file');

    $url  = UPLOAD_URL . $filename;
    $newId = uuid();
    db()->prepare('INSERT INTO uploads (id, filename, original_name, mime_type, size, url, uploaded_by) VALUES (?,?,?,?,?,?,?)')
        ->execute([$newId, $filename, $file['name'], $mime, $file['size'], $url, $auth['sub']]);

    json_ok(['id' => $newId, 'url' => $url, 'filename' => $filename]);
}

if ($method === 'GET') {
    $rows = db()->query('SELECT id, filename, original_name, mime_type, size, url, created_at FROM uploads ORDER BY created_at DESC LIMIT 100')->fetchAll();
    json_ok($rows);
}

json_error('Not found', 404);
