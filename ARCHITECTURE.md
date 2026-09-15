# Simple Social — Architecture Map

> **Version:** 2026-09-15 (post Phase 0/A/M + CLI Phases B/C)  
> **Live:** `https://dev.davidfruin.com` → docroot `public_html/`  
> **Repos:** `simple-social` (web + API) + `simple-social-cli` (alternate IO)

---

## 1. Philosophy

| Principle | How it manifests |
|-----------|------------------|
| **No framework SPA** | Vanilla JS modules attached to `window`, no build step, no bundler. `index.html` loads every script with `<script src>` and the hash router does client navigation. |
| **Single-file API** | `api.php` is a 40 kB flat dispatcher (~36 actions) with a 3-level indentation rule. Not MVC — one `$HANDLERS` table, one `db()` factory, one `respond()`. Easy to `scp` and `grep`. |
| **SQLite + JSON blobs** | `users.posts` and `users.follows` are JSON arrays inside a single `users` row. `notifications` and `comments` are real normalized tables. Hybrid: “document inside relational”. |
| **Content-addressed IDs** | Post ID = `"{ownerId}.{unixtime}"`. Owner is derivable by `explode('.', $postId)[0]`. Keeps routing cheap; collisions possible within same second (known). |
| **Stateless auth, stateful revocation** | JWT (HS256) in `Authorization: Bearer`, but the live token is mirrored into `users.jwt` so `verifyUser()` can revoke by string compare. Rotation forces `UPDATE users SET jwt=''`. |
| **Bare JSON over form bodies** | Every API call is `POST action=foo&param=bar` with `application/x-www-form-urlencoded`. Responses are `{"valid":true,…}` with `JSON_UNESCAPED_UNICODE`. CLI mirrors this. |
| **Bare schema for scripting** | CLI `--json` emits the same bare objects the API uses (`{"posts":[…]}`, `{"id":1,…}`), not an envelope. Stdout is machine, stderr is human — `cli --json … | jq` works. |

---

## 2. File Structure

### 2.1 Server layout (actual on `ns1`)

