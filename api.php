<?php
// api.php - Simple Social API (max 3 levels indentation)
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logging.php';
require_once __DIR__ . '/webpush.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/auth.php';
// Composer's autoload.files loads src/Auth/handlers.php (and any future
// module files) unconditionally, same as the require_once lines above -
// this is a folder-level move, not a switch to lazy/class autoloading.
require_once __DIR__ . '/vendor/autoload.php';

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
    // A refresh token is a 30-day credential for the whole account, so it
    // must never reach the log - more sensitive than the access token, not
    // less, because it long outlives it.
    if (isset($safeParams['refreshToken'])) $safeParams['refreshToken'] = '***';
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
    // `media` and its post_id migration live in schema.php - media.php needs
    // the same table, and keeping one copy is the whole point of that file.
    // One row per browser/device a user has enabled push on. endpoint is
    // unique so re-subscribing the same browser replaces its row instead of
    // piling up duplicates.
    $pdo->exec('CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
        created_at TEXT NOT NULL)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)');
    try {
        $cols = $pdo->query("PRAGMA table_info(users)")->fetchAll(PDO::FETCH_ASSOC);
        $hasTheme = false;
        $hasHand = false;
        foreach ($cols as $c) {
            if ($c['name'] === 'theme') $hasTheme = true;
            if ($c['name'] === 'hand') $hasHand = true;
        }
        if (!$hasTheme) $pdo->exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'");
        if (!$hasHand) $pdo->exec("ALTER TABLE users ADD COLUMN hand TEXT NOT NULL DEFAULT 'right'");
    } catch (Exception $e) {}
    ensureSharedSchema($pdo);
    return $pdo;
}

// jwtEncode/jwtVerify/verifyUser now live in auth.php, shared with media.php.

