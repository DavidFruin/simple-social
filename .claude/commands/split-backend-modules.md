---
description: Split the PHP backend (api.php/media.php) into domain modules under src/, one module at a time
---

# Split the backend into modules

This executes the backend-restructuring decision recorded in `notes.md`
("ARCHITECTURE PLAN") and in the war-table note for this project
(`Projects/simple-social.md`, "Planning — future architecture"). Read both
before starting if you weren't the session that wrote them.

## The shape

Modular monolith, not microservices — one deployable, split into clean
domain folders under `src/`, autoloaded via the Composer/PSR-4 setup already
in place (`App\` -> `src/`, see `composer.json`). Not going to separately
deployed services unless that's actually needed later.

## Ground rules

1. **Refactor in place, not a rewrite.** Strangler-style: move one module's
   handlers out of `api.php`/`media.php` into `src/<Module>/`, wire it back
   in, verify, commit, move to the next. Never a big-bang cutover.
2. **Preserve the external API contract exactly.** Same action names, same
   request/response shapes, same error behavior. The web frontend, CLI, TUI,
   and interactive-CLI clients all depend on the wire format as it exists
   today — this is an internal reorganization, not a protocol change.
3. **The app stays deployable after every single commit.** If you can't get
   a module fully moved and verified in one sitting, stop at a commit where
   `api.php`/`media.php` still work, not mid-move.
4. **Verify after each module**, before starting the next:
   `~/dev/simple-social-tests`: `npm test` against dev (see this repo's
   `CLAUDE.md` for the full workflow — commit, push, pull to dev, test,
   report; prod needs the user's explicit go-ahead, same as always).
5. **Fix issues you find along the way** rather than deferring them, per the
   standing decision on this — but don't let that scope-creep a module move
   into a redesign. If something's bigger than a local fix, log it in
   `notes.md` and keep moving.
6. Update `notes.md` and the war-table note as modules land, same as the
   rest of this project's work — not just at the very end.

## Target modules and what moves where

Derived from `api.php`'s `$HANDLERS` table and `media.php`'s, as of this
writing. Re-check against the live table before moving a module — it may
have changed.

**`src/Auth/`** — login, logout, refreshToken, sendOTP, verifyOTP,
resetPassword, sendRegisterOTP, verifyRegisterOTP, finishRegister,
getSessions, revokeSession, revokeAllOtherSessions

**`src/Users/`** — getUserInfo, getUsers, getUserEmails, getMyInfo,
updateTheme, updateHand

**`src/Posts/`** — post, getMyPosts, getUserPosts, fetchFollowedPosts,
deletePost, getPostById, getPostPreviews, likePost, unlikePost,
getPostLikes (**corrected 2026-09-24**: the original version of this list
never assigned the three like handlers anywhere. post_likes is post-scoped
data sharing `getLikesForPostIds()`/`postRowToApi()` with every other
posts handler, so they belong here.)

**`src/Comments/`** — createComment, getPostComments, deleteComment,
getPostCommentCounts

**`src/Follows/`** — getMyFollowers, getMyFollows, followUser, unfollowUser,
isFollowing

**`src/Notifications/`** — getNotifications, getUnseenNotificationCount,
markNotificationsSeen, getVapidPublicKey, savePushSubscription,
deletePushSubscription

**`src/Media/`** — uploadMedia, deleteMedia (currently `media.php` — becomes
its own module folder as-is, no behavior change, just the move). **Watch
for `__DIR__`** here especially — `media.php` already has three uses of it
(`mediaDir()`, `db_path`, `log_dir` fallbacks) that meant the repo root and
will mean `src/Media/` instead once moved. See the `__DIR__` note below.

### The `__DIR__` trap

Any moved handler that uses `__DIR__` to build a filesystem path (media
files, uploads, logs) breaks silently unless fixed: `__DIR__` inside
`src/<Module>/handlers.php` means that folder, not the repo root api.php/
media.php always ran from. `handle_deletePost`'s media cleanup hit this
exactly (fixed with `__DIR__ . '/../../' . ltrim($path, '/')`, verified
against `realpath()` before deploying). **Grep for `__DIR__` in whatever
you're about to move, every time** — don't assume a handler is __DIR__-free
just because the last one was.

### Doesn't fit a single module — decide deliberately, don't default-place it

- **`deleteAccount`** cascades across nearly every domain (posts, likes,
  comments, media, follows, notifications, sessions). It belongs in
  `Users/` as the entry point, but it should call into each owning module's
  own cleanup rather than reaching into other modules' tables directly —
  that's the actual point of having modules. Don't let this handler become
  the thing that keeps every module coupled to every other.
- **`log` (`handle_log_request`)** is infrastructure, not a domain. Doesn't
  move into any of the modules above — becomes a shared utility (e.g.
  `src/Core/` or stays a top-level concern), same as request logging
  already is.
- **`auth.php`** (JWT/session helpers) and **`schema.php`** (table
  definitions) are shared across every module, not owned by `Auth/`
  specifically even though the name overlaps. Keep them as shared
  infrastructure (`src/Core/` or similar) that modules depend on, not
  something `Auth/` exports to everyone else.

## When you're done with all seven

`api.php` and `media.php` should be thin dispatchers (or gone entirely,
replaced by a single front controller) that route into `src/`. Update
`ARCHITECTURE.md` to match reality once the shape has actually settled —
don't rewrite it mid-migration and then have it drift again.
