<?php
// api.php - Simple Social API (max 3 levels indentation)
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logging.php';

ob_start();
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// ============== HELPER FUNCTIONS ==============
function getRawPostData() {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    parse_str($raw, $params);
    return $params;
}

$_POST = array_merge($_POST, getRawPostData());

function logMsg($msg) {
    global $CONFIG;
    if (empty($CONFIG['debug'])) return;
    $logDir = $CONFIG['log_dir'] ?? (__DIR__ . '/logs');
    if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
    $logFile = rtrim($logDir, '/') . '/api.log';
    $timestamp = date('Y-m-d H:i:s');
    $entry = "[$timestamp] $msg\n";
    @file_put_contents($logFile, $entry, FILE_APPEND | LOCK_EX);
}

function logRequest($action, $params = [], $isPublic = false) {
    $safeParams = $params;
    if (isset($safeParams['password'])) $safeParams['password'] = '***';
    if (isset($safeParams['confirm'])) $safeParams['confirm'] = '***';
    if (isset($safeParams['otp'])) $safeParams['otp'] = '***';
    if (isset($safeParams['reset_otp'])) $safeParams['reset_otp'] = '***';
    if (isset($safeParams['postText'])) $safeParams['postText'] = substr($safeParams['postText'], 0, 50) . (strlen($safeParams['postText']) > 50 ? '...' : '');
    if (isset($safeParams['text'])) $safeParams['text'] = substr($safeParams['text'], 0, 50) . (strlen($safeParams['text']) > 50 ? '...' : '');
    $paramsStr = json_encode($safeParams);
    logMsg("REQUEST: action=$action isPublic=" . ($isPublic ? 'true' : 'false') . " params=$paramsStr");
}

function logResponse($action, $success, $message = '') {
    $status = $success ? 'SUCCESS' : 'FAILED';
    logMsg("RESPONSE: action=$action status=$status message=$message");
}

function logError($action, $error) {
    logMsg("ERROR: action=$action error=$error");
    logApiError($action, $error);
}

function respond($data, $code = 200) {
    global $action;
    $success = ($code >= 200 && $code < 400) || ($data['valid'] ?? false);
    $message = $data['message'] ?? ($data['error'] ?? '');
    logResponse($action ?? 'unknown', $success, $message);
    ob_clean();
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function db() {
    global $CONFIG;
    $dbPath = $CONFIG['db_path'] ?? __DIR__ . '/userdata.db';
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT, recipient_id INTEGER NOT NULL,
        actor_id INTEGER NOT NULL, actor_email TEXT NOT NULL, type TEXT NOT NULL,
        post_id TEXT, created_at TEXT NOT NULL)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, post_id TEXT NOT NULL,
        user_id INTEGER NOT NULL, comment_text TEXT NOT NULL, created_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS auth_attempts (
        attempt_key TEXT PRIMARY KEY, failures INTEGER NOT NULL,
        window_start INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        filename TEXT NOT NULL, type TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL, post_id TEXT)');
    try {
        $cols = $pdo->query("PRAGMA table_info(media)")->fetchAll(PDO::FETCH_ASSOC);
        $hasPostId = false;
        foreach ($cols as $c) if ($c['name'] === 'post_id') $hasPostId = true;
        if (!$hasPostId) $pdo->exec('ALTER TABLE media ADD COLUMN post_id TEXT');
    } catch (Exception $e) {}
    try {
        $cols = $pdo->query("PRAGMA table_info(users)")->fetchAll(PDO::FETCH_ASSOC);
        $hasTheme = false;
        foreach ($cols as $c) if ($c['name'] === 'theme') $hasTheme = true;
        if (!$hasTheme) $pdo->exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'");
    } catch (Exception $e) {}
    return $pdo;
}

function jwtEncode($payload) {
    global $CONFIG;
    $secret = $CONFIG['jwt_secret'] ?? null;
    if (!$secret) { error_log('JWT secret not configured'); respond(['valid' => false, 'error' => 'Server misconfigured'], 500); }
    $header = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])));
    $payloadStr = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode(json_encode($payload)));
    $sig = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode(hash_hmac('sha256', "$header.$payloadStr", $secret, true)));
    return "$header.$payloadStr.$sig";
}

function jwtDecode($jwt) {
    global $action;
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return false;
    $base64 = $parts[1];
    $base64 = str_replace(['-', '_'], ['+', '/'], $base64);
    $pad = strlen($base64) % 4;
    if ($pad) $base64 .= str_repeat('=', 4 - $pad);
    $payload = json_decode(base64_decode($base64), true);
    logMsg("DECODE: payload=" . json_encode($payload));
    if (!$payload || !isset($payload['sub'])) return false;
    if (isset($payload['exp']) && time() > $payload['exp']) return false;
    return $payload;
}