function requireAuth($pdo, $publicEndpoints) {
    global $action;
    global $CONFIG;
    if (in_array($action, $publicEndpoints)) return null;
    $jwt = bearerToken();
    $user = verifyUser($jwt, $pdo);
    logMsg("AUTH: action=$action result=" . ($user ? 'ok sub=' . $user['sub'] . ' sid=' . $user['sid'] : 'FAILED'));
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

// ============== NOTIFICATIONS ==============
// The one place a notification gets created: writes the row the bell icon
// reads, then pushes it to whatever devices the recipient has enabled push
// on. Push failures are swallowed -- a dead subscription must never break
// the like/comment/follow that triggered it.
function createNotification($pdo, $recipientId, $actorId, $actorEmail, $type, $postId = null) {
    $now = date('Y-m-d H:i:s');
    if ($postId === null) {
        $stmt = $pdo->prepare('INSERT INTO notifications (recipient_id, actor_id, actor_email, type, created_at) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$recipientId, $actorId, $actorEmail, $type, $now]);
    } else {
        $stmt = $pdo->prepare('INSERT INTO notifications (recipient_id, actor_id, actor_email, type, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([$recipientId, $actorId, $actorEmail, $type, $postId, $now]);
    }

    try {
        pushNotification($pdo, $recipientId, $actorEmail, $type, $postId, $actorId);
    } catch (Exception $e) {
        logMsg("push failed: " . $e->getMessage());
    } catch (Error $e) {
        logMsg("push failed: " . $e->getMessage());
    }
}

function notificationText($actorEmail, $type) {
    switch ($type) {
        case 'like': return "$actorEmail liked your post";
        case 'unlike': return "$actorEmail unliked your post";
        case 'comment': return "$actorEmail commented on your post";
        case 'follow': return "$actorEmail started following you";
        case 'unfollow': return "$actorEmail unfollowed you";
        case 'mention': return "$actorEmail mentioned you in a post";
    }
    return "$actorEmail did something";
}

function pushNotification($pdo, $recipientId, $actorEmail, $type, $postId, $actorId) {
    global $CONFIG;
    if (empty($CONFIG['vapid_public']) || empty($CONFIG['vapid_private'])) return;

    $stmt = $pdo->prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
    $stmt->execute([$recipientId]);
    $subscriptions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!$subscriptions) return;

    $url = $postId ? "/app.html#/post/$postId" : "/app.html#/profile/$actorId";
    // The service worker re-asserts this count against the OS home-screen
    // badge on every notification event it sees (shown, clicked, swiped
    // away) - the badge is only ever meant to change via "mark as read", so
    // it has to keep reapplying the real count rather than trust whatever
    // the OS did on its own.
    $payload = [
        'title' => 'Simple Social',
        'body' => notificationText($actorEmail, $type),
        'url' => $url,
        'count' => getUnseenNotificationCount($pdo, $recipientId),
    ];
    $subject = $CONFIG['vapid_subject'] ?? 'noreply@davidfruin.com';

    foreach ($subscriptions as $sub) {
        $status = sendWebPush($sub, $payload, $subject);
        logMsg("push to user $recipientId status=$status");
        // The push service says this subscription no longer exists.
        if ($status === 404 || $status === 410) {
            $del = $pdo->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
            $del->execute([$sub['endpoint']]);
        }
    }
}

// OTP_VERIFIED, attempt-limiting (attemptKeys/checkAttemptLimit/
// recordFailedAttempt/clearAttempts) and validatePasswordRules moved to
// src/Auth/handlers.php - auth-exclusive, unlike validateContent below
// which posts/comments also use.

// Printable ASCII plus the Latin-1 accented letters. No emoji, and no line
// breaks -- posts render them as spaces anyway, so they only ever looked like
// they worked.
function validateContent($text, $errorMsg = 'You are trying to post illegal characters') {
    if (preg_match('/[^\x20-\x7E\xA0-\xFF]/u', $text)) bad($errorMsg, 400);
}

// ============== MENTIONS ==============
// Mentions live in the text itself as @[id] tokens rather than a parallel
// field, so a user's display name can change (they're only ever identified
// by email, which is itself changeable) without rewriting old posts -- the
// id is resolved to whatever email is current at render time.
function extractMentions($text) {
    global $CONFIG;
    preg_match_all('/@\[(\d+)\]/', $text, $matches);
    $ids = array_values(array_unique(array_map('intval', $matches[1])));
    if (count($ids) > $CONFIG['max_mentions']) {
        bad('Too many people tagged. Max: ' . $CONFIG['max_mentions'], 400);
    }
    return $ids;
}

function notifyMentions($pdo, $mentionIds, $actorId, $actorEmail, $postId) {
    foreach ($mentionIds as $id) {
        createNotification($pdo, $id, $actorId, $actorEmail, 'mention', $postId);
    }
}

const PREVIEW_MAX_CHARS = 25;

// Swaps @[id] tokens for @email across a batch of texts, in one query for the
// whole batch rather than one per text. Used where a mention has to survive as
// plain readable text (post previews) instead of being linkified client-side.
// An id with no user left behind reads as "@someone".
function resolveMentionTokens($pdo, $texts) {
    $ids = [];
    foreach ($texts as $text) {
        preg_match_all('/@\[(\d+)\]/', $text, $matches);
        foreach ($matches[1] as $id) $ids[(int)$id] = true;
    }
    if (!$ids) return $texts;

    $ids = array_keys($ids);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT id, email FROM users WHERE id IN ($placeholders)");
    $stmt->execute($ids);
    $emails = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $emails[(int)$row['id']] = $row['email'];
    }

    foreach ($texts as $key => $text) {
        $texts[$key] = preg_replace_callback('/@\[(\d+)\]/', function ($m) use ($emails) {
            return '@' . ($emails[(int)$m[1]] ?? 'someone');
        }, $text);
    }
    return $texts;
}

// Cuts on a character boundary, not a byte boundary: posts may contain the
// Latin-1 accented letters, which are two bytes in UTF-8, and a byte-wise
// substr() can split one in half and produce invalid UTF-8 that json_encode
// then refuses to encode.
//
// Done with a /u regex rather than mb_substr on purpose -- this site's
// php.ini has ";extension=mbstring", so mbstring can't be relied on in the
// web SAPI, whereas PCRE's UTF-8 support is always compiled in.
//
// Only appends the ellipsis when something was actually removed; the old
// version put "..." after every preview, including complete short ones.
function truncatePreview($text) {
    $text = trim($text);
    if (!preg_match('/^.{0,' . PREVIEW_MAX_CHARS . '}/us', $text, $m)) return $text;
    if ($m[0] === $text) return $text;
    return rtrim($m[0]) . '...';
}

// Resolves @[id] tokens to {id, email} for the API response, so clients
// don't need a separate round trip. A deleted user's id still resolves --
// email comes back null and the caller renders a fallback.
function hydrateMentions($pdo, $text) {
    preg_match_all('/@\[(\d+)\]/', $text, $matches);
    $ids = array_values(array_unique(array_map('intval', $matches[1])));
    if (!$ids) return [];

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("SELECT id, email FROM users WHERE id IN ($placeholders)");
    $stmt->execute($ids);
    $emails = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $emails[(int)$row['id']] = $row['email'];
    }

    $result = [];
    foreach ($ids as $id) {
        $result[] = ['id' => $id, 'email' => $emails[$id] ?? null];
    }
    return $result;
}

