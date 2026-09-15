<?php
// config.php - Application Configuration

$CONFIG = [
    'debug' => true,
    'test_mode' => true,
];

function loadDotEnv($dir) {
    $path = $dir . '/.env';
    if (!file_exists($path) || !is_readable($path)) return;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        $eq = strpos($line, '=');
        if ($eq === false) continue;
        $key = trim(substr($line, 0, $eq));
        $val = trim(substr($line, $eq + 1));
        if (strlen($val) >= 2 && (($val[0] === '"' && $val[strlen($val)-1] === '"') || ($val[0] === "'" && $val[strlen($val)-1] === "'"))) {
            $val = substr($val, 1, -1);
        }
        if ($key !== '' && getenv($key) === false && !isset($_ENV[$key])) {
            putenv("$key=$val");
            $_ENV[$key] = $val;
        }
    }
}

loadDotEnv(__DIR__);
loadDotEnv(dirname(__DIR__));
if (file_exists(__DIR__ . '/../private/.env')) loadDotEnv(__DIR__ . '/../private');

$envSecret = getenv('JWT_SECRET') ?: ($_ENV['JWT_SECRET'] ?? '');
if ($envSecret !== '') {
    $CONFIG['jwt_secret'] = $envSecret;
} else {
    $CONFIG['jwt_secret'] = null;
}

$privateDb = dirname(__DIR__) . '/private/userdata.db';
$privateLogs = dirname(__DIR__) . '/private/logs';
if (file_exists($privateDb) || is_dir(dirname($privateDb))) {
    $CONFIG['db_path'] = $privateDb;
} else {
    $CONFIG['db_path'] = __DIR__ . '/userdata.db';
}
if (is_dir($privateLogs) || file_exists($privateLogs)) {
    $CONFIG['log_dir'] = $privateLogs;
} else {
    $CONFIG['log_dir'] = __DIR__ . '/logs';
}