function verifyUser($jwt, $pdo) {
    global $action;
    $payload = jwtDecode($jwt);
    logMsg("VERIFY: jwtDecode result=" . ($payload ? 'ok sub=' . ($payload['sub'] ?? 'none') : 'FAILED'));
    if (!$payload || !isset($payload['sub'])) return false;
    $stmt = $pdo->prepare('SELECT jwt FROM users WHERE id = ?');
    $stmt->execute([$payload['sub']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    logMsg("VERIFY: userId=" . $payload['sub'] . " row=" . ($row ? 'found' : 'NOT FOUND') . " jwt_field=" . ($row['jwt'] ?? 'NULL'));
    if (!$row || !$row['jwt']) return false;
    $stored = json_decode($row['jwt'], true);
    logMsg("VERIFY: stored=" . json_encode($stored));
    if (!$stored || !isset($stored['token']) || $jwt !== $stored['token']) return false;
    return $payload;
}

function requireAuth($pdo, $publicEndpoints) {
    global $action;
    global $CONFIG;
    if (in_array($action, $publicEndpoints)) return null;
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    logMsg("AUTH: all headers=" . json_encode(array_keys($_SERVER)));
    $jwt = '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $jwt = $matches[1];
    }
    logMsg("AUTH: action=$action authHeader=" . substr($authHeader, 0, 30) . " jwt=" . ($jwt ? substr($jwt, 0, 30) . '...' : 'NONE'));
    $user = verifyUser($jwt, $pdo);
    logMsg("AUTH: verifyUser result=" . ($user ? 'success sub=' . $user['sub'] : 'FAILED'));
    if (!$user) respond(['valid' => false, 'error' => 'Unauthorized'], 401);
    $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $user['email'] = $stmt->fetchColumn() ?: 'User';
    return $user;
}

function bad($msg, $code = 400) {
    global $action;
    logError($action ?? 'unknown', $msg);
    respond(['valid' => false, 'message' => $msg], $code);
}

function good($data = []) {
    return array_merge(['valid' => true], $data);
}

// Stored in place of an OTP once it has been verified. It can never match a
// submitted code because verify actions only accept 6 digits.
const OTP_VERIFIED = 'VERIFIED';

// ============== ATTEMPT LIMITS ==============
// Failed logins and OTP checks are counted per email and per IP. Too many
// failures inside the window locks that email (or IP) out for the window.
const ATTEMPT_WINDOW = 900;
const ATTEMPT_LIMIT_EMAIL = 5;
const ATTEMPT_LIMIT_IP = 20;

function attemptKeys($scope, $email) {
    return [
        'email' => "$scope:email:" . strtolower(trim($email)),
        'ip' => "$scope:ip:" . ($_SERVER['REMOTE_ADDR'] ?? '-'),
    ];
}

function checkAttemptLimit($pdo, $keys) {
    $stmt = $pdo->prepare('SELECT locked_until FROM auth_attempts WHERE attempt_key = ?');
    foreach ($keys as $key) {
        $stmt->execute([$key]);
        $lockedUntil = (int)$stmt->fetchColumn();
        if ($lockedUntil <= time()) continue;
        $minutes = (int)ceil(($lockedUntil - time()) / 60);
        bad("Too many attempts. Try again in $minutes minute" . ($minutes === 1 ? '' : 's') . '.', 429);
    }
}

// Returns true if this failure locked the email out.
function recordFailedAttempt($pdo, $keys) {
    $now = time();
    $limits = ['email' => ATTEMPT_LIMIT_EMAIL, 'ip' => ATTEMPT_LIMIT_IP];
    $select = $pdo->prepare('SELECT failures, window_start FROM auth_attempts WHERE attempt_key = ?');
    $save = $pdo->prepare('INSERT OR REPLACE INTO auth_attempts (attempt_key, failures, window_start, locked_until) VALUES (?, ?, ?, ?)');
    $emailLocked = false;
    foreach ($keys as $type => $key) {
        $select->execute([$key]);
        $row = $select->fetch(PDO::FETCH_ASSOC);
        $inWindow = $row && $now - $row['window_start'] < ATTEMPT_WINDOW;
        $failures = $inWindow ? $row['failures'] + 1 : 1;
        $windowStart = $inWindow ? $row['window_start'] : $now;
        $locked = $failures >= $limits[$type];
        $save->execute([$key, $locked ? 0 : $failures, $locked ? $now : $windowStart, $locked ? $now + ATTEMPT_WINDOW : 0]);
        if ($locked && $type === 'email') $emailLocked = true;
    }
    return $emailLocked;
}

function clearAttempts($pdo, $keys) {
    $pdo->prepare('DELETE FROM auth_attempts WHERE attempt_key = ?')->execute([$keys['email']]);
}

function validatePasswordRules($password) {
    if (strlen($password) < 8 || strlen($password) > 25) bad('Password must be 8-25 characters', 400);
    if (!preg_match('/[a-z]/', $password)) bad('Password must contain a lowercase letter', 400);
    if (!preg_match('/[A-Z]/', $password)) bad('Password must contain an uppercase letter', 400);
    if (!preg_match('/\d/', $password)) bad('Password must contain a number', 400);
    if (!preg_match('/[~!@#$%^&*()\-_+=\[\];\'"\/.,<>?:"{}|]/', $password)) bad('Password must contain a symbol', 400);
}

function validateContent($text, $errorMsg = 'You are trying to post illegal characters') {
    if (preg_match('/[^\x20-\x7E\n\r\xA0-\xFF]/u', $text)) bad($errorMsg, 400);
}

// ============== AUTH HANDLERS ==============
function handle_login($pdo) {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    if (!$email || !$password) bad('Missing credentials', 400);

    $keys = attemptKeys('login', $email);
    checkAttemptLimit($pdo, $keys);

    $stmt = $pdo->prepare('SELECT id, password, email FROM users WHERE LOWER(email) = LOWER(?)');
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user || !password_verify($password, $user['password'])) {
        recordFailedAttempt($pdo, $keys);
        bad('Invalid email or password', 401);
    }
    clearAttempts($pdo, $keys);

    $payload = ['sub' => $user['id'], 'exp' => time() + 86400];
    $jwt = jwtEncode($payload);
    $stmt = $pdo->prepare('UPDATE users SET jwt = ? WHERE id = ?');
    $stmt->execute([json_encode(['token' => $jwt]), $user['id']]);

    respond(good(['message' => 'Login successful', 'userId' => $user['id'], 'jwt' => $jwt]));
}

function handle_logout($pdo) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $jwt = '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $jwt = $matches[1];
    }
    if ($jwt) {
        $payload = jwtDecode($jwt);
        if ($payload && isset($payload['sub'])) {
            $stmt = $pdo->prepare('UPDATE users SET jwt = ? WHERE id = ?');
            $stmt->execute(['', $payload['sub']]);
        }
    }
    respond(good(['message' => 'Logged out']));
}

function handle_sendOTP($pdo) {
    $email = trim($_POST['email'] ?? '');
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) bad('Valid email required', 400);

    $stmt = $pdo->prepare('SELECT id, email FROM users WHERE LOWER(email) = LOWER(?)');
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) bad('No account found with this email', 404);

    $otp = sprintf("%06d", mt_rand(0, 999999));
    $stmt = $pdo->prepare('UPDATE users SET reset_otp = ?, reset_expires = ? WHERE id = ?');
    $stmt->execute([$otp, time() + 600, $row['id']]);

    $subject = 'Your Simple Social Password Reset OTP';
    $message = "Your 6-digit OTP code is: $otp\n\nValid for 10 minutes.\n\nIf you did not request this, ignore this email.";
    $headers = "From: no-reply@app.davidfruin.com\r\nReply-To: no-reply@app.davidfruin.com\r\n";

    mail($row['email'], $subject, $message, $headers) 
        ? respond(good(['message' => 'OTP sent to your email. Check inbox/spam.']))
        : bad('Failed to send email. Try again or contact support.', 500);
}