// AUTH HANDLERS (handle_login, handle_logout, handle_refreshToken,
// handle_getSessions, handle_revokeSession, handle_revokeAllOtherSessions,
// handle_sendOTP, handle_verifyOTP, handle_resetPassword,
// handle_sendRegisterOTP, handle_verifyRegisterOTP, handle_finishRegister)
// moved to src/Auth/handlers.php, loaded via Composer's autoload.files.

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

    // This user's own posts, and every like anyone gave them; plus every
    // like this user gave out on someone else's post.
    $stmt = $pdo->prepare('SELECT id FROM posts WHERE user_id = ?');
    $stmt->execute([$uid]);
    $ownPostIds = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'id');
    if ($ownPostIds) {
        $placeholders = implode(',', array_fill(0, count($ownPostIds), '?'));
        $pdo->prepare("DELETE FROM post_likes WHERE post_id IN ($placeholders)")->execute($ownPostIds);
    }
    $pdo->prepare('DELETE FROM posts WHERE user_id = ?')->execute([$uid]);
    $pdo->prepare('DELETE FROM post_likes WHERE user_id = ?')->execute([$uid]);

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
    $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$uid]);
    $pdo->prepare('DELETE FROM push_subscriptions WHERE user_id = ?')->execute([$uid]);
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
    // Every other type can't target yourself in the first place (you can't
    // follow/like/comment-notify yourself), but a mention can - self-mentions
    // are meant to notify like any other, so they're exempted here rather
    // than excluded by the general actor_id != recipient_id noise filter.
    $stmt = $pdo->prepare('SELECT n.id, n.recipient_id, n.actor_id, COALESCE(u.email, n.actor_email) AS actor_email, n.type, n.post_id, n.created_at FROM notifications n LEFT JOIN users u ON n.actor_id = u.id WHERE n.recipient_id = ? AND (n.actor_id != ? OR n.type = \'mention\') ORDER BY n.created_at DESC LIMIT ? OFFSET ?');
    $stmt->execute([$user['sub'], $user['sub'], $limit, $offset]);
    respond(good(['notifications' => $stmt->fetchAll(PDO::FETCH_ASSOC)]));
}

// Shared with pushNotification() so a push payload's embedded count is
// computed the exact same way the notifications page's own count is -- the
// service worker re-asserts this value against the OS badge on every
// notification interaction it sees, so it has to match.
function getUnseenNotificationCount($pdo, $userId) {
    $stmt = $pdo->prepare('SELECT last_notifications_seen_at FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $lastSeen = $stmt->fetchColumn();

    if (!$lastSeen) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE recipient_id = ? AND (actor_id != ? OR type = \'mention\')');
        $stmt->execute([$userId, $userId]);
    } else {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE recipient_id = ? AND (actor_id != ? OR type = \'mention\') AND created_at > ?');
        $stmt->execute([$userId, $userId, $lastSeen]);
    }

    return (int)$stmt->fetchColumn();
}

function handle_getUnseenNotificationCount($pdo, $user) {
    respond(good(['count' => getUnseenNotificationCount($pdo, $user['sub'])]));
}

function handle_markNotificationsSeen($pdo, $user) {
    $stmt = $pdo->prepare('UPDATE users SET last_notifications_seen_at = ? WHERE id = ?');
    $stmt->execute([date('Y-m-d H:i:s'), $user['sub']]);
    respond(good(['message' => 'Notifications marked as seen']));
}

// ============== POST HELPERS (posts/post_likes tables) ==============
// Likes used to live inside each post's JSON, as `likes: [{userId, timestamp}]`.
// Handlers below still hand clients that exact shape -- these two functions
// are what rebuilds it from the real post_likes table.

