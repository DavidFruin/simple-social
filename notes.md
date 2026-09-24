ALWAYS FASTER
ALWAYS SAFER
ALWAYS LESS CODE
ALWAYS SIMPLER
ALWAYS CLEANER LOOKING
ALWAYS EASIER TO UNDERSTAND

RULES: keep the cli, tui, api backend, web frontend, ios frontend and android frontend separate with only the interactive cli and tui built ontop of the cli.

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
posts are stored as one JSON blob in users.posts. it can't be indexed or queried, and two writes to the same user at the same time can overwrite each other. this is the biggest structural problem in the app -- deliberately not touched unattended, it's a real migration
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

PRIVACY
this file is served publicly -- https://app.davidfruin.com/notes.md returns 200, so anyone can read the whole bug list. same for ARCHITECTURE.md. they should be blocked or moved out of the docroot -- needs an .htaccess change, which I'm not making without you asking directly
api.log collects credentials -- the live refresh-token leak is fixed. still need a decision on how long to keep this log