function handle_verifyOTP($pdo) {
    $email = trim($_POST['email'] ?? '');
    $otp = trim($_POST['otp'] ?? '');
    $keys = attemptKeys('otp', $email);
    checkAttemptLimit($pdo, $keys);
    if (!preg_match('/^\d{6}$/', $otp)) bad('Incorrect OTP', 400);

    $stmt = $pdo->prepare('SELECT id, reset_otp, reset_expires FROM users WHERE LOWER(email) = LOWER(?)');
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !$row['reset_otp']) bad('No OTP requested or expired', 400);
    if (time() > $row['reset_expires']) bad('OTP has expired. Please request a new one.', 400);
    if ($otp !== $row['reset_otp']) {
        if (recordFailedAttempt($pdo, $keys)) {
            $pdo->prepare('UPDATE users SET reset_otp = NULL, reset_expires = 0 WHERE id = ?')->execute([$row['id']]);
        }
        bad('Incorrect OTP', 400);
    }
    clearAttempts($pdo, $keys);

    // Mark verified so resetPassword can require it (valid 10 more minutes).
    $stmt = $pdo->prepare('UPDATE users SET reset_otp = ?, reset_expires = ? WHERE id = ?');
    $stmt->execute([OTP_VERIFIED, time() + 600, $row['id']]);
    respond(good(['message' => 'OTP verified! Set your new password.']));
}

function handle_resetPassword($pdo) {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    $confirm = $_POST['confirm'] ?? '';
    if (!$email || !$password || $password !== $confirm) bad('Passwords do not match or are empty', 400);
    validatePasswordRules($password);

    $stmt = $pdo->prepare('SELECT id, reset_otp, reset_expires FROM users WHERE LOWER(email) = LOWER(?)');
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) bad('User not found', 404);
    if ($row['reset_otp'] !== OTP_VERIFIED || time() > $row['reset_expires']) {
        bad('Verify your OTP before resetting your password', 403);
    }

    $hashed = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('UPDATE users SET password = ?, reset_otp = NULL, reset_expires = 0 WHERE id = ?');
    $stmt->execute([$hashed, $row['id']]);
    respond(good(['message' => 'Password reset successful! Please log in.']));
}

function handle_sendRegisterOTP($pdo) {
    $email = trim($_POST['email'] ?? '');
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) bad('Valid email required', 400);

    $stmt = $pdo->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)');
    $stmt->execute([$email]);
    if ($stmt->fetchColumn()) bad('Email already registered', 400);

    $otp = sprintf("%06d", mt_rand(0, 999999));
    $stmt = $pdo->prepare('DELETE FROM pending_users WHERE email = ?');
    $stmt->execute([$email]);
    $stmt = $pdo->prepare('INSERT INTO pending_users (email, password, otp, dateCreated) VALUES (?, ?, ?, ?)');
    $stmt->execute([$email, '', $otp, time()]);

    $subject = 'Your Simple Social Registration OTP';
    $message = "Your 6-digit OTP code is: $otp\n\nValid for 10 minutes.\n\nIf you did not request this, ignore this email.";
    $headers = "From: no-reply@app.davidfruin.com\r\nReply-To: no-reply@app.davidfruin.com\r\n";

    mail($email, $subject, $message, $headers)
        ? respond(good(['message' => 'OTP sent to your email. Check inbox/spam.']))
        : bad('Failed to send email.', 500);
}

function handle_verifyRegisterOTP($pdo) {
    $email = trim($_POST['email'] ?? '');
    $otp = trim($_POST['otp'] ?? '');
    if (!$email || strlen($otp) !== 6) bad('Email and 6-digit OTP required', 400);
    $keys = attemptKeys('regotp', $email);
    checkAttemptLimit($pdo, $keys);

    $stmt = $pdo->prepare('SELECT otp, dateCreated FROM pending_users WHERE email = ?');
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !$row['otp']) bad('No OTP requested', 400);
    if (time() - $row['dateCreated'] > 600) bad('OTP has expired. Please request a new one.', 400);
    if ($otp !== $row['otp']) {
        if (recordFailedAttempt($pdo, $keys)) {
            $pdo->prepare('DELETE FROM pending_users WHERE email = ?')->execute([$email]);
        }
        bad('Incorrect OTP', 400);
    }
    clearAttempts($pdo, $keys);

    // Mark verified so finishRegister can require it (valid 10 more minutes).
    $stmt = $pdo->prepare('UPDATE pending_users SET otp = ?, dateCreated = ? WHERE email = ?');
    $stmt->execute([OTP_VERIFIED, time(), $email]);
    respond(good(['message' => 'OTP verified! Set your password.']));
}

function handle_finishRegister($pdo) {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    $confirm = $_POST['confirm'] ?? '';

    if (!$email || !$password || $password !== $confirm) bad('Passwords do not match or are empty', 400);
    validatePasswordRules($password);

    $stmt = $pdo->prepare('SELECT otp, dateCreated FROM pending_users WHERE email = ?');
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !$row['otp'] || time() - $row['dateCreated'] > 600) bad('Session expired. Please start over.', 400);
    if ($row['otp'] !== OTP_VERIFIED) bad('Verify your OTP before creating your account', 403);

    $hashed = password_hash($password, PASSWORD_DEFAULT);
    $created_at = date('Y-m-d H:i:s');
    $stmt = $pdo->prepare('INSERT INTO users (email, password, posts, follows, followers, jwt, created_at) VALUES (?, ?, "[]", "[]", "[]", "", ?)');
    $stmt->execute([$email, $hashed, $created_at]);
    $stmt = $pdo->prepare('DELETE FROM pending_users WHERE email = ?');
    $stmt->execute([$email]);

    respond(good(['message' => 'Account created successfully!']));
}

