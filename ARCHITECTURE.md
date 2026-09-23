# Simple Social — Architecture Map

> **Version:** 2026-09-23
> **Live:** `https://app.davidfruin.com` (production) and `https://dev.davidfruin.com` (staging). Both are git checkouts of this repo, and in both the repo root *is* the docroot.
> **Repos:** `simple-social` (web + API), `simple-social-cli`, `simple-social-tui`, `simple-social-cli-interactive`

Numbers that can be tuned live in `config.php` and are referenced by name here
rather than copied, so this document can't drift out of step with them.

---

## 1. Philosophy

| Principle | How it manifests |
|-----------|------------------|
| **No framework SPA** | Vanilla JS attached to `window`, no build step, no bundler. `app.html` loads every script with `<script src>` and a hash router does client navigation. |
| **Single-file API** | `api.php` is one flat dispatcher (45 actions). Not MVC — one `$HANDLERS` table, one `db()` factory, one `respond()`. Easy to `scp` and `grep`. |
| **SQLite + JSON blobs** | `users.posts` and `users.follows` are JSON arrays inside a single `users` row. `comments`, `notifications`, `media`, `sessions` and `push_subscriptions` are real tables. Hybrid: "document inside relational". |
| **Composite post IDs** | Post ID is `"{ownerId}.{unixtime}"`, so the owner falls out of `explode('.', $postId)[0]` with no lookup. Cheap, and the cause of a real bug — see §8. |
| **Sessions, not a single token** | A JWT (HS256) in `Authorization: Bearer` carries a `sid` claim naming a row in `sessions`. Signature is verified properly, and revocation is per-device. |
| **Form bodies, JSON replies** | Every call is `POST action=foo&param=bar` as `application/x-www-form-urlencoded`. Replies are `{"valid":true,…}` with `JSON_UNESCAPED_UNICODE`. The terminal clients speak the same protocol. |
| **Lazy migrations** | Every entry point runs `CREATE TABLE IF NOT EXISTS` plus `PRAGMA table_info` guarded `ALTER TABLE` on each request. No migration runner, no deploy step beyond `git pull`. |

---

## 2. File structure

### 2.1 Server layout

```
/home/davidfruin/domains/<site>/
├── private/                     # OUTSIDE the docroot — not web-reachable
│   ├── userdata.db              # SQLite
│   ├── .env                     # JWT_SECRET=… (600)
│   └── logs/                    # api.log, media.log, … rotated
└── public_html/                 # docroot AND the git checkout root
    ├── .htaccess                # Authorization passthrough + <FilesMatch> denies
    ├── config.php               # loads .env; media limits, session TTLs, max_mentions
    ├── api.php                  # main API dispatcher
    ├── media.php                # upload / delete, multipart
    ├── auth.php                 # JWT + session helpers, shared by api.php and media.php
    ├── schema.php               # table definitions shared by every entry point
    ├── webpush.php              # VAPID push sending
    ├── logging.php              # writeLog / rotate
    ├── clean-notifications.php  # CLI-only maintenance script
    ├── app.html                 # the SPA shell
    ├── index.html               # marketing landing page
    ├── about|api|conduct|download|roadmap.html   # static pages
    ├── manifest.json  sw.js     # PWA manifest and service worker
    ├── css/main.css
    └── js/
        ├── main.js store.js router.js api.js config.js logger.js
        ├── header.js pwa.js install-button.js copy-button.js
        ├── roadmap.js roadmap-data.js
        ├── components/  post-card.js comment.js media-viewer.js
        │                mention-picker.js session-expired-modal.js
        └── pages/  login.js register.js reset-password.js feed.js post.js
                    create-post.js profile.js search.js notifications.js settings.js
```

**The repo root is the docroot.** Anything committed here is served. There is no
in-repo path that is private without an `.htaccess` rule, which is why
`notes.md` and this file are readable over HTTP (§8).

Tests live in the separate `simple-social-tests` repo so browser dependencies
never reach the docroot.

### 2.2 Terminal clients

Three repos, each installable on its own:

| Repo | Binary | `make install` name |
|------|--------|---------------------|
| `simple-social-cli` | `simple-social-cli` | `sscli` |
| `simple-social-tui` | `simple-social-tui` | `sstui` |
| `simple-social-cli-interactive` | `simple-social-cli-interactive` | `sswiz` |

`simple-social-cli` holds the shared library `lib/libss.a`; the other two vendor
it as a git submodule at `vendor/simple-social-cli`, so
`git clone --recursive && make` is the whole story for each.

* **Static archive, not a shared object.** `libss.a` is linked directly, so each
  binary is one self-contained file that works wherever it's copied or
  symlinked. There is no `libss.so` and no `$ORIGIN` rpath — an earlier design
  that needed the library to sit beside the binary.
* **Header dependency tracking.** All three makefiles use `-MMD -MP`. Without
  it, editing a struct in a header left stale objects linking against the old
  layout — which builds cleanly and then misbehaves at runtime.
* **Per-tool state.** `~/.simple-social-cli/<app>/`, so each tool signs in
  separately. They do *not* share a session.
