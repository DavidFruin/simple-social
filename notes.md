ALWAYS FASTER
ALWAYS SAFER
ALWAYS LESS CODE
ALWAYS SIMPLER
ALWAYS CLEANER LOOKING
ALWAYS EASIER TO UNDERSTAND

RULES: keep the cli, tui and api backend separate from the client UI layer, with only the interactive cli and tui built ontop of the cli. web and mobile don't have to be kept separate anymore -- see ARCHITECTURE PLAN, the react native app is meant to reuse from the web frontend.

FEATURES
allow links in post text -- done
better video controls
notifications when someone comments on a post that you've commented on

FUTURE IDEAS
lock the site / log out all users for scheduled maintenance
admin panel for freezing or deleting specific users because of abuse or such things
chat feature where people can talk to each other, including group chats
complaints and ideas page where people can report a bug, complain about a person, or suggest an idea for the app
have to have a referal code to register account maybe?
tagging people in posts and comments -- done
language switcher

STYLE BUGS
navigation hand setting should have a note saying it only matters on phones -- done, and corrected: it's not phones-only, the note now says what actually happens
on phone view put the controls lower on the page on the create post page -- done, Post button moved into thumb reach
can't see all the playback speed options when you open the selector -- root cause found (it's the browser's native video menu, clipped by the video box). needs custom video controls to fix, see FEATURES
success and error messages should be slightly higher up on page in phone view -- done
dark mode: blue link text is illegible -- checked, it's not a themed color at all, it's the browser's unstyled default link blue on three links with no CSS class: "Don't have an account? Register" and "Forgot password?" on the login page, "Already have an account? Login" on the register page. everything else (nav, static pages, mentions, post links) already gets a theme-aware color

BUGS
search page could show "no users matching X" even for a real user -- done. render() never waited for the user list to finish loading before wiring up the search input, so typing fast (or a test filling the box right after page load) filtered an empty list. now re-filters once the real list arrives if a query is already typed.
after re-logging in from the session-expired modal, the page could get stuck on Loading forever -- done, real bug, not just flaky tests. page load fires more than one authenticated request at once (feed load, notification count poll), and if both hit an expired session close enough together, both called the same modal's show() -- which only had room for one pending caller, so the second silently discarded the first's promise and it never found out login succeeded. modal now queues every concurrent caller and resolves each one.
the tui/cli/wizard install failures on the two mint machines -- done. a separate session found the real cause: the makefiles symlinked libcurl to a hardcoded version path (.../libcurl.so.4.8.0), which breaks on any machine without that exact point release, and cloning from / (or with sudo) failed with a permission error the download page never warned about. fixed in all three repos (link by SONAME instead) and on the download page itself (cd ~ first, libcurl4/pkg-config listed upfront). verified on this machine: full build+login+post+delete cycle works on the cli, wizard and tui, and a from-/ clone reproduces the exact error text now documented
4px horizontal overflow on phones from .notif-badge -- found while testing something else, low importance, not fixed
low importance: after posting, the feed doesn't show your own new post for a second -- had to reload the feed to see it -- done
there is a flash when expanding a post -- investigated, doesn't reproduce. if you still see something, it's probably images shifting the page as they load in (no reserved space for them) -- tell me if that's what you meant
when you go back from expanded post you usually are a little bellow where you actually were on the page -- investigated, doesn't reproduce, scroll restore measured correct
when I go to settings page it is scrolled down a little bit so I can't see the theme selector -- done, was actually a reload bug not a navigation bug
leaving the create post page loses the media you uploaded -- done. also found it was worse than described: media wasn't lost, it silently stayed attached and got posted without you seeing it
fix hash routing -- no pound sign and no app.html in the url. want dev.davidfruin.com/feed instead of dev.davidfruin.com/app.html#/feed. needs an apache rewrite so any path that isn't a real file serves app.html, plus switching the router from hashchange to pushState/popstate, updating 28 app.html references (sw.js, manifest start_url, api.php push urls, header, pwa.js, index.html), and updating 18 test files. old #/ links and already-sent push notifications need to keep working. deliberately not done unattended -- all or nothing change, needs you watching on your phone
post previews can cut off in the middle of an @[id] mention, so the preview shows the raw token instead of a name -- done
post IDs collide if two posts are made in the same second, and deleting one deletes both -- found, reproduced, not fixed. needs a decision since it touches comments/media/likes which all reference the post id as a string
interactive cli (wizard): typing a command with anything after it (e.g. "login me@x.com", the way someone used to the plain cli would type it) said "Unknown command" as if the command didn't exist at all, on every single command -- done, now tells you to type it bare and answer the prompts
cli: `likes --json` printed the server's raw response including a meaningless "valid" field, the only --json command that didn't match the clean bare-object shape every other one uses -- done