// ============== PROTECTED HANDLERS ==============
function handle_deleteAccount($pdo, $user) {
    $password = $_POST['password'] ?? '';
    if (!$password) bad('Password required', 400);

    $stmt = $pdo->prepare('SELECT password FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $hash = $stmt->fetchColumn();
    if (!$hash || !password_verify($password, $hash)) bad('Incorrect password', 401);

    $uid = $user['sub'];
    $stmt = $pdo->prepare('DELETE FROM notifications WHERE recipient_id = ? OR actor_id = ?');
    $stmt->execute([$uid, $uid]);

    $stmt = $pdo->prepare('SELECT id, follows FROM users WHERE id != ?');
    $stmt->execute([$uid]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $follows = $row['follows'] ? json_decode($row['follows'], true) : [];
        if (is_array($follows)) {
            $updated = array_filter($follows, fn($f) => (is_array($f) ? $f['id'] : $f) != $uid);
            $stmtUpdate = $pdo->prepare('UPDATE users SET follows = ? WHERE id = ?');
            $stmtUpdate->execute([json_encode(array_values($updated)), $row['id']]);
        }
    }

    $stmt = $pdo->prepare('SELECT id, posts FROM users WHERE id != ?');
    $stmt->execute([$uid]);
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $posts = $row['posts'] ? json_decode($row['posts'], true) : [];
        if (is_array($posts)) {
            $updated = false;
            foreach ($posts as &$post) {
                if (isset($post['likes']) && is_array($post['likes'])) {
                    $originalCount = count($post['likes']);
                    $post['likes'] = array_filter($post['likes'], fn($like) => (is_array($like) ? $like['userId'] : $like) != $uid);
                    $post['likes'] = array_values($post['likes']);
                    if (count($post['likes']) !== $originalCount) $updated = true;
                }
            }
            if ($updated) {
                $stmtUpdate = $pdo->prepare('UPDATE users SET posts = ? WHERE id = ?');
                $stmtUpdate->execute([json_encode($posts), $row['id']]);
            }
        }
    }

    $stmt = $pdo->prepare('DELETE FROM comments WHERE user_id = ?');
    $stmt->execute([$uid]);
    $stmt = $pdo->prepare('SELECT path FROM media WHERE user_id = ?');
    $stmt->execute([$uid]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $f = __DIR__ . $r['path'];
        if (strpos($r['path'], '..') === false && file_exists($f)) @unlink($f);
        $tf = preg_replace('#/video/([^/]+)\.[^./]+$#', '/video/thumb_$1.webp', $f);
        if (file_exists($tf)) @unlink($tf);
    }
    $pdo->prepare('DELETE FROM media WHERE user_id = ?')->execute([$uid]);
    $mediaDir = __DIR__ . '/media/' . $uid;
    if (is_dir($mediaDir)) @rmdir($mediaDir . '/image') && @rmdir($mediaDir . '/video') && @rmdir($mediaDir . '/audio') && @rmdir($mediaDir);
    $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    respond(good(['message' => 'Account deleted successfully']));
}

function handle_getMyFollowers($pdo, $user) {
    $targetId = isset($_POST['userId']) ? (int)$_POST['userId'] : $user['sub'];
    if ($targetId <= 0) bad('Invalid user ID', 400);
    
    $stmt = $pdo->prepare('SELECT id, email, follows FROM users WHERE id != ?');
    $stmt->execute([$targetId]);
    $followers = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $followsData = $row['follows'] ? json_decode($row['follows'], true) : [];
        foreach ($followsData as $f) {
            if ((is_array($f) ? $f['id'] : $f) == $targetId) {
                $followers[] = ['id' => $row['id'], 'email' => $row['email'], 'timestamp' => is_array($f) ? $f['timestamp'] : 'Unknown'];
                break;
            }
        }
    }
    respond(good(['followers' => $followers]));
}

function handle_getMyFollows($pdo, $user) {
    $targetId = isset($_POST['userId']) ? (int)$_POST['userId'] : $user['sub'];
    if ($targetId <= 0) bad('Invalid user ID', 400);
    
    $stmt = $pdo->prepare('SELECT follows FROM users WHERE id = ?');
    $stmt->execute([$targetId]);
    $followsJson = $stmt->fetchColumn() ?: '[]';
    $followsData = json_decode($followsJson, true) ?? [];
    $result = [];
    $ids = array_map(fn($f) => is_array($f) ? $f['id'] : $f, $followsData);

    if (!empty($ids)) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT id, email FROM users WHERE id IN ($placeholders)");
        $stmt->execute($ids);
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($users as $u) {
            foreach ($followsData as $f) {
                if ((is_array($f) ? $f['id'] : $f) == $u['id']) {
                    $result[] = ['id' => $u['id'], 'email' => $u['email'], 'timestamp' => is_array($f) ? $f['timestamp'] : 'Unknown'];
                    break;
                }
            }
        }
    }
    respond(good(['follows' => $result]));
}

function handle_getNotifications($pdo, $user) {
    $offset = isset($_POST['offset']) ? (int)$_POST['offset'] : 0;
    $limit = 25;
    $stmt = $pdo->prepare('SELECT n.id, n.recipient_id, n.actor_id, COALESCE(u.email, n.actor_email) AS actor_email, n.type, n.post_id, n.created_at FROM notifications n LEFT JOIN users u ON n.actor_id = u.id WHERE n.recipient_id = ? AND n.actor_id != ? ORDER BY n.created_at DESC LIMIT ? OFFSET ?');
    $stmt->execute([$user['sub'], $user['sub'], $limit, $offset]);
    respond(good(['notifications' => $stmt->fetchAll(PDO::FETCH_ASSOC)]));
}

function handle_getUnseenNotificationCount($pdo, $user) {
    $stmt = $pdo->prepare('SELECT last_notifications_seen_at FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $lastSeen = $stmt->fetchColumn();

    if (!$lastSeen) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE recipient_id = ? AND actor_id != ?');
        $stmt->execute([$user['sub'], $user['sub']]);
    } else {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE recipient_id = ? AND actor_id != ? AND created_at > ?');
        $stmt->execute([$user['sub'], $user['sub'], $lastSeen]);
    }

    $count = (int)$stmt->fetchColumn();
    respond(good(['count' => $count]));
}

function handle_markNotificationsSeen($pdo, $user) {
    $stmt = $pdo->prepare('UPDATE users SET last_notifications_seen_at = ? WHERE id = ?');
    $stmt->execute([date('Y-m-d H:i:s'), $user['sub']]);
    respond(good(['message' => 'Notifications marked as seen']));
}