* **Default server is production** (`ss_config.c`), overridable via
  `~/.config/simple-social-cli/config.ini`.

---

## 3. Backend

### 3.1 Request lifecycle

```
POST action=post&postText=hi   +   Authorization: Bearer <jwt>
        │
        ▼
api.php: require config.php, logging.php, schema.php, auth.php
         merge php://input into $_POST, logRequest() (masks password,
         confirm, otp, reset_otp, refreshToken)
        │
        ▼
db() → PDO sqlite + lazy schema:
         users / pending_users            (register path)
         comments, notifications, auth_attempts, push_subscriptions
         ensureSharedSchema() → sessions, media  (shared with media.php)
        │
        ▼
requireAuth($pdo, $PUBLIC_ENDPOINTS)
         public actions skip auth; otherwise bearerToken() → jwtVerify()
         → sessionLookup(sid) → sessionTouch()
        │
        ▼
$HANDLERS[$action]($pdo, $user) → good() / bad() / respond()
```

### 3.2 Auth

Sessions replaced the old single `users.jwt` slot, which could hold one token
and therefore logged you out everywhere as soon as you logged in anywhere else.
`users.jwt` still exists but is no longer read.

* **`sessions` row:** `id` (the `sid` claim), `user_id`, `refresh_hash`
  (SHA-256 — the raw refresh token is never stored), `created_at`,
  `last_used_at`, `expires_at`, `revoked_at`, `device_name`, `user_agent`.
* **Login** returns an access `jwt`, a `refreshToken` and `expiresIn`. Lifetimes
  are `session_access_ttl` and `session_refresh_ttl` (sliding) in `config.php`.
* **Cap:** `session_max_per_user`. Logging in past the cap evicts the least
  recently used session.
* **Refresh:** `refreshToken` is a public endpoint — the expired access token
  can't authenticate the call that replaces it. `js/api.js` refreshes once on a
  401, single-flight, then retries the original request before falling back to
  the password modal.
* **Revocation:** `logout` kills only its own session. `getSessions`,
  `revokeSession` and `revokeAllOtherSessions` back the Devices list in
  Settings. A password reset revokes everything.

> **`jwtVerify()` does a real HMAC comparison** with `hash_equals`. The previous
> implementation never verified the signature at all — it got away with it
> because `verifyUser()` compared the whole token string against `users.jwt`, so
> a forged token failed that match. Removing that string compare without adding
> signature verification would have removed the only forgery protection.

`sessionTouch()` is throttled (5 minutes) so a read-only request doesn't take a
SQLite write lock just to update `last_used_at`.

### 3.3 Storage

* **users row:** `id, email UNIQUE, password (bcrypt), posts JSON, follows JSON,
  jwt (dead), created_at, last_notifications_seen_at, reset_otp, theme, hand`.
* **Post read path:** `ownerId = explode('.', $postId)[0]` →
  `SELECT posts FROM users WHERE id = ?` → linear scan of the decoded array.
  There is no post table and no index; a post cannot be queried, only fetched
  through its owner.
* **Likes** are denormalised inside each post object, so toggling one rewrites
  the owner's entire `posts` JSON.
* **Mentions** are stored as `@[id]` tokens in the post text. `hydrateMentions()`
  resolves them to `{id, email}` for clients; `resolveMentionTokens()` swaps
  them for `@email` where plain readable text is needed, such as previews.

### 3.4 Handlers (45)

```
Auth      login logout refreshToken getSessions revokeSession revokeAllOtherSessions
          sendOTP verifyOTP resetPassword sendRegisterOTP verifyRegisterOTP finishRegister
          deleteAccount getMyInfo getUserInfo getUsers getUserEmails
Posts     post deletePost getMyPosts getUserPosts fetchFollowedPosts getPostById
          getPostPreviews likePost unlikePost getPostLikes
Comments  createComment getPostComments getPostCommentCounts deleteComment
Social    followUser unfollowUser isFollowing getMyFollows getMyFollowers
Notifs    getNotifications getUnseenNotificationCount markNotificationsSeen
Push      getVapidPublicKey savePushSubscription deletePushSubscription
Settings  updateTheme updateHand
System    log
```

Public (no auth): `login, logout, refreshToken, sendOTP, verifyOTP,
resetPassword, sendRegisterOTP, verifyRegisterOTP, finishRegister`.

### 3.5 Media

`media.php` handles the upload; `api.php` links it to a post.

```
select file → POST /media.php action=uploadMedia (multipart)
              type detection, limits from config.php (media_max_seconds,
              media_max_fps, media_max_side, media_max_*_bytes),
              images re-encoded to webp
              INSERT media(user_id, path, post_id=NULL) → {mediaUrl, mediaId, type}
            → POST /api.php action=post postText + mediaUrl
              SELECT id FROM media WHERE path=? AND user_id=?   (400 if not owned)
              UPDATE media SET post_id = <new post id>
```

Upload failures report a specific reason — which limit was exceeded, the
detected MIME type, actual versus maximum size — rather than a generic failure.

### 3.6 Observability

