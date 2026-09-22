<?php
// schema.php - Table definitions shared by every entry point.
//
// api.php and media.php each open their own PDO handle to the same SQLite
// file and each run their own CREATE TABLE statements. Where both need the
// same table, the definition lives here instead of being copy-pasted into
// both - the `media` table already shows what happens otherwise, being
// declared separately in both files and having to be kept in sync by hand.
//
// Everything here is idempotent: safe to call on every request.

function ensureSharedSchema($pdo) {
    // One row per login. Replaces the single `users.jwt` slot, which could
    // only ever hold one token and so logged a user out everywhere as soon
    // as they logged in anywhere else. `users.jwt` is deliberately left in
    // place but no longer read.
    $pdo->exec('CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        refresh_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        device_name TEXT,
        user_agent TEXT)');

    // user_id: listing a user's sessions and enforcing the per-user cap.
    // refresh_hash: the lookup every token refresh does.
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_sessions_refresh ON sessions(refresh_hash)');

    // Ties a push subscription to the session that registered it, so
    // revoking a device also stops its notifications. Nullable: rows that
    // predate sessions have no session to point at.
    try {
        $cols = $pdo->query("PRAGMA table_info(push_subscriptions)")->fetchAll(PDO::FETCH_ASSOC);
        if ($cols) {
            $hasSessionId = false;
            foreach ($cols as $c) if ($c['name'] === 'session_id') $hasSessionId = true;
            if (!$hasSessionId) $pdo->exec('ALTER TABLE push_subscriptions ADD COLUMN session_id TEXT');
        }
    } catch (Exception $e) {}
}
