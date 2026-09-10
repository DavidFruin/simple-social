<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');

$email = getenv('TEST_EMAIL') ?: 'test@example.com';

try {
    $pdo = new PDO('sqlite:userdata.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $stmt = $pdo->prepare('SELECT id, email, password FROM users WHERE LOWER(email) = LOWER(?)');
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($user) {
        echo json_encode(['found' => true, 'id' => $user['id'], 'email' => $user['email'], 'hash_prefix' => substr($user['password'], 0, 20)]);
    } else {
        echo json_encode(['found' => false]);
    }
} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}