```
/home/davidfruin/domains/dev.davidfruin.com/
├── private/                     # OUTSIDE docroot — not web-reachable
│   ├── userdata.db              # SQLite (users, notifications, comments, media)
│   ├── .env                     # JWT_SECRET=… (600, chown www-data if needed)
│   └── logs/
│       ├── api.log              # from api.php logMsg (via $CONFIG['log_dir'])
│       ├── media.log
│       ├── frontend.log / access.log / php.log  # via logging.php
│       └── … .1 .2 .3 rotated (5 MB ×3)
└── public_html/                 # docroot (what Apache serves)
    ├── .htaccess                # Authorization passthrough + <FilesMatch> denies
    ├── .env.example             # documents JWT_SECRET
    ├── config.php               # loads .env, exposes $CONFIG['jwt_secret','db_path','log_dir']
    ├── api.php                  # ← main API (see §3)
    ├── media.php               # upload/deleteMedia (multipart, mime → media table)
    ├── logging.php             # writeLog/rotate, handle_log_request (auth-gated)
    ├── clean-notifications.php  # CLI-only (SAPI gate + 403), deletes malformed notifs
    ├── index.html              # SPA shell: <div id="header"> + <div id="main"> + <script> tags
    ├── css/main.css
    ├── site-icon.png
    ├── js/
    │   ├── main.js             # bootstrap, header render, notification polling
    │   ├── store.js            # localStorage-backed JWT + user + notif count, pub/sub
    │   ├── router.js           # hash router `#/page` / `#/page/:id`, auth guards
    │   ├── api.js              # Api.call(action, params) → fetch to api.php/media.php
    │   ├── logger.js           # frontend error forwarding → POST action=log
    │   ├── components/
    │   │   ├── post-card.js / comment.js / media-viewer.js
    │   │   └── session-expired-modal.js
    │   └── pages/
    │       ├── login.js / register.js / reset-password.js
    │       ├── feed.js / post.js / create-post.js (upload-on-select → post-with-url)
    │       ├── profile.js / search.js / notifications.js / settings.js
    └── tests/
        ├── backend-tests/ (test_api.sh, test_api_auth.sh, test_media.sh, test_db.php …)
        └── front-end-test/ (Playwright: playwright.config.js + tests/*.spec.js)
```

Git-tracked vs. ignored: `.gitignore` has `*.log *.db .env media/ logs/ node_modules/` — the private data never enters git.

### 2.2 CLI repo (`simple-social-cli`)

```
simple-social-cli/
├── Makefile                     # vendor-links → vendor/libcurl.so, -Lvendor -lcurl, rpath, parallel-safe
├── .gitignore                   # *.o *.so !vendor/libcurl.so
├── vendor/
│   ├── include/curl/ (275 headers, 8.14.1)
│   └── libcurl.so → /usr/lib/x86_64-linux-gnu/libcurl.so.4.8.0
├── lib/  (builds to lib/libss.so, -fPIC)
│   ├── ss_api.c / .h            # 40 curl API functions, parse_* helpers, media upload_with_id
│   ├── ss_json.c / .h           # hand-rolled parser: find_key, json_get_string/int/bool/array
│   ├── ss_config.c / .h         # base_url from ~/.config/simple-social-cli/config.ini → data_dir/Downloads
│   ├── ss_state.c / .h          # JWT + user persistence in ~/.simple-social-cli/{jwt.txt,user.json} with tui legacy fallback
│   └── ss_utils.c / .h          # str_* , url_encode, truncate
└── cli/
    ├── main.c                   # auto_login, 28 commands, global --json/--color, bounded text joins
    └── output.c / .h            # human tables vs bare JSON (json_escape, is_null_media), color via isatty
```

Build: `make -j4` → `vendor-links` → `lib/libss.so` → `simple-social-cli` (rpath `$ORIGIN/lib`). No `sudo`; `libcurl` resolved via vendored symlink because `.gitignore:2` previously hid it (fixed Phase B).

---

## 3. Backend (api.php — 950 lines)

### 3.1 Request lifecycle

```
HTTP POST  action=post&postText=hi  +  Authorization: Bearer <jwt>
        │
        ▼
api.php top:  require config.php + logging.php
              ob_start(), getRawPostData() merges php://input into $_POST
              logMsg("REQUEST…")
        │
        ▼
db()  →  PDO('sqlite:'.$CONFIG['db_path']) + CREATE TABLE IF NOT EXISTS
          • notifications (id, recipient_id, actor_id, actor_email, type, post_id, created_at)
          • comments (id, post_id, user_id, comment_text, created_at)
          • media (id, user_id, filename, type, path, created_at, post_id)  [added Phase M, migrated via PRAGMA]
          • users / pending_users created lazily on register path
        │
        ▼
$HANDLERS = [ 'login' => 'handle_login', … 36 entries,
              'getPostById' => handle_getPostById, 'getPostPreviews', 'log', … ]
$PUBLIC_ENDPOINTS = ['login','sendRegisterOTP',…]  (no auth)
        │
        ▼
requireAuth($pdo, $PUBLIC)  →  checks in_array, else parses Bearer, verifyUser()
  verifyUser = jwtDecode (base64 payload, exp) + SELECT jwt FROM users WHERE id=? 
               + string compare stored token (only HMAC check today is this equality)
        │
        ▼
$HANDLERS[$action]($pdo,$user)  →  good()/bad()/respond()
              respond() → ob_clean(), http_code, header application/json, json_encode(..., JSON_UNESCAPED_UNICODE)
              logResponse / logError via logging.php
```

### 3.2 Auth & user flow

* **Register:** `sendRegisterOTP` → mail OTP → `pending_users(email,otp,dateCreated)` (600 s) → `registerVerifyOTP` → `registerFinish` (password_hash, INSERT users, DELETE pending). Same shape for reset.
* **Login:** `SELECT password FROM users WHERE LOWER(email)=LOWER(?)`, `password_verify`, `jwtEncode(sub, exp=6 months)` with `hash_hmac(sha256, header.payload, $CONFIG['jwt_secret'])`, `UPDATE users SET jwt='{"token":"…"}'`, return `jwt` + `userId`. Secret lives only in `private/.env`, loaded by `config.php:loadDotEnv`.
* **Logout:** `jwtEncode` would fail closed (500) if secret missing; `logout` clears `users.jwt`.
* **Session expired modal:** `js/components/session-expired-modal.js` catches 401 and prompts re-login.

### 3.3 Storage specifics

* **users row:** `id INTEGER PK, email UNIQUE, password (bcrypt), posts JSON text, follows JSON text, jwt JSON text, created_at, last_notifications_seen_at, reset_otp…`
  * `posts` example entry: `{"id":"1.1789437926","text":"hello","timestamp":"2026-09-15 02:21:00","likes":[{"userId":4,"timestamp":"…"}],"mediaUrl":"/media/1/image/…webp"}`
  * `follows` is `[{"id":4,"timestamp":"2026-03-03…"}, …]` — timestamp is embedded per-follow, hence `getMyFollows` joins against it.
* **ID derivation:** `ownerId = (int)explode('.', $postId)[0]`. Every post read does `SELECT posts FROM users WHERE id = $ownerId` then linear scans the decoded array. No post table, no index.
* **Likes are denormalized** inside each post object; toggling rewrites the whole `posts` JSON.
* **media rows:** `(user_id, filename, type, path, post_id)` — `post_id` is NULL until `handle_post` links it; `deletePost` now resolves via this row rather than string concat (Phase M), preventing traversal.

### 3.4 Handler inventory (36)

Auth: `login, logout, getMyInfo, getUserInfo, getUsers, sendRegisterOTP, registerVerifyOTP, registerFinish, sendOTP, verifyOTP, resetPassword, deleteAccount`  
Posts: `post, deletePost, getMyPosts, getUserPosts, fetchFollowedPosts, getPostById, getPostPreviews, likePost, unlikePost, getPostLikes, getPostCommentCounts, getPostComments`  
Social: `followUser, unfollowUser, isFollowing, getMyFollows, getMyFollowers`  
Notifications: `getNotifications, getUnseenNotificationCount, markNotificationsSeen`  
Comments: `createComment, getPostComments, deleteComment`  
System: `log, getUsers`  

`getPostById` now injects `userID/userEmail` from owner row (Phase A); `getPostPreviews` uses placeholders; `unlikePost` has `postFound`+`wasLiked` guard (Phase A); `getNotifications` is `LEFT JOIN users` for live `actor_email`.

### 3.5 Validation (Phase A)

Shared `validateContent($text)` → `preg_match('/[^\x20-\x7E\n\r\xA0-\xFF]/u', $text)` — allows printable ASCII including `%`+`&`, newline `\n\r`, Latin1 `A0-FF` (covers `áéíóúñ¿¡«»` correctly with `/u`; the old byte loop rejected multi-byte). Both `post` and `createComment` call it; length cap 5000 remains.

### 3.6 Media path (api.php + media.php)

```
Browser/CLI:  select file ──► POST /media.php action=uploadMedia (multipart)
                               media.php: getMediaType(), max 10/100/50 MB, processImage → webp,
                               INSERT media(user_id, path=/media/{uid}/{type}/…, post_id=NULL)
                               ← {mediaUrl, mediaId, type}
                               then POST /api.php action=post postText + mediaUrl
                               api.php: SELECT id FROM media WHERE path=? AND user_id=? → 400 if not owned
                                        INSERT post with mediaUrl, UPDATE media SET post_id = newPost.id
```

Delete: `handle_deletePost` → `SELECT id,path FROM media WHERE path=? AND user_id=?` → `unlink(__DIR__.path)` + thumb + `DELETE FROM media`. `handle_deleteAccount` sweeps `media/user_id`.

### 3.7 Observability

* `api.php:logMsg` → `private/logs/api.log` (rotated) ; `logRequest` masks `password, confirm, otp, reset_otp`; `logResponse/logError` → `logging.php:writeLog`.
* `logging.php:writeLog($level,$category,$msg,$ctx)` with `LOG_DIR=$CONFIG['log_dir']`, `LOG_MAX_SIZE 5 MB`, `LOG_ROTATE_COUNT 3`, `test_mode ? DEBUG : WARN` threshold. `handle_log_request` now requires auth (Phase A) and `clean-notifications.php` is CLI-only (403 over HTTP) + `<FilesMatch>` in `.htaccess` denies `*.db *.log .env`.

### 3.8 Security deltas (Phase 0/A/M)

* 0: leaked `userdata.db`/`api.log`/`clean-notifications.php`; fixed via `<FilesMatch>` + moving DB/logs to `private/` + JWT secret to `private/.env` + `UPDATE users SET jwt=''`.
* A: OTP masking, validator UTF-8, JOIN for live email, deleteAccount comment cleanup, shadow rename, postFound guard.
* M: media `post_id` linkage, ownership check, traversal guard, `..` rejection.

---

## 4. Frontend (SPA)

### 4.1 Boot

`index.html` → `js/main.js:init()`:
  `Store.init()` reads `localStorage[ss_jwt, ss_user]` → `api.setJwt` → `renderHeader()` → `Router.init()` (hashchange) → `startNotificationCheck()` poll `getUnseenNotificationCount` every N s → badge. `Store.subscribe` keeps header/badge in sync.

### 4.2 Router & pages

`router.js`:
* `routes = {login, register, reset-password} requiresAuth:false` vs `feed, create-post, post, profile, notifications, settings, search` true.
* `getRoute()` splits `#/feed` or `#/post/1.123` → `(page, id)`.
* `handleHashChange()` enforces auth (→ `#/login` or `#/feed`), `container.innerHTML=''` + `currentPage.destroy()` then `switch(page)` → `LoginPage.render(container)` etc.
* `navigate(path)` → `location.hash = path`.

Each `js/pages/*.js` is an IIFE exposing `render(container), destroy()`:
* `feed.js`: `api.fetchFollowedPosts(offset,limit)` → `post-card.js` renders + `media-viewer`.
* `create-post.js`: file input → `api.uploadMedia(file)` preview (`currentMediaUrl`), submit → `api.post(text, currentMediaUrl)` (two-step, preview before post).
* `post.js`: `api.getUserPosts(uid)` filter client-side (hence old `getPostById` was dead on web) + `getPostComments`.
* `notifications.js`, `profile.js` (follows/followers tabs), `search.js`, `settings.js` similar.
* `register.js` / `reset-password.js` do OTP steps.

### 4.3 Data layer

`js/api.js`:
```
class Api { jwt, call(action, params){
  body = new URLSearchParams({action, ...params})
  headers = {Authorization: 'Bearer '+this.jwt} if set
  fetch('/api.php', {method:'POST', headers, body})
  // media goes to fetch('/media.php', {method:'POST', body: FormData})
  if (res.valid===false && res.error==='Unauthorized') throw SessionExpired
  return res
}}
api.post(text, mediaUrl) → this.call('post',{postText:text, mediaUrl})
api.likePost(id) → call('likePost',{postId:id}) etc.
```

`js/store.js`: `state={jwt, user, notificationCount}`, `localStorage` for `ss_jwt/ss_user`, `subscribe(cb)` fires on `jwt/user/notificationCount`, `isLoggedIn()` checks `jwt!=null`.

`js/logger.js`: `logFrontendError/info` → `POST action=log` (now auth-gated).

### 4.4 Components

`post-card.js` renders post + like button + comment preview; `media-viewer.js` expands `/media/...webp`; `comment.js` nests under post; `session-expired-modal.js` overlays login.

### 4.5 Flow examples

**Feed:** `Router #/feed` → `feed.js:render` → `api.fetchFollowedPosts` → `api.php:fetchFollowedPosts` (collect followed IDs, SELECT users WHERE id IN (…), fan-out posts, attach userID/email, sort by timestamp, slice, `hasMore`) → `post-card` list.

**Create post with media (web):** `create-post.js:handleMediaSelect` → `api.uploadMedia(File)` → `media.php` → preview → `handlePostSubmit` → `api.post(text, currentMediaUrl)` → `api.php` validates ownership + links `media.post_id`.

---

## 5. CLI (`simple-social-cli`)

### 5.1 Build & linkage

`Makefile`:
* `vendor/include/curl 8.14.1` matches runtime `libcurl.so.4.8.0` via `vendor/libcurl.so -> /usr/lib/.../libcurl.so.4.8.0` (commit restores the symlink `.gitignore` hid).
* `CFLAGS -fPIC -Ivendor/include -Ilib`; `LIB = lib/libss.so` (`-shared -Lvendor -lcurl`), `BIN = simple-social-cli` (`-Llib -lss -Wl,-rpath,'$ORIGIN/lib'`), `vendor-links` order + `BIN: $(CLI_OBJS) $(LIB)` fixes parallel race.

### 5.2 Library vs binary

* **lib** (`-fPIC`, `.so`): `ss_api.c` 40 functions (api_call → libcurl POST + Bearer, `build_params/url_encode`), `ss_json.c` (find_key, skip_string, json_get_string/int/bool/array, array len/get), `ss_state.c` (jwt/user persistence in `~/.simple-social-cli/` with legacy tui fallback), `ss_config.c` (base_url + data_dir, `~/.config/simple-social-cli/config.ini`), `ss_utils.c` (trim, dup, url_encode).
* **cli** (`main.c` + `output.c`): `auto_login()` tries `ss_state_load_jwt` → `api_get_my_info` validate → `api_set_user_id`; `commands[]` table; `g_color_enabled` (isatty fallback) vs `g_json_enabled` (disables color) as global flags parsed **before** command (design per user req).

### 5.3 Command set (28)

```
AUTH: login <email> <pw>, logout, whoami, register <email> <otp> <pw> <cfm>, send-otp, reset-password
POSTS: feed [--limit N --offset N], posts [user_id] [--limit --offset] (Phase C), post <id>, create <text> [--media <file>] (Phase M), delete <id>, like/unlike <id>, likes <id> (Phase C)
COMMENTS: comments <postId> [--offset], comment <postId> <text>, delete-comment <id>
USERS: users, profile [userId], follow/unfollow <userId>, followers/following [userId]
NOTIFS: notifications [--offset], notify-count, mark-seen
(no standalone upload — removed Phase M 2a)
```

### 5.4 Output modes

`output.c`:
* human: tables (`%-10s %-40s` for posts, color via `C_GREEN/C_CYAN` if `g_color_enabled`), truncated text (40 chars), `is_null_media("null")` guard.
* json (bare): `json_escape` handles `" \ \n\r\t \u00xx`; `print_posts → {"posts":[{id,text,timestamp,userID,userEmail,likeCount,isLiked,mediaUrl,likes}],hasMore,totalCount}`, `print_post → {"post":{…}}`, `print_users → {"users":[{id,email,created_at}]}`, `print_comments`, `print_notifications`, `print_profile`, `print_count → {"count":N}`; errors → `{"ok":false,"error":"…"}` to stdout + stderr.

### 5.5 State & data flow

```
$ simple-social-cli login me@… pw
  → api_login → config_get_base_url (https://dev.davidfruin.com/api.php)
  → curl POST action=login → {jwt, userId} → api_set_jwt/user_id
  → ss_state_save_jwt/user (mkdir ~/.simple-social-cli, jwt.txt + user.json)

$ simple-social-cli create "hi" --media ./pic.jpg
  → auto_login (load + validate) → parse --media → api_upload_media_with_id (POST /media.php multipart, returns mediaUrl+mediaId)
  → api_create_post(text, mediaUrl) → POST /api.php action=post (server validates ownership)
  → on post failure api_delete_media(mediaId) rollback → print {"postId":…, "mediaUrl":…} or table
```

Text joining in `cmd_create/cmd_comment` is bounds-checked `5000` (Phase B) vs `api.php: 5000`.

---

## 6. Cross-system flows

### 6.1 Post with media (CLI vs web diverge then converge)

Web: select file → `POST /media.php` → preview → submit → `POST /api.php` (two-step, abandon on close → orphan until reaper).  
CLI: `create --media` → `POST /media.php` → immediate `POST /api.php` → rollback on post failure (no orphan window). Both hit the same `mediaUrl` ownership check.

### 6.2 Like / unlike → notification

`likePost` / `unlikePost` in `api.php` each append `likes[]` and `INSERT notifications ... type='like'|'unlike'` only if `ownerId != actor` and (for unlike) `wasLiked` actually changed (Phase A). `getNotifications` now live-joins email. Frontend polls `getUnseenNotificationCount` vs `last_notifications_seen_at`.

### 6.3 Follow → feed

`users.follows` JSON tracks `{id,timestamp}` per target. `fetchFollowedPosts` collects all followed IDs, pulls their `posts` blobs, merges, sorts, slices. No follower table — `getMyFollowers` scans all `users.follows` for references to the target.

---

## 7. Deployment & ops

* `.htaccess`: `SetEnvIf Authorization` → `E=HTTP_AUTHORIZATION`, then `<FilesMatch "\.(db|log|env|sqlite)$"> Require all denied` etc. + `RewriteRule ^(userdata\.db|.*\.log|\.env.*|clean-…) [F,L]` — the private move is the real fix, this is defense-in-depth.
* `config.php:loadDotEnv(__DIR__), loadDotEnv(dirname(__DIR__)), private/.env` precedence, then `$CONFIG['jwt_secret'] = getenv('JWT_SECRET')` (fail-closed 500 if null), plus `db_path`/`log_dir` resolution to `private/`.
* On fresh host: `mkdir -p private/logs && php -r 'echo "JWT_SECRET=",bin2hex(random_bytes(32)),"\n";' > private/.env && chmod 600` then `UPDATE users SET jwt=''` to invalidate.

---

## 8. Notable gotchas

* **Post ID collision** within same second → duplicate IDs overwriting. Mitigation would be `+ random` or `microtime`.
* **Orphan media** pre-Phase M (your 2 test uploads) still at `/media/1/image/1_image_20260915013530_*` with `post_id=NULL` — left per your request, not backfilled.
* **Old `~/.simple-social-tui`** data auto-falls back to `~/.simple-social-cli` (code in `ss_state.c`, `ss_config.c`, `main.c` logout).
* **Tests are not on prod** per your repo branch plan; `tests/backend-tests` hits live `dev.davidfruin.com` with `TEST_EMAIL/TEST_PASSWORD`.

---

*Generated for `simple-social` repo. See `simple-social-cli` repo for its `ARCHITECTURE.md` (CLI-centric view).*
