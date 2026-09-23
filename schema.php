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
    // Uploaded files. Both entry points need this: media.php writes the rows,
    // api.php reads them when a post is created or an account is deleted. It
    // used to be declared separately in each, which is what this file exists
    // to stop.
    $pdo->exec('CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        post_id TEXT)');

    // Every read of this table filters on user_id -- on its own, together
    // with path, and when clearing out a deleted account. The index existed
    // on both live databases but in no source file, so it had been created by
    // hand at some point and a fresh install would have quietly gone without
    // it and scanned the table instead.
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id)');

    // Databases created before post_id existed.
    try {
        $cols = $pdo->query("PRAGMA table_info(media)")->fetchAll(PDO::FETCH_ASSOC);
        $hasPostId = false;
        foreach ($cols as $c) if ($c['name'] === 'post_id') $hasPostId = true;
        if (!$hasPostId) $pdo->exec('ALTER TABLE media ADD COLUMN post_id TEXT');
    } catch (Exception $e) {}

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