function handle_getPostById($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    if (!$postId) bad('Post ID required', 400);
    
    $ownerId = (int)explode('.', $postId)[0];
    $stmt = $pdo->prepare('SELECT posts FROM users WHERE id = ?');
    $stmt->execute([$ownerId]);
    $postsJson = $stmt->fetchColumn();
    $posts = json_decode($postsJson, true) ?? [];
    
    foreach ($posts as $post) {
        if ($post['id'] === $postId) {
            $ownerStmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
            $ownerStmt->execute([$ownerId]);
            $ownerEmail = $ownerStmt->fetchColumn() ?: '';
            $post['userID'] = $ownerId;
            $post['userEmail'] = $ownerEmail;
            respond(good(['post' => $post]));
            return;
        }
    }
    bad('Post not found', 404);
}

function handle_getPostPreviews($pdo, $user) {
    $postIdsRaw = $_POST['postIds'] ?? '[]';
    $postIds = json_decode($postIdsRaw, true) ?? [];
    if (!is_array($postIds) || empty($postIds)) {
        respond(good(['previews' => []]));
        return;
    }

    $previews = [];
    $ownerIds = [];
    foreach ($postIds as $pid) {
        $ownerId = (int)explode('.', $pid)[0];
        $ownerIds[$ownerId] = true;
    }

    $ids = array_keys($ownerIds);
    if (empty($ids)) {
        respond(good(['previews' => []]));
        return;
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare('SELECT id, posts FROM users WHERE id IN (' . $placeholders . ')');
    $stmt->execute($ids);
    $rows = $stmt->fetchAll();

    foreach ($rows as $row) {
        $posts = json_decode($row['posts'], true) ?? [];
        foreach ($posts as $post) {
            if (in_array($post['id'], $postIds) && !empty($post['text'])) {
                $previews[$post['id']] = substr($post['text'], 0, 25) . '...';
            }
        }
    }

    respond(good(['previews' => $previews]));
}

function handle_post($pdo, $user) {
    $text = trim($_POST['postText'] ?? '');
    if (!$text) bad('Post text required', 400);
    if (strlen($text) > 5000) bad('You are trying to make a post that is longer than 5K characters', 400);
    validateContent($text, 'You are trying to post illegal characters');

    $uid = $user['sub'];
    $stmt = $pdo->prepare('SELECT posts FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $postsJson = $stmt->fetchColumn();
    $posts = $postsJson ? json_decode($postsJson, true) : [];
    if (!is_array($posts)) $posts = [];

    $rawMedia = $_POST['mediaUrl'] ?? null;
    if ($rawMedia === 'null' || $rawMedia === '') $rawMedia = null;
    if ($rawMedia !== null) {
        $stmt = $pdo->prepare('SELECT id FROM media WHERE path = ? AND user_id = ?');
        $stmt->execute([$rawMedia, $uid]);
        $mediaRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$mediaRow) bad('Invalid mediaUrl or not owned by user', 400);
    }
    $newPost = ['id' => $uid . '.' . time(), 'text' => $text, 'timestamp' => date('Y-m-d H:i:s'), 'likes' => [], 'mediaUrl' => $rawMedia];
    array_unshift($posts, $newPost);
    $stmt = $pdo->prepare('UPDATE users SET posts = ? WHERE id = ?');
    $stmt->execute([json_encode($posts), $uid]);
    if ($rawMedia !== null) {
        $stmt = $pdo->prepare('UPDATE media SET post_id = ? WHERE path = ? AND user_id = ?');
        $stmt->execute([$newPost['id'], $rawMedia, $uid]);
    }
    respond(good(['postId' => $newPost['id']]));
}

function handle_getMyPosts($pdo, $user) {
    $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 25;
    $offset = isset($_POST['offset']) ? (int)$_POST['offset'] : 0;
    $uid = $user['sub'];

    $stmt = $pdo->prepare('SELECT posts FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $postsJson = $stmt->fetchColumn();
    $posts = $postsJson ? json_decode($postsJson, true) : [];
    if (!is_array($posts)) $posts = [];

    $totalCount = count($posts);
    foreach ($posts as &$post) {
        $post['userID'] = $uid;
        $post['userEmail'] = $user['email'];
    }
    usort($posts, fn($a, $b) => strtotime($b['timestamp'] ?? '') <=> strtotime($a['timestamp'] ?? ''));
    $posts = array_slice($posts, $offset, $limit);
    $hasMore = ($offset + $limit) < $totalCount;

    respond(good(['posts' => $posts, 'hasMore' => $hasMore, 'totalCount' => $totalCount]));
}

function handle_getUserPosts($pdo, $user) {
    $targetId = (int)($_POST['userId'] ?? 0);
    if ($targetId <= 0) bad('Invalid user ID', 400);

    $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 25;
    $offset = isset($_POST['offset']) ? (int)$_POST['offset'] : 0;

    $stmt = $pdo->prepare('SELECT posts FROM users WHERE id = ?');
    $stmt->execute([$targetId]);
    $postsJson = $stmt->fetchColumn();
    $posts = $postsJson ? json_decode($postsJson, true) : [];
    if (!is_array($posts)) $posts = [];

    $totalCount = count($posts);
    $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$targetId]);
    $targetEmail = $stmt->fetchColumn() ?: 'User ' . $targetId;
    foreach ($posts as &$post) {
        $post['userID'] = $targetId;
        $post['userEmail'] = $targetEmail;
    }
    usort($posts, fn($a, $b) => strtotime($b['timestamp'] ?? '') <=> strtotime($a['timestamp'] ?? ''));
    $posts = array_slice($posts, $offset, $limit);
    $hasMore = ($offset + $limit) < $totalCount;

    respond(good(['posts' => $posts, 'hasMore' => $hasMore, 'totalCount' => $totalCount]));
}

