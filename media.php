<?php
require_once __DIR__ . '/config.php';

ob_start();
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

$action = $_POST['action'] ?? $_GET['action'] ?? '';

function logMsg($msg) {
    $logFile = __DIR__ . '/media.log';
    $timestamp = date('Y-m-d H:i:s');
    $entry = "[$timestamp] $msg\n";
    @file_put_contents($logFile, $entry, FILE_APPEND | LOCK_EX);
}

function respond($data, $code = 200) {
    ob_clean();
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function bad($msg, $code = 400) {
    global $action;
    logMsg("ERROR: action=$action msg=$msg");
    respond(['valid' => false, 'message' => $msg], $code);
}

function good($data = []) {
    return array_merge(['valid' => true], $data);
}

function db() {
    $pdo = new PDO('sqlite:userdata.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return $pdo;
}

function jwtDecode($jwt) {
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return false;
    $base64 = str_replace(['-', '_'], ['+', '/'], $parts[1]);
    $pad = strlen($base64) % 4;
    if ($pad) $base64 .= str_repeat('=', 4 - $pad);
    $payload = json_decode(base64_decode($base64), true);
    if (!$payload || !isset($payload['sub'])) return false;
    if (isset($payload['exp']) && time() > $payload['exp']) return false;
    return $payload;
}

function verifyUser($jwt, $pdo) {
    $payload = jwtDecode($jwt);
    if (!$payload || !isset($payload['sub'])) return false;
    $stmt = $pdo->prepare('SELECT jwt FROM users WHERE id = ?');
    $stmt->execute([$payload['sub']]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !$row['jwt']) return false;
    $stored = json_decode($row['jwt'], true);
    if (!$stored || !isset($stored['token']) || $jwt !== $stored['token']) return false;
    return $payload;
}

function requireAuth() {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $jwt = '';
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $jwt = $matches[1];
    }
    if (!$jwt) bad('Unauthorized', 401);
    
    $pdo = db();
    $user = verifyUser($jwt, $pdo);
    if (!$user) bad('Unauthorized', 401);
    
    $stmt = $pdo->prepare('SELECT email FROM users WHERE id = ?');
    $stmt->execute([$user['sub']]);
    $user['email'] = $stmt->fetchColumn() ?: 'User';
    return $user;
}

function getMediaDir($userId) {
    return __DIR__ . '/media/' . $userId;
}

function ensureMediaDir($userId, $type) {
    $dir = getMediaDir($userId) . '/' . $type;
    if (!is_dir($dir)) {
        if (!is_dir(dirname($dir))) {
            mkdir(dirname($dir), 0755, true);
        }
        mkdir($dir, 0755, true);
    }
    return $dir;
}

$allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$allowedVideoTypes = ['video/quicktime', 'video/mp4', 'video/m4v', 'video/webm'];
$allowedAudioTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/webm'];

$maxSizes = [
    'image' => 10 * 1024 * 1024,
    'video' => 100 * 1024 * 1024,
    'audio' => 50 * 1024 * 1024
];

function getMediaType($mimeType) {
    global $allowedImageTypes, $allowedVideoTypes, $allowedAudioTypes;
    if (in_array($mimeType, $allowedImageTypes)) return 'image';
    if (in_array($mimeType, $allowedVideoTypes)) return 'video';
    if (in_array($mimeType, $allowedAudioTypes)) return 'audio';
    return null;
}

function getOutputExtension($type) {
    if ($type === 'image') return 'webp';
    if ($type === 'video') return 'webm'; // Will convert to mp4, but save as webm initially
    if ($type === 'audio') return 'webm'; // Will convert to mp3, but save as webm initially
    return null;
}

function processImage($inputPath, $outputPath) {
    logMsg("processImage: input=$inputPath output=$outputPath");
    
    if (!file_exists($inputPath)) {
        logMsg("processImage ERROR: input file does not exist");
        return false;
    }
    
    $inputExt = strtolower(pathinfo($inputPath, PATHINFO_EXTENSION));
    logMsg("processImage: input extension = $inputExt");
    
    // Load image using GD
    switch ($inputExt) {
        case "jpg":
        case "jpeg":
            $src = @imagecreatefromjpeg($inputPath);
            break;
        case "png":
            $src = @imagecreatefrompng($inputPath);
            break;
        case "gif":
            $src = @imagecreatefromgif($inputPath);
            break;
        case "webp":
            $src = @imagecreatefromwebp($inputPath);
            break;
        default:
            logMsg("processImage ERROR: unsupported format: $inputExt");
            return false;
    }
    
    if (!$src) {
        logMsg("processImage ERROR: failed to load image");
        return false;
    }
    
    $srcWidth = imagesx($src);
    $srcHeight = imagesy($src);
    logMsg("processImage: original size = {$srcWidth}x{$srcHeight}");
    
    // Resize if larger than 1920x1080
    $maxWidth = 1920;
    $maxHeight = 1080;
    
    if ($srcWidth > $maxWidth || $srcHeight > $maxHeight) {
        $ratio = min($maxWidth / $srcWidth, $maxHeight / $srcHeight);
        $newWidth = (int)($srcWidth * $ratio);
        $newHeight = (int)($srcHeight * $ratio);
        
        $dst = imagecreatetruecolor($newWidth, $newHeight);
        
        // Preserve transparency for PNG
        if ($inputExt === "png") {
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            $transparent = imagecolorallocatealpha($dst, 0, 0, 0, 127);
            imagefill($dst, 0, 0, $transparent);
        }
        
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $newWidth, $newHeight, $srcWidth, $srcHeight);
        logMsg("processImage: resized to {$newWidth}x{$newHeight}");
    } else {
        $dst = $src;
    }
    
    // Save as WebP with 85% quality
    $result = imagewebp($dst, $outputPath, 85);
    
    if ($dst !== $src) {
        imagedestroy($dst);
    }
    imagedestroy($src);
    
    if (!$result) {
        logMsg("processImage ERROR: failed to save webp");
        return false;
    }
    
    if (!file_exists($outputPath)) {
        logMsg("processImage ERROR: output file not created");
        return false;
    }
    
    logMsg("processImage SUCCESS: saved to $outputPath");
    return true;
}

