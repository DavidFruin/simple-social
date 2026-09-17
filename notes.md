ALWAYS FASTER
ALWAYS SAFER
ALWAYS LESS CODE
ALWAYS SIMPLER
ALWAYS EASIER TO UNDERSTAND

keep the cli, tui, api backend, web frontend, ios frontend and android frontend separate with only the interactive cli and tui built ontop of the cli.

FEATURES
on phone version have the pages be an arc around the bottom right corner so your thumb can easily switch pages. it should be a bubble that only opens when you tap it and closes when you tap it again. in settings you should have dark mode light mode and left hand or right hand so lefties can use their left thumb for navigation. and all other things on the app should mirror for lefties.
thumb driven bottom corner located navigation menu (this might be the same thing as the arc/bubble idea above -- check with Dave)
tagging people in posts and comments
comments also links to expand
have to have a referal code to register account maybe?
add "scroll to top" button"
add a button to the web front end to add a pwa to the homescreen of android and ios
add push notifications to pwa
add notifications badge to pwa
media capture should be three buttons: picture, video, audio
cli/interactive cli support for arch linux and nix -- coming soon (debian/ubuntu only for now)
add a loading spinner

STYLE FEATURES
dark mode and a color mode: blue theme, red theme, and a hacker theme (green-on-black terminal look). settable in Settings, same place as the existing dark mode / light mode / left-hand / right-hand options.

BUGS
once logged in there's no way to reach the about, api, code of conduct, or download pages -- they're only linked from the landing page menu, which a logged-in user never sees
liking and unliking a post causes weird flashing
opening an image in the lightbox, pressing the fullscreen button, then closing the lightbox with the x leaves the screen frozen
the landing page should be the first page people land on, but .php takes precedence over .html on the server. talk this through with Claude later

STYLE ERRORS
truncated posts only show "..." as a hint that there's more text, easy to miss that you need to expand the post to read the rest
make newest commments on the bottom not the top of the comments
errors should be in a error log in the console not displayed to the user

MOBILE STYLE ERRORS