// One query for a whole page of posts, not one query per post. Grouped by
// post id, ordered oldest-first like the old JSON array naturally was
// (likes were always appended, never reordered).
function getLikesForPostIds($pdo, $postIds) {
    if (empty($postIds)) return [];
    $placeholders = implode(',', array_fill(0, count($postIds), '?'));
    $stmt = $pdo->prepare("SELECT post_id, user_id, created_at FROM post_likes WHERE post_id IN ($placeholders) ORDER BY created_at ASC");
    $stmt->execute($postIds);
    $byPost = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $byPost[$row['post_id']][] = ['userId' => (int)$row['user_id'], 'timestamp' => $row['created_at']];
    }
    return $byPost;
}

// A posts-table row, in the shape handlers have always returned. Callers
// still add userID/userEmail/mentions themselves, same as before.
function postRowToApi($row, $likesByPost) {
    return [
        'id' => $row['id'],
        'text' => $row['text'],
        'timestamp' => $row['created_at'],
        'likes' => $likesByPost[$row['id']] ?? [],
        'mediaUrl' => $row['media_url'],
    ];
}

function handle_getPostById($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    if (!$postId) bad('Post ID required', 400);

    $stmt = $pdo->prepare('SELECT id, user_id, text, media_url, created_at FROM posts WHERE id = ?');
    $stmt->execute([$postId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) bad('Post not found', 404);

    $ownerStmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $ownerStmt->execute([$row['user_id']]);
    $ownerEmail = $ownerStmt->fetchColumn() ?: '';

    $post = postRowToApi($row, getLikesForPostIds($pdo, [$postId]));
    $post['userID'] = (int)$row['user_id'];
    $post['userEmail'] = $ownerEmail;
    $post['mentions'] = hydrateMentions($pdo, $post['text']);
    respond(good(['post' => $post]));
}

function handle_getPostPreviews($pdo, $user) {
    $postIdsRaw = $_POST['postIds'] ?? '[]';
    $postIds = json_decode($postIdsRaw, true) ?? [];
    if (!is_array($postIds) || empty($postIds)) {
        respond(good(['previews' => []]));
        return;
    }

    $placeholders = implode(',', array_fill(0, count($postIds), '?'));
    $stmt = $pdo->prepare("SELECT id, text FROM posts WHERE id IN ($placeholders)");
    $stmt->execute($postIds);

    $texts = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if (!empty($row['text'])) $texts[$row['id']] = $row['text'];
    }

    // Resolve the @[id] tokens before cutting, not after. Cutting first can
    // slice a token in half and leave "@[1" sitting in the preview, and even
    // an intact token means nothing to whoever reads it.
    $texts = resolveMentionTokens($pdo, $texts);

    $previews = [];
    foreach ($texts as $id => $text) {
        $previews[$id] = truncatePreview($text);
    }

    respond(good(['previews' => $previews]));
}

function handle_post($pdo, $user) {
    $text = trim($_POST['postText'] ?? '');
    if (!$text) bad('Post text required', 400);
    if (strlen($text) > 5000) bad('You are trying to make a post that is longer than 5K characters', 400);
    validateContent($text, 'You are trying to post illegal characters');
    $mentionIds = extractMentions($text);

    $uid = $user['sub'];

    $rawMedia = $_POST['mediaUrl'] ?? null;
    if ($rawMedia === 'null' || $rawMedia === '') $rawMedia = null;
    if ($rawMedia !== null) {
        $stmt = $pdo->prepare('SELECT id FROM media WHERE path = ? AND user_id = ?');
        $stmt->execute([$rawMedia, $uid]);
        $mediaRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$mediaRow) bad('Invalid mediaUrl or not owned by user', 400);
    }

    // Two posts made in the same second used to get the same id
    // ("$uid.$time") and deleting either one deleted both, since
    // comments/media/likes all reference a post by this one string. Now that
    // posts.id is a PRIMARY KEY, a collision fails the INSERT itself -
    // atomically, even between two genuinely concurrent requests - so
    // bumping the second forward and retrying is enough on its own; no
    // read-check-write lock needed the way the JSON array required.
    $createdAt = date('Y-m-d H:i:s');
    $newTime = time();
    while (true) {
        $postId = $uid . '.' . $newTime;
        try {
            // Re-prepared each attempt: PDO/SQLite leaves a statement in a
            // "General error: 21 bad parameter or other API misuse" state
            // after a constraint violation, so re-executing the same
            // PDOStatement on the next loop fails even with fresh values.
            $insert = $pdo->prepare('INSERT INTO posts (id, user_id, text, media_url, created_at) VALUES (?, ?, ?, ?, ?)');
            $insert->execute([$postId, $uid, $text, $rawMedia, $createdAt]);
            break;
        } catch (PDOException $e) {
            if ($e->getCode() !== '23000') throw $e; // not a uniqueness failure
            $newTime++;
        }
    }

    if ($rawMedia !== null) {
        $stmt = $pdo->prepare('UPDATE media SET post_id = ? WHERE path = ? AND user_id = ?');
        $stmt->execute([$postId, $rawMedia, $uid]);
    }
    notifyMentions($pdo, $mentionIds, $uid, $user['email'], $postId);
    respond(good(['postId' => $postId]));
}