function handle_getUserInfo($pdo, $user) {
    $targetId = (int)($_POST['userId'] ?? 0);
    if ($targetId <= 0) bad('Invalid user ID', 400);

    $stmt = $pdo->prepare('SELECT email, created_at FROM users WHERE id = ?');
    $stmt->execute([$targetId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) bad('User not found', 404);

    respond(good(['email' => $row['email'], 'created_at' => $row['created_at'] ?: 'Unknown']));
}

function handle_getUsers($pdo, $user) {
    $stmt = $pdo->prepare('SELECT id, email, created_at FROM users WHERE id != ? ORDER BY email ASC');
    $stmt->execute([$user['sub']]);
    respond(good(['users' => $stmt->fetchAll(PDO::FETCH_ASSOC)]));
}

function handle_getUserEmails($pdo, $user) {
    $userIdsJson = $_POST['userIds'] ?? '[]';
    $userIds = json_decode($userIdsJson, true);
    if (!is_array($userIds) || empty($userIds)) respond(good(['emails' => []]));

    $placeholders = implode(',', array_fill(0, count($userIds), '?'));
    $stmt = $pdo->prepare("SELECT id, email FROM users WHERE id IN ($placeholders)");
    $stmt->execute($userIds);
    $emails = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) $emails[$row['id']] = $row['email'];
    respond(good(['emails' => $emails]));
}

