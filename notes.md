ALWAYS FASTER
ALWAYS SAFER
ALWAYS LESS CODE
ALWAYS SIMPLER
ALWAYS EASIER TO UNDERSTAND

keep the cli, tui, api backend, web frontend, ios frontend and android frontend separate with only the interactive cli and tui built ontop of the cli.

FEATURES
on phone version have the pages be an arc around the bottom right corner so your thumb can easily switch pages. it should be a bubble that only opens when you tap it and closes when you tap it again. in settings you should have dark mode light mode and left hand or right hand so lefties can use their left thumb for navigation. and all other things on the app should mirror for lefties.
tagging people in posts and comments
comments also links to expand
have to have a referal code to register account maybe?
add "scroll to top" button"
add dark mode back into the site
add a button to the web front end to add a pwa to the homescreen of android and ios
add push notifications to pwa
add notifications badge to pwa

BUGS
while media lighthouse open page can still scroll
resetPassword api action doesn't check the OTP so anyone who knows an email can change that account's password (security)
finishRegister api action doesn't check the OTP so someone can register an email they don't own (security)
log api action always returns 401 so front end errors never get logged on the server
profile page adds a document click listener every visit that never gets removed so they pile up
api-documentation.md is out of date now that api.html exists

STYLE ERRORS
truncated posts only show "..." as a hint that there's more text, easy to miss that you need to expand the post to read the rest
make date commented line up on comments of posts on expanded post view
make newest commments on the bottom not the top of the comments
errors should be in a error log in the console not displayed to the user
highlight the menu item of the page that you are on

MOBILE STYLE ERRORS