function processVideo($inputPath, $outputPath, $thumbnailPath) {
    logMsg("processVideo: input=$inputPath output=$outputPath");
    
    if (!file_exists($inputPath)) {
        logMsg("processVideo ERROR: input file does not exist");
        return false;
    }
    
    // Skip ffmpeg processing - just copy the file directly
    if (!copy($inputPath, $outputPath)) {
        logMsg("processVideo ERROR: failed to copy file");
        return false;
    }
    
    logMsg("processVideo SUCCESS: copied to $outputPath");
    return true;
}

function processAudio($inputPath, $outputPath) {
    logMsg("processAudio: input=$inputPath output=$outputPath");
    
    if (!file_exists($inputPath)) {
        logMsg("processAudio ERROR: input file does not exist");
        return false;
    }
    
    // Skip ffmpeg processing - just copy the file directly
    if (!copy($inputPath, $outputPath)) {
        logMsg("processAudio ERROR: failed to copy file");
        return false;
    }
    
    logMsg("processAudio SUCCESS: copied to $outputPath");
    return true;
}

function handle_uploadMedia() {
    global $allowedImageTypes, $allowedVideoTypes, $allowedAudioTypes;
    global $maxSizes;
    
    $user = requireAuth();
    $uid = $user['sub'];
    
    logMsg("uploadMedia: user=$uid files=" . json_encode($_FILES));
    
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        bad('No file uploaded', 400);
    }
    
    $file = $_FILES['file'];
    $tmpPath = $file['tmp_name'];
    $mimeType = $file['type'];
    $fileSize = $file['size'];
    $fileName = $file['name'];
    
    logMsg("uploadMedia: file=$fileName mime=$mimeType size=$fileSize");
    
    $mediaType = getMediaType($mimeType);
    if (!$mediaType) bad('Invalid file type. Allowed: jpg, png, gif, webp, mov, mp4, m4v, wav, mp3', 400);
    
    if ($fileSize > $maxSizes[$mediaType]) {
        $maxMb = $maxSizes[$mediaType] / (1024 * 1024);
        bad("File too large. Max: $maxMb MB", 400);
    }
    
    $ext = getOutputExtension($mediaType);
    $timestamp = date('YmdHis');
    $random = sprintf('%06d', mt_rand(0, 999999));
    $filename = "{$uid}_{$mediaType}_{$timestamp}_{$random}.{$ext}";
    
    ensureMediaDir($uid, $mediaType);
    $mediaDir = getMediaDir($uid);
    $typeDir = $mediaDir . '/' . $mediaType;
    logMsg("uploadMedia: mediaDir=$mediaDir typeDir=$typeDir exists=" . (is_dir($typeDir) ? "yes" : "no"));
    
    $inputExt = pathinfo($fileName, PATHINFO_EXTENSION);
    $tempInput = "{$mediaDir}/{$mediaType}/temp_input.{$inputExt}";
    
    if (!move_uploaded_file($tmpPath, $tempInput)) {
        logMsg("uploadMedia ERROR: move_uploaded_file failed. tmpPath=$tmpPath, tempInput=$tempInput");
        bad('Failed to process upload', 500);
    }
    
    logMsg("uploadMedia: tempInput=$tempInput exists=" . (file_exists($tempInput) ? "yes" : "no"));
    
    $outputPath = "{$mediaDir}/{$mediaType}/{$filename}";
    $thumbnailPath = ($mediaType === 'video') ? "{$mediaDir}/{$mediaType}/thumb_{$filename}" : null;
    
    if ($mediaType === 'image') {
        if (!processImage($tempInput, $outputPath)) {
            @unlink($tempInput);
            bad('Failed to process image', 500);
        }
    } elseif ($mediaType === 'video') {
        if (!processVideo($tempInput, $outputPath, $thumbnailPath)) {
            @unlink($tempInput);
            bad('Failed to process video', 500);
        }
    } elseif ($mediaType === 'audio') {
        if (!processAudio($tempInput, $outputPath)) {
            @unlink($tempInput);
            bad('Failed to process audio', 500);
        }
    }
    
    @unlink($tempInput);
    
    $pdo = db();
    $stmt = $pdo->prepare('INSERT INTO media (user_id, filename, type, path, created_at) VALUES (?, ?, ?, ?, ?)');
    $path = "/media/{$uid}/{$mediaType}/{$filename}";
    $stmt->execute([$uid, $filename, $mediaType, $path, date('Y-m-d H:i:s')]);
    $mediaId = $pdo->lastInsertId();
    
    $thumbUrl = ($mediaType === 'video') ? "/media/{$uid}/video/thumb_{$filename}" : null;
    
    logMsg("uploadMedia SUCCESS: mediaId=$mediaId path=$path");
    
    respond(good([
        'mediaId' => $mediaId,
        'mediaUrl' => $path,
        'thumbnailUrl' => $thumbUrl,
        'type' => $mediaType
    ]));
}