function handle_getMyPosts($pdo, $user) {
    $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 25;
    $offset = isset($_POST['offset']) ? (int)$_POST['offset'] : 0;
    $uid = $user['sub'];

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM posts WHERE user_id = ?');
    $countStmt->execute([$uid]);
    $totalCount = (int)$countStmt->fetchColumn();

    $stmt = $pdo->prepare("SELECT id, user_id, text, media_url, created_at FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT $limit OFFSET $offset");
    $stmt->execute([$uid]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $likesByPost = getLikesForPostIds($pdo, array_column($rows, 'id'));
    $posts = [];
    foreach ($rows as $row) {
        $post = postRowToApi($row, $likesByPost);
        $post['userID'] = $uid;
        $post['userEmail'] = $user['email'];
        $post['mentions'] = hydrateMentions($pdo, $post['text']);
        $posts[] = $post;
    }
    $hasMore = ($offset + $limit) < $totalCount;

    respond(good(['posts' => $posts, 'hasMore' => $hasMore, 'totalCount' => $totalCount]));
}

function handle_getUserPosts($pdo, $user) {
    $targetId = (int)($_POST['userId'] ?? 0);
    if ($targetId <= 0) bad('Invalid user ID', 400);

    $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 25;
    $offset = isset($_POST['offset']) ? (int)$_POST['offset'] : 0;

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM posts WHERE user_id = ?');
    $countStmt->execute([$targetId]);
    $totalCount = (int)$countStmt->fetchColumn();

    $emailStmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $emailStmt->execute([$targetId]);
    $targetEmail = $emailStmt->fetchColumn() ?: 'User ' . $targetId;

    $stmt = $pdo->prepare("SELECT id, user_id, text, media_url, created_at FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT $limit OFFSET $offset");
    $stmt->execute([$targetId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $likesByPost = getLikesForPostIds($pdo, array_column($rows, 'id'));
    $posts = [];
    foreach ($rows as $row) {
        $post = postRowToApi($row, $likesByPost);
        $post['userID'] = $targetId;
        $post['userEmail'] = $targetEmail;
        $post['mentions'] = hydrateMentions($pdo, $post['text']);
        $posts[] = $post;
    }
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
    $stmt = $pdo->prepare('SELECT id, email, created_at, theme, hand FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    respond(good(['id' => $user['sub'], 'userId' => $user['sub'], 'email' => $row['email'] ?? 'User', 'created_at' => $row['created_at'] ?? 'Unknown', 'theme' => $row['theme'] ?: 'light', 'hand' => $row['hand'] ?: 'right']));
}

function handle_updateTheme($pdo, $user) {
    $theme = $_POST['theme'] ?? '';
    $allowedThemes = ['light', 'dark', 'red', 'blue', 'hacker'];
    if (!in_array($theme, $allowedThemes, true)) bad('Invalid theme', 400);

    $stmt = $pdo->prepare('UPDATE users SET theme = ? WHERE id = ?');
    $stmt->execute([$theme, $user['sub']]);
    respond(good(['message' => 'Theme updated']));
}

function handle_getVapidPublicKey($pdo, $user) {
    global $CONFIG;
    respond(good(['key' => $CONFIG['vapid_public'] ?? '']));
}

function handle_savePushSubscription($pdo, $user) {
    $endpoint = trim($_POST['endpoint'] ?? '');
    $p256dh = trim($_POST['p256dh'] ?? '');
    $auth = trim($_POST['auth'] ?? '');
    if (!$endpoint || !$p256dh || !$auth) bad('Missing subscription details', 400);
    if (!filter_var($endpoint, FILTER_VALIDATE_URL)) bad('Invalid endpoint', 400);

    // Recorded against the session that enabled it, so revoking a device
    // also silences its notifications.
    $stmt = $pdo->prepare('INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$user['sub'], $endpoint, $p256dh, $auth, date('Y-m-d H:i:s'), $user['sid'] ?? null]);
    respond(good(['message' => 'Push enabled']));
}

function handle_deletePushSubscription($pdo, $user) {
    $endpoint = trim($_POST['endpoint'] ?? '');
    if (!$endpoint) bad('Missing endpoint', 400);

    $stmt = $pdo->prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?');
    $stmt->execute([$endpoint, $user['sub']]);
    respond(good(['message' => 'Push disabled']));
}

function handle_updateHand($pdo, $user) {
    $hand = $_POST['hand'] ?? '';
    if (!in_array($hand, ['left', 'right'], true)) bad('Invalid hand', 400);

    $stmt = $pdo->prepare('UPDATE users SET hand = ? WHERE id = ?');
    $stmt->execute([$hand, $user['sub']]);
    respond(good(['message' => 'Hand updated']));
}

function handle_fetchFollowedPosts($pdo, $user) {
    $limit = isset($_POST['limit']) ? (int)$_POST['limit'] : 25;
    $offset = isset($_POST['offset']) ? (int)$_POST['offset'] : 0;
    $uid = $user['sub'];

    $stmt = $pdo->prepare('SELECT follows FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $followsJson = $stmt->fetchColumn() ?: '[]';
    $followedData = json_decode($followsJson, true) ?? [];

    // Always includes $uid, so this is never empty and the IN (...) below
    // always has at least one placeholder.
    $followedIds = array_values(array_unique(array_merge(array_map(fn($f) => is_array($f) ? $f['id'] : $f, $followedData), [$uid])));
    $placeholders = implode(',', array_fill(0, count($followedIds), '?'));

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM posts WHERE user_id IN ($placeholders)");
    $countStmt->execute($followedIds);
    $totalCount = (int)$countStmt->fetchColumn();

    // One query across every followed user, ordered and paged in SQL,
    // instead of pulling each user's whole post list into PHP to merge and
    // sort by hand.
    $stmt = $pdo->prepare("SELECT posts.id, posts.user_id, posts.text, posts.media_url, posts.created_at, users.email
        FROM posts JOIN users ON users.id = posts.user_id
        WHERE posts.user_id IN ($placeholders)
        ORDER BY posts.created_at DESC LIMIT $limit OFFSET $offset");
    $stmt->execute($followedIds);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $likesByPost = getLikesForPostIds($pdo, array_column($rows, 'id'));
    $allPosts = [];
    foreach ($rows as $row) {
        $post = postRowToApi($row, $likesByPost);
        $post['userID'] = (int)$row['user_id'];
        $post['userEmail'] = $row['email'];
        $post['mentions'] = hydrateMentions($pdo, $post['text']);
        $allPosts[] = $post;
    }
    $hasMore = ($offset + $limit) < $totalCount;

    respond(good(['posts' => $allPosts, 'hasMore' => $hasMore, 'totalCount' => $totalCount]));
}

function handle_likePost($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    if (!$postId) bad('Missing post ID', 400);

    // Checked against the id's own prefix, before touching the posts table,
    // same as before the tables existed - so this still rejects a self-like
    // even for a postId that turns out not to exist.
    $ownerId = (int)explode('.', $postId)[0];
    if ($ownerId == $user['sub']) bad('Cannot like your own post', 400);

    $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $actorEmail = $stmt->fetchColumn() ?: 'Unknown';

    $stmt = $pdo->prepare('SELECT user_id FROM posts WHERE id = ?');
    $stmt->execute([$postId]);
    $realOwnerId = $stmt->fetchColumn();
    if ($realOwnerId === false) bad('Post not found', 404);

    $insert = $pdo->prepare('INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)');
    $insert->execute([$postId, $user['sub'], date('Y-m-d H:i:s')]);
    if ($insert->rowCount() > 0) {
        createNotification($pdo, (int)$realOwnerId, $user['sub'], $actorEmail, 'like', $postId);
    }

    respond(good(['liked' => true]));
}

function handle_unlikePost($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    if (!$postId) bad('Missing post ID', 400);

    $stmt = $pdo->prepare('SELECT user_id FROM posts WHERE id = ?');
    $stmt->execute([$postId]);
    $ownerId = $stmt->fetchColumn();
    if ($ownerId === false) bad('Post not found', 404);
    $ownerId = (int)$ownerId;

    $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $actorEmail = $stmt->fetchColumn() ?: 'Unknown';

    $delete = $pdo->prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?');
    $delete->execute([$postId, $user['sub']]);
    $wasLiked = $delete->rowCount() > 0;
    if ($wasLiked && $ownerId != $user['sub']) {
        createNotification($pdo, $ownerId, $user['sub'], $actorEmail, 'unlike', $postId);
    }

    respond(good(['liked' => false]));
}

function handle_getPostLikes($pdo, $user) {
    $postId = trim($_POST['postId'] ?? '');
    if (!$postId) bad('Missing post ID', 400);

    $stmt = $pdo->prepare('SELECT 1 FROM posts WHERE id = ?');
    $stmt->execute([$postId]);
    if (!$stmt->fetchColumn()) bad('Post not found', 404);

    $likes = getLikesForPostIds($pdo, [$postId])[$postId] ?? [];
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
        createNotification($pdo, $targetId, $uid, $actorEmail, 'follow');
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

    createNotification($pdo, $targetId, $uid, $actorEmail, 'unfollow');

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

    $stmt = $pdo->prepare('SELECT user_id, media_url FROM posts WHERE id = ?');
    $stmt->execute([$postId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) bad('Post not found', 404);
    if ((int)$row['user_id'] != $user['sub']) bad('You can only delete your own posts', 403);

    $pdo->prepare('DELETE FROM posts WHERE id = ?')->execute([$postId]);
    $pdo->prepare('DELETE FROM post_likes WHERE post_id = ?')->execute([$postId]);
    $pdo->prepare('DELETE FROM notifications WHERE post_id = ?')->execute([$postId]);

    $mediaUrl = $row['media_url'];
    if (!empty($mediaUrl) && $mediaUrl !== 'null') {
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
    $mentionIds = extractMentions($text);

    $stmt = $pdo->prepare('INSERT INTO comments (post_id, user_id, comment_text, created_at) VALUES (?, ?, ?, ?)');
    $stmt->execute([$postId, $user['sub'], $text, date('Y-m-d H:i:s')]);
    $commentId = $pdo->lastInsertId();

    $ownerId = (int)explode('.', $postId)[0];
    if ($mentionIds || $ownerId != $user['sub']) {
        $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
        $stmt->execute([$user['sub']]);
        $actorEmail = $stmt->fetchColumn();
        if ($ownerId != $user['sub']) {
            createNotification($pdo, $ownerId, $user['sub'], $actorEmail, 'comment', $postId);
        }
        notifyMentions($pdo, $mentionIds, $user['sub'], $actorEmail, $postId);
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
    foreach ($comments as &$comment) $comment['mentions'] = hydrateMentions($pdo, $comment['text']);

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
$PUBLIC_ENDPOINTS = ['login', 'logout', 'refreshToken', 'sendOTP', 'verifyOTP', 'resetPassword', 'sendRegisterOTP', 'verifyRegisterOTP', 'finishRegister'];

$HANDLERS = [
    'login' => 'handle_login', 'logout' => 'handle_logout', 'refreshToken' => 'handle_refreshToken',
    'sendOTP' => 'handle_sendOTP',
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
    'updateTheme' => 'handle_updateTheme', 'updateHand' => 'handle_updateHand',
    'getVapidPublicKey' => 'handle_getVapidPublicKey',
    'savePushSubscription' => 'handle_savePushSubscription',
    'deletePushSubscription' => 'handle_deletePushSubscription',
    'getSessions' => 'handle_getSessions', 'revokeSession' => 'handle_revokeSession',
    'revokeAllOtherSessions' => 'handle_revokeAllOtherSessions',
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