function handle_getMyInfo($pdo, $user) {
    $stmt = $pdo->prepare('SELECT id, email, created_at, theme FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    respond(good(['id' => $user['sub'], 'userId' => $user['sub'], 'email' => $row['email'] ?? 'User', 'created_at' => $row['created_at'] ?? 'Unknown', 'theme' => $row['theme'] ?: 'light']));
}

function handle_updateTheme($pdo, $user) {
    $theme = $_POST['theme'] ?? '';
    $allowedThemes = ['light', 'dark', 'red', 'blue'];
    if (!in_array($theme, $allowedThemes, true)) bad('Invalid theme', 400);

    $stmt = $pdo->prepare('UPDATE users SET theme = ? WHERE id = ?');
    $stmt->execute([$theme, $user['sub']]);
    respond(good(['message' => 'Theme updated']));
}

function handle_fetchFollowedPosts($pdo, $user) {
    $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 25;
    $offset = isset($_POST['offset']) ? (int)$_POST['offset'] : 0;
    $uid = $user['sub'];

    $stmt = $pdo->prepare('SELECT follows FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $followsJson = $stmt->fetchColumn() ?: '[]';
    $followedData = json_decode($followsJson, true) ?? [];

    $followedIds = array_unique(array_merge(array_map(fn($f) => is_array($f) ? $f['id'] : $f, $followedData), [$uid]));
    $allPosts = [];
    $userIdToEmail = [];

    if (!empty($followedIds)) {
        $placeholders = implode(',', array_fill(0, count($followedIds), '?'));
        $stmt = $pdo->prepare("SELECT id, email FROM users WHERE id IN ($placeholders)");
        $stmt->execute(array_values($followedIds));
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) $userIdToEmail[$row['id']] = $row['email'];
    }

    foreach ($followedIds as $fid) {
        $stmt = $pdo->prepare('SELECT posts FROM users WHERE id = ?');
        $stmt->execute([$fid]);
        $postsJson = $stmt->fetchColumn();
        if ($postsJson) {
            $userPosts = json_decode($postsJson, true) ?? [];
            foreach ($userPosts as $post) {
                $post['userID'] = $fid;
                $post['userEmail'] = $userIdToEmail[$fid] ?? 'User ' . $fid;
                $allPosts[] = $post;
            }
        }
    }

    usort($allPosts, fn($a, $b) => strtotime($b['timestamp'] ?? '') <=> strtotime($a['timestamp'] ?? ''));
    $totalCount = count($allPosts);
    $allPosts = array_slice($allPosts, $offset, $limit);
    $hasMore = ($offset + $limit) < $totalCount;

    respond(good(['posts' => $allPosts, 'hasMore' => $hasMore, 'totalCount' => $totalCount]));
}

function handle_likePost($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    if (!$postId) bad('Missing post ID', 400);

    $ownerId = (int)explode('.', $postId)[0];
    if ($ownerId == $user['sub']) bad('Cannot like your own post', 400);

    // Get current user's email for notification
    $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $userRow = $stmt->fetch(PDO::FETCH_ASSOC);
    $actorEmail = $userRow['email'] ?? 'Unknown';

    $stmt = $pdo->prepare('SELECT posts, email FROM users WHERE id = ?');
    $stmt->execute([$ownerId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) bad('Post owner not found', 404);

    $postsJson = $row['posts'];
    $posts = json_decode($postsJson, true) ?? [];
    $postFound = false;

    foreach ($posts as &$post) {
        if ($post['id'] === $postId) {
            $postFound = true;
            if (!isset($post['likes'])) $post['likes'] = [];
            $alreadyLiked = in_array($user['sub'], array_column($post['likes'], 'userId'));
            if (!$alreadyLiked) {
                $post['likes'][] = ['userId' => $user['sub'], 'timestamp' => date('Y-m-d H:i:s')];
                if ($ownerId != $user['sub']) {
                    $stmt = $pdo->prepare('INSERT INTO notifications (recipient_id, actor_id, actor_email, type, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
                    $stmt->execute([$ownerId, $user['sub'], $actorEmail, 'like', $postId, date('Y-m-d H:i:s')]);
                }
            }
            break;
        }
    }
    if (!$postFound) bad('Post not found', 404);

    $stmt = $pdo->prepare('UPDATE users SET posts = ? WHERE id = ?');
    $stmt->execute([json_encode($posts), $ownerId]);
    respond(good(['liked' => true]));
}

function handle_unlikePost($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    if (!$postId) bad('Missing post ID', 400);

    $ownerId = (int)explode('.', $postId)[0];

    // Get current user's email for notification
    $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $userRow = $stmt->fetch(PDO::FETCH_ASSOC);
    $actorEmail = $userRow['email'] ?? 'Unknown';

    $stmt = $pdo->prepare('SELECT posts, email FROM users WHERE id = ?');
    $stmt->execute([$ownerId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) bad('Post owner not found', 404);

    $postsJson = $row['posts'];
    $posts = json_decode($postsJson, true) ?? [];

    $postFound = false;
    $wasLiked = false;
    foreach ($posts as &$post) {
        if ($post['id'] === $postId) {
            $postFound = true;
            if (isset($post['likes'])) {
                $before = count($post['likes']);
                $post['likes'] = array_filter($post['likes'], fn($like) => $like['userId'] != $user['sub']);
                $post['likes'] = array_values($post['likes']);
                $wasLiked = count($post['likes']) < $before;
                if ($wasLiked && $ownerId != $user['sub']) {
                    $stmt = $pdo->prepare('INSERT INTO notifications (recipient_id, actor_id, actor_email, type, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
                    $stmt->execute([$ownerId, $user['sub'], $actorEmail, 'unlike', $postId, date('Y-m-d H:i:s')]);
                }
            }
            break;
        }
    }
    if (!$postFound) bad('Post not found', 404);

    $stmt = $pdo->prepare('UPDATE users SET posts = ? WHERE id = ?');
    $stmt->execute([json_encode($posts), $ownerId]);
    respond(good(['liked' => false]));
}

function handle_getPostLikes($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    if (!$postId) bad('Missing post ID', 400);

    $ownerId = (int)explode('.', $postId)[0];
    $stmt = $pdo->prepare('SELECT posts FROM users WHERE id = ?');
    $stmt->execute([$ownerId]);
    $postsJson = $stmt->fetchColumn();
    if (!$postsJson) bad('Post not found', 404);

    $posts = json_decode($postsJson, true) ?? [];
    $likes = [];

    foreach ($posts as &$post) {
        if (isset($post['id']) && $post['id'] === $postId) {
            $likes = $post['likes'] ?? [];
            break;
        }
    }

    respond(good(['likes' => $likes]));
}

function handle_followUser($pdo, $user) {
    $targetId = (int)($_POST['userId'] ?? 0);
    if ($targetId <= 0 || $targetId == $user['sub']) bad('Invalid user ID', 400);

    $uid = $user['sub'];
    $stmt = $pdo->prepare('SELECT follows, email FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $followsJson = $row['follows'] ?: '[]';
    $actorEmail = $row['email'];
    $follows = json_decode($followsJson, true) ?? [];

    $already = false;
    foreach ($follows as $f) if ((is_array($f) ? $f['id'] : $f) == $targetId) $already = true;
    if (!$already) {
        $follows[] = ['id' => $targetId, 'timestamp' => date('Y-m-d H:i:s')];
        $stmt = $pdo->prepare('UPDATE users SET follows = ? WHERE id = ?');
        $stmt->execute([json_encode($follows), $uid]);
        $stmt = $pdo->prepare('INSERT INTO notifications (recipient_id, actor_id, actor_email, type, created_at) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$targetId, $uid, $actorEmail, 'follow', date('Y-m-d H:i:s')]);
    }

    respond(good(['following' => true]));
}

function handle_unfollowUser($pdo, $user) {
    $targetId = (int)($_POST['userId'] ?? 0);
    if ($targetId <= 0 || $targetId == $user['sub']) bad('Invalid user ID', 400);

    $uid = $user['sub'];
    $stmt = $pdo->prepare('SELECT follows, email FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $followsJson = $row['follows'] ?: '[]';
    $actorEmail = $row['email'];
    $follows = json_decode($followsJson, true) ?? [];

    $follows = array_filter($follows, fn($f) => (is_array($f) ? $f['id'] : $f) != $targetId);
    $follows = array_values($follows);
    $stmt = $pdo->prepare('UPDATE users SET follows = ? WHERE id = ?');
    $stmt->execute([json_encode($follows), $uid]);

    $stmt = $pdo->prepare('INSERT INTO notifications (recipient_id, actor_id, actor_email, type, created_at) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$targetId, $uid, $actorEmail, 'unfollow', date('Y-m-d H:i:s')]);

    respond(good(['following' => false]));
}

function handle_isFollowing($pdo, $user) {
    $targetId = (int)($_POST['userId'] ?? 0);
    if ($targetId <= 0 || $targetId == $user['sub']) bad('Invalid user ID', 400);

    $stmt = $pdo->prepare('SELECT follows FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $followsJson = $stmt->fetchColumn() ?: '[]';
    $follows = json_decode($followsJson, true) ?? [];

    $is = false;
    foreach ($follows as $f) if ((is_array($f) ? $f['id'] : $f) == $targetId) $is = true;

    respond(good(['following' => $is]));
}

function handle_deletePost($pdo, $user) {
    global $action;
    $postId = trim($_POST['postId'] ?? '');
    if (!$postId) bad('Missing post ID', 400);

    $ownerId = (int)explode('.', $postId)[0];
    if ($ownerId != $user['sub']) bad('You can only delete your own posts', 403);

    $stmt = $pdo->prepare('SELECT posts FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $postsJson = $stmt->fetchColumn() ?: '[]';
    $posts = json_decode($postsJson, true) ?? [];

    $postToDelete = null;
    foreach ($posts as $post) {
        if ($post['id'] === $postId) {
            $postToDelete = $post;
            break;
        }
    }

    $newPosts = array_filter($posts, fn($post) => $post['id'] !== $postId);
    $newPosts = array_values($newPosts);
    $stmt = $pdo->prepare('UPDATE users SET posts = ? WHERE id = ?');
    $stmt->execute([json_encode($newPosts), $user['sub']]);

    $stmt = $pdo->prepare('DELETE FROM notifications WHERE post_id = ?');
    $stmt->execute([$postId]);

    if ($postToDelete && !empty($postToDelete['mediaUrl']) && $postToDelete['mediaUrl'] !== 'null') {
        $mediaUrl = $postToDelete['mediaUrl'];
        if (strpos($mediaUrl, '..') === false && strpos($mediaUrl, '/') === 0) {
            $stmt = $pdo->prepare('SELECT id, path FROM media WHERE path = ? AND user_id = ?');
            $stmt->execute([$mediaUrl, $user['sub']]);
            $mediaRow = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($mediaRow) {
                $mediaFile = __DIR__ . $mediaRow['path'];
                if (file_exists($mediaFile)) unlink($mediaFile);
                if (strpos($mediaRow['path'], '/video/') !== false) {
                    $thumbFile = preg_replace('#/video/([^/]+)\.[^./]+$#', '/video/thumb_$1.webp', $mediaFile);
                    if (file_exists($thumbFile)) unlink($thumbFile);
                }
                $stmt = $pdo->prepare('DELETE FROM media WHERE id = ?');
                $stmt->execute([$mediaRow['id']]);
            }
        }
    }

    respond(good(['deleted' => true]));
}


function handle_createComment($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    $text = trim($_POST['text'] ?? '');
    if (!$postId) bad('Missing post ID', 400);
    if (!$text) bad('Comment text required', 400);
    if (strlen($text) > 5000) bad('Comment too long (max 5000 chars)', 400);
    validateContent($text, 'Illegal characters in comment');

    $stmt = $pdo->prepare('INSERT INTO comments (post_id, user_id, comment_text, created_at) VALUES (?, ?, ?, ?)');
    $stmt->execute([$postId, $user['sub'], $text, date('Y-m-d H:i:s')]);
    $commentId = $pdo->lastInsertId();

    $ownerId = (int)explode('.', $postId)[0];
    if ($ownerId != $user['sub']) {
        $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
        $stmt->execute([$user['sub']]);
        $actorEmail = $stmt->fetchColumn();
        $stmt = $pdo->prepare('INSERT INTO notifications (recipient_id, actor_id, actor_email, type, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$ownerId, $user['sub'], $actorEmail, 'comment', $postId, date('Y-m-d H:i:s')]);
    }

    respond(good(['commentId' => $commentId]));
}

function handle_getPostComments($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 25;
    $offset = isset($_POST['offset']) ? (int)$_POST['offset'] : 0;
    if (!$postId) bad('Missing post ID', 400);

    $stmt = $pdo->prepare('SELECT c.id, c.post_id, c.user_id, c.comment_text as text, c.created_at, u.email as user_email FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at DESC LIMIT ? OFFSET ?');
    $stmt->execute([$postId, $limit, $offset]);
    $comments = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM comments WHERE post_id = ?');
    $stmt->execute([$postId]);
    $totalCount = $stmt->fetchColumn();
    $hasMore = ($offset + $limit) < $totalCount;

    respond(good(['comments' => $comments, 'hasMore' => $hasMore, 'totalCount' => $totalCount]));
}

function handle_deleteComment($pdo, $user) {
    $commentId = (int)($_POST['commentId'] ?? 0);
    if (!$commentId) bad('Missing comment ID', 400);

    $stmt = $pdo->prepare('SELECT user_id FROM comments WHERE id = ?');
    $stmt->execute([$commentId]);
    $ownerId = $stmt->fetchColumn();
    if (!$ownerId) bad('Comment not found', 404);
    if ($ownerId != $user['sub']) bad('Can only delete your own comments', 403);

    $stmt = $pdo->prepare('DELETE FROM comments WHERE id = ?');
    $stmt->execute([$commentId]);

    respond(good(['deleted' => true]));
}

function handle_getPostCommentCounts($pdo, $user) {
    $postIdsJson = $_POST['postIds'] ?? '[]';
    $postIds = json_decode($postIdsJson, true);
    if (!is_array($postIds) || empty($postIds)) respond(good(['counts' => []]));

    $counts = [];
    foreach ($postIds as $postId) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM comments WHERE post_id = ?');
        $stmt->execute([$postId]);
        $counts[$postId] = (int)$stmt->fetchColumn();
    }

    respond(good(['counts' => $counts]));
}

// ============== DISPATCHER ==============
$PUBLIC_ENDPOINTS = ['login', 'logout', 'sendOTP', 'verifyOTP', 'resetPassword', 'sendRegisterOTP', 'verifyRegisterOTP', 'finishRegister'];

$HANDLERS = [
    'login' => 'handle_login', 'logout' => 'handle_logout', 'sendOTP' => 'handle_sendOTP',
    'verifyOTP' => 'handle_verifyOTP', 'resetPassword' => 'handle_resetPassword',
    'sendRegisterOTP' => 'handle_sendRegisterOTP', 'verifyRegisterOTP' => 'handle_verifyRegisterOTP',
    'finishRegister' => 'handle_finishRegister', 'deleteAccount' => 'handle_deleteAccount',
    'getMyFollowers' => 'handle_getMyFollowers', 'getMyFollows' => 'handle_getMyFollows',
    'getNotifications' => 'handle_getNotifications', 'getUnseenNotificationCount' => 'handle_getUnseenNotificationCount',
    'post' => 'handle_post',
    'getMyPosts' => 'handle_getMyPosts', 'getUserPosts' => 'handle_getUserPosts',
    'getUserInfo' => 'handle_getUserInfo', 'getUsers' => 'handle_getUsers', 'getUserEmails' => 'handle_getUserEmails',
    'getMyInfo' => 'handle_getMyInfo', 'fetchFollowedPosts' => 'handle_fetchFollowedPosts',
    'likePost' => 'handle_likePost', 'unlikePost' => 'handle_unlikePost', 'getPostLikes' => 'handle_getPostLikes',
    'followUser' => 'handle_followUser', 'unfollowUser' => 'handle_unfollowUser',
    'isFollowing' => 'handle_isFollowing', 'deletePost' => 'handle_deletePost',
    'createComment' => 'handle_createComment', 'getPostComments' => 'handle_getPostComments',
    'deleteComment' => 'handle_deleteComment', 'getPostCommentCounts' => 'handle_getPostCommentCounts',
    'markNotificationsSeen' => 'handle_markNotificationsSeen', 'getPostById' => 'handle_getPostById',
    'getPostPreviews' => 'handle_getPostPreviews',
    'updateTheme' => 'handle_updateTheme',
    'log' => 'handle_log_request'
];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') bad('Method not allowed', 405);
$action = $_POST['action'] ?? null;
if (!$action) bad('Missing action', 400);
if (!isset($HANDLERS[$action])) bad('Unknown action', 400);

$pdo = db();
$isPublic = in_array($action, $PUBLIC_ENDPOINTS);
logRequest($action, $_POST, $isPublic);

$user = requireAuth($pdo, $PUBLIC_ENDPOINTS);

try {
    $handler = $HANDLERS[$action];
    $handler($pdo, $user);
} catch (Exception $e) {
    logError($action, $e->getMessage());
    respond(['valid' => false, 'error' => 'Server error. Please try again.'], 500);
} catch (Error $e) {
    logError($action, $e->getMessage());
    respond(['valid' => false, 'error' => 'Server error. Please try again.'], 500);
}