`logRequest` / `logResponse` / `logError` write to `private/logs/` via
`logging.php`, rotating at 5 MB × 3. **`logRequest` masks `password`, `confirm`,
`otp`, `reset_otp` and `refreshToken`.** The refresh token matters most: it is a
30-day credential for the whole account and outlives the access token.

---

## 4. Frontend

### 4.1 Boot

`app.html` → `js/main.js:init()` → `Store.init()` reads
`localStorage[ss_jwt, ss_user, ss_refresh]` → `api.setJwt` → `renderHeader()` →
`Router.init()` → `startNotificationCheck()` polls `getUnseenNotificationCount`
every 60s.

`header.js` is shared with the static pages, so a signed-in visitor sees the app
navigation there too. It also draws the thumb-nav bubble on touchscreens and the
back-to-top button.

### 4.2 Router

Hash routing: `#/feed`, `#/post/1.123`. `handleHashChange()` enforces auth, then
`render()` calls the outgoing page's `destroy()`, clears `#main` and dispatches.

* `pendingFresh` distinguishes a link click from back/forward, since
  `hashchange` cannot. Fresh navigations scroll to the top; back/forward leaves
  scrolling to the page so `feed.js` and `profile.js` can restore position.
* `history.scrollRestoration` is `manual`, and a document load is treated as a
  fresh navigation. Otherwise the browser re-applied the old offset after a
  reload — which is what put Settings below the theme selector.

### 4.3 Data layer

`js/api.js` wraps `fetch`. On a 401 it calls `refreshSession()` once
(single-flight, so concurrent calls share one refresh) and retries before
showing the password modal. `mediaRequest()` gives uploads and deletes the same
refresh-and-retry treatment.

`js/store.js` holds `{jwt, user, notificationCount}` with `localStorage` keys
`ss_jwt`, `ss_user`, `ss_refresh`, and a `subscribe(cb)` for header/badge sync.

### 4.4 PWA

`manifest.json` plus `sw.js`:

* **Network-first for app code** — navigations and `.js`/`.css`. Cache-first
  served stale JavaScript after a deploy, which produced three separate
  "it doesn't work on my phone" incidents that were all the same root cause.
* **Badging** mirrors the notifications page rather than the notification tray:
  it clears on "mark as seen", not when a push is swiped away. The service
  worker keeps its own cached count so it can re-assert the badge with no page
  open.
* **Web push** via `webpush.php` (VAPID). Subscriptions are tied to the session
  that registered them, so revoking a device also stops its notifications.

---

## 5. Cross-system flows

**Post with media.** Web uploads on select, then posts; abandoning the page
leaves an orphan until the media is cleared. The draft now keeps the media's
path, type and id alongside the text, so leaving and returning restores it. The
CLI uploads and posts in one go, rolling back the upload if the post fails.

**Like → notification.** `likePost` / `unlikePost` append to `likes[]` and
insert a notification only when the actor isn't the owner. Mentions are the
exception: a self-mention is allowed through so you can see your own tag.

**Follow → feed.** `fetchFollowedPosts` collects followed IDs, pulls each
owner's `posts` blob, merges, sorts by timestamp and slices. There is no
follower table — `getMyFollowers` scans every user's `follows`.

---

## 6. Deployment

1. Commit and push to GitHub.
2. `ssh el1`, `git pull` in `dev.davidfruin.com/public_html`.
3. Run the suite in `simple-social-tests` against dev.
4. **Ask before pulling on `app.davidfruin.com`.** Production is never
   automatic.

There is no build step: a pull is the deploy. Schema changes apply themselves on
the next request through the lazy migrations in §1.

On a fresh host: create `private/logs`, write `JWT_SECRET` into `private/.env`
at mode 600.

---

## 7. Known problems

These are real and verified, not hypothetical.

* **Post ID collision.** Two posts created in the same second get the same ID,
  and **deleting either one deletes both.** Reproduced on dev: both posts
  returned id `1.1790146708`, `getPostById` returned only one, and deleting it
  left no survivor. A double-tap on "Post" is enough. Fixing it means changing
  post identity, which `comments.post_id`, `media.post_id` and the likes data
  all reference as strings.
* **`notes.md` and this file are served publicly.** The repo root is the
  docroot, so `/notes.md` returns 200 on both sites.
* **No reserved space for images.** `.post-media img` has no `aspect-ratio` or
  `min-height`, so an image contributes zero height until it decodes and then
  shoves the page down. Fixing it properly needs image dimensions stored on the
  `media` row.
* **Playback speed menu is clipped** on phones. Videos use native
  `<video controls>`, so that menu belongs to the browser and is bounded by the
  video box — roughly 263px tall on a 390px-wide phone, against the ~280px the
  menu needs. Only custom controls can fix it.
* **No foreign keys**, so deleting a user leaves comments and likes behind.
* **Three timestamp formats** across tables (unix ints, `Y-m-d H:i:s`, ISO),
  so cross-table comparisons need converting first.
* **`mbstring` is not enabled** in the site's `php.ini` (`;extension=mbstring`).
  The server CLI has it, so it looks available and isn't. Use `/u` regexes
  rather than `mb_*` in anything that runs under the web SAPI.

---

*See each terminal client's own repo for its build details.*