function handle_deleteMedia() {
    $user = requireAuth();
    $uid = $user['sub'];
    
    $mediaId = (int)($_POST['mediaId'] ?? 0);
    if (!$mediaId) bad('Missing mediaId', 400);
    
    $pdo = db();
    $stmt = $pdo->prepare('SELECT * FROM media WHERE id = ? AND user_id = ?');
    $stmt->execute([$mediaId, $uid]);
    $media = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$media) bad('Media not found', 404);
    
    $mediaDir = getMediaDir($uid);
    $filePath = $mediaDir . str_replace('/media/' . $uid, '', $media['path']);
    if (file_exists($filePath)) unlink($filePath);
    
    if ($media['type'] === 'video') {
        $thumbPath = str_replace('/media/' . $uid . '/video/', '/video/thumb_', $media['path']);
        $fullThumbPath = $mediaDir . $thumbPath;
        if (file_exists($fullThumbPath)) unlink($fullThumbPath);
    }
    
    $stmt = $pdo->prepare('DELETE FROM media WHERE id = ?');
    $stmt->execute([$mediaId]);
    
    logMsg("deleteMedia SUCCESS: mediaId=$mediaId");
    
    respond(good(['deleted' => true]));
}

$handlers = [
    'uploadMedia' => 'handle_uploadMedia',
    'deleteMedia' => 'handle_deleteMedia'
];

logMsg("REQUEST: action=$action");

if (!isset($handlers[$action])) {
    bad('Unknown action', 400);
}

$handlers[$action]();