DATABASE
posts are stored as one JSON blob in users.posts -- code done, not deployed yet. real posts/post_likes tables added, all 11 handlers that touched users.posts switched over (post, deletePost, likePost, unlikePost, getPostLikes, getPostById, getPostPreviews, getMyPosts, getUserPosts, fetchFollowedPosts, deleteAccount), verified against a copy of dev's real database (109 posts/130 likes/19 users) -- every read matched the old code byte-for-byte except cosmetic tie order on same-second likes. also simplified post-id collision handling: now that posts.id is a real primary key, a collision fails the insert itself, so the retry loop doesn't need the BEGIN IMMEDIATE transaction from the earlier fix anymore. users.posts left in the schema untouched as a fallback until this is confirmed live. next: run migrate-posts.php on dev's actual db, deploy to dev, run the test suite, then prod once confirmed
no foreign keys anywhere, so deleting a user leaves their media, comments and likes behind
media has no index on post_id -- checked, this was wrong, nothing queries media by post_id. the real gap was a missing user_id index in the source code (the index existed on the live databases by hand but wasn't in any file) -- done
the media table gets created in two different files (api.php and media.php) and the two definitions have to be kept matching by hand -- done, now defined once in schema.php
pending_users has no primary key
the follows and followers columns say NUMERIC but actually hold JSON text
users.followers and users.is_admin are never read or written -- dead columns
three different date formats in use across tables (unix numbers, "YYYY-MM-DD HH:MM:SS", and ISO strings), so comparing dates between tables needs converting first

DOCS AND TESTS
ARCHITECTURE.md is out of date -- done, rewritten and checked against the actual code
the test suite never reads the .env file even though its README says to put the login details there. the password also has an & in it, so just sourcing the file in a shell doesn't work either -- the vars have to be set by hand every run -- done, the suite reads .env itself now
13 tests need a second account that doesn't exist yet, so they always fail -- done, account created, all passing
3 session expiry tests still expect the "type your password again" popup -- done, split into the two real cases plus a new test that silent refresh actually works
one event listener test creates its own post and then tries to like it, but the app doesn't put a like button on your own posts, so that test can never pass -- done
the agent-board skill (dev.davidfruin.com used as a message board between claude agents, see war-table) is currently sharing a login with the test suite's TEST_EMAIL_2 (davefruin@gmail.com) -- fine for now, but should get its own dedicated account later so agent messages and test-run noise aren't mixed in the same account's post history

ARCHITECTURE PLAN (worked out 2026-09-24, via /grill-me)
this flushes out the detach-backend / split-into-microservices / api-gateway / docker-CI-CD ideas above -- fleshing them out, not replacing them.

backend: staying php, staying a monolith for now -- not going to separately-deployed microservices unless it's actually needed later. refactoring api.php/media.php in place (strangler-style), not a rewrite -- done, 2026-09-24. all 7 modules split out and deployed to dev: auth, users, posts (also picked up likePost/unlikePost/getPostLikes, which this plan forgot to assign anywhere), comments, follows, notifications, media. api.php now only has handle_deleteAccount left in it directly, on purpose -- it cascades across every domain, not a clean single-module fit. composer + PSR-4 autoloading (App\ -> src/) landed first, then each module via Composer's `files` autoload (plain functions, not classes -- this was a folder reorg, not an OOP rewrite). two real bugs the move caught: __DIR__-based paths (post-deletion media cleanup, media's own directory layout) meant the old file's directory and broke silently once code moved into src/<Module>/, fixed and verified against a live upload+delete round trip on dev; and media.php's own respond/bad/good/db/logMsg/requireAuth (different implementations than api.php's, same names) had to stay put rather than share the Composer autoload list, which would've been a straight redeclaration fatal. deploy stays manual git pull for now -- moving to github actions deploying to the same server is the direction, but that's its own separate planning pass, not decided in detail yet.

frontend: full recreation in typescript + vite + shadcn (currently vanilla js, no build step, no ts). not preserving the retro-BBS look in the rebuild -- that identity now lives in the terminal clients (cli/wizard/tui) instead. backend goes first, frontend rewrite starts once the backend's structure has settled.

mobile: react native app built from/sharing with the new web frontend, once the web rewrite lands -- explicitly a bridge step toward eventual true-native (swift/kotlin) apps later, not the destination. this is why the old cli/tui/backend/web/ios/android-must-stay-separate rule above got loosened -- RN can reuse as much of the web frontend as makes sense. how much actually gets shared (just the logic/api-client layer vs UI-level sharing via a cross-platform kit) is deliberately left open until the react migration itself starts.

PRIVACY
this file is served publicly -- https://app.davidfruin.com/notes.md returns 200, so anyone can read the whole bug list. same for ARCHITECTURE.md. they should be blocked or moved out of the docroot -- needs an .htaccess change, which I'm not making without you asking directly
api.log collects credentials -- the live refresh-token leak is fixed. still need a decision on how long to keep this log
