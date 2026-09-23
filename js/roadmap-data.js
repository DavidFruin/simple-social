// js/roadmap-data.js - The list behind the Roadmap page.
//
// This is the only file to edit when the plan changes. Each entry is one
// feature:
//
//   title      what people see. Keep it plain - this page is for users,
//              not a changelog for developers.
//   done       true once it's live on app.davidfruin.com.
//   eta        roughly when it's expected, for anything not done yet.
//              Free text, so "October 2026" or "Early 2027" both work.
//              Write "Not scheduled" rather than guessing a date.
//   completed  the day it shipped, as YYYY-MM-DD. Only for done entries.
//
// Order doesn't matter: the page sorts upcoming items by ETA and finished
// ones newest-first. Nothing reads this but roadmap.js, and the page is
// public, so don't put anything here that isn't meant for everyone.

const RoadmapData = [
  // --- Coming up -----------------------------------------------------
  {
    title: 'Links in post text',
    detail: 'Web addresses in a post become clickable instead of plain text.',
    done: false,
    eta: 'October 2026'
  },
  {
    title: 'Better video controls',
    detail: 'A fuller set of playback controls, including easier access to speed options.',
    done: false,
    eta: 'October 2026'
  },
  {
    title: 'Replies to conversations you are part of',
    detail: "Get notified when someone comments on a post you've already commented on, not just on your own posts.",
    done: false,
    eta: 'November 2026'
  },
  {
    title: 'Scheduled maintenance mode',
    detail: 'A way to close the site briefly for planned work, with a notice instead of errors.',
    done: false,
    eta: 'November 2026'
  },
  {
    title: 'Report a problem or suggest an idea',
    detail: 'A page for reporting bugs, reporting abuse, and suggesting features.',
    done: false,
    eta: 'December 2026'
  },
  {
    title: 'Moderation tools',
    detail: 'Tools for suspending or removing accounts that are being abusive.',
    done: false,
    eta: 'December 2026'
  },
  {
    title: 'Direct messages and group chats',
    detail: 'Private conversations between people, one to one or in a group.',
    done: false,
    eta: 'Early 2027'
  },
  {
    title: 'Language switcher',
    detail: 'Use Simple Social in a language other than English.',
    done: false,
    eta: 'Early 2027'
  },
  {
    title: 'Invite-only registration',
    detail: 'Possibly requiring a referral code to create an account. Still being decided.',
    done: false,
    eta: 'Not scheduled'
  },

  // --- Already built -------------------------------------------------
  {
    title: 'This page',
    detail: 'A public list of what is planned and what is already built.',
    done: true,
    completed: '2026-09-22'
  },
  {
    title: 'Stay signed in on several devices',
    detail: 'Signing in on your phone no longer signs you out on your computer.',
    done: true,
    completed: '2026-09-22'
  },
  {
    title: 'See and sign out your devices',
    detail: 'Settings lists everywhere you are signed in, and can sign out one device or all the others.',
    done: true,
    completed: '2026-09-22'
  },
  {
    title: 'Terminal apps you can download on their own',
    detail: 'The text-mode app and the guided command-line app can each be installed without the other.',
    done: true,
    completed: '2026-09-22'
  },
  {
    title: 'Tagging people in posts and comments',
    detail: 'Type @ to mention someone. They get a notification and their name links to their profile.',
    done: true,
    completed: '2026-09-21'
  },
  {
    title: 'Notification badge matches the notifications page',
    detail: 'The number on the app icon now clears when you mark notifications as seen, not when you swipe one away.',
    done: true,
    completed: '2026-09-21'
  },
  {
    title: 'Clearer messages when an upload fails',
    detail: 'Uploads that fail now say why - too long, too large, or an unsupported file type.',
    done: true,
    completed: '2026-09-21'
  },
  {
    title: 'Adjustable limits on photos, video and audio',
    detail: 'Length, size and quality limits moved into one place so they can be tuned.',
    done: true,
    completed: '2026-09-21'
  },
  {
    title: 'Loading spinners',
    detail: 'Uploads and slow page loads show a spinner instead of looking frozen.',
    done: true,
    completed: '2026-09-18'
  },
  {
    title: 'More color themes',
    detail: 'Red, blue and high-contrast themes alongside the original light and dark.',
    done: true,
    completed: '2026-09-17'
  }
];

window.RoadmapData = RoadmapData;
