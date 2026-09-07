#!/bin/bash
# Test notifications API locally - check all users

cd /home/admin/dev/app.davidfruin.com/simple-social-api

echo "Testing notifications API locally - checking all users"
echo "=================================="

php -r '
$pdo = new PDO("sqlite:userdata.db");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Get all users
$stmt = $pdo->query("SELECT id, email FROM users ORDER BY id");
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($users as $user) {
    $userId = $user["id"];
    $userEmail = $user["email"];
    
    // Get all notifications for this user
    $stmt = $pdo->prepare("SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 5");
    $stmt->execute([$userId]);
    $notifs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (count($notifs) > 0) {
        echo "User $userId ($userEmail): " . count($notifs) . " notifications\n";
        foreach ($notifs as $n) {
            $self = ($n["actor_id"] == $n["recipient_id"]) ? " [SELF]" : "";
            echo "  - actor:" . $n["actor_id"] . " email:" . $n["actor_email"] . " type:" . $n["type"] . $self . "\n";
        }
        echo "\n";
    }
}

echo "==================================";
'