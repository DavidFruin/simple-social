// js/roadmap.js - Draws the Roadmap page from RoadmapData.
//
// Runs on roadmap.html only, which is a public page: no login, no API call,
// no Store. Everything it needs is already on the page by the time it runs.

// Built with textContent rather than an HTML string because the static pages
// don't load post-card.js, which is where escapeHtml lives. Setting text
// directly can't inject markup, so nothing needs escaping in the first place.
function roadmapItem(feature) {
  const item = document.createElement('li');
  item.className = 'roadmap-item' + (feature.done ? ' roadmap-item-done' : '');

  const mark = document.createElement('span');
  mark.className = 'roadmap-mark';
  mark.textContent = feature.done ? '✓' : '';
  // The tick is decorative - the "Built"/"Expected" chip already says which
  // it is, and a screen reader announcing a bare check mark adds nothing.
  mark.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'roadmap-body';

  const title = document.createElement('span');
  title.className = 'roadmap-title';
  title.textContent = feature.title;
  body.appendChild(title);

  if (feature.detail) {
    const detail = document.createElement('span');
    detail.className = 'roadmap-detail';
    detail.textContent = feature.detail;
    body.appendChild(detail);
  }

  const when = document.createElement('span');
  when.className = 'roadmap-when';
  when.textContent = feature.done
    ? 'Built ' + formatRoadmapDate(feature.completed)
    : etaLabel(feature.eta);

  item.appendChild(mark);
  item.appendChild(body);
  item.appendChild(when);
  return item;
}

// Split on the parts rather than passing the string to Date(): "2026-09-21"
// is parsed as UTC midnight, which prints as the 20th anywhere west of
// Greenwich. Building it from the numbers keeps the date as written.
function formatRoadmapDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

// "Expected October 2026" reads fine, "Expected Not scheduled" doesn't, so
// an entry with no real date says so on its own.
function etaLabel(eta) {
  if (!eta || /^not scheduled$/i.test(eta)) return 'Not scheduled yet';
  return 'Expected ' + eta;
}

// Anything Date can read sorts by date; the vaguer entries ("Early 2027",
// "Not scheduled") fall to the bottom, keeping the order they're written in.
function byEta(a, b) {
  const ta = Date.parse(a.eta), tb = Date.parse(b.eta);
  if (isNaN(ta) && isNaN(tb)) return 0;
  if (isNaN(ta)) return 1;
  if (isNaN(tb)) return -1;
  return ta - tb;
}

function renderRoadmap() {
  const upcomingList = document.getElementById('roadmap-upcoming');
  const doneList = document.getElementById('roadmap-done');
  const summary = document.getElementById('roadmap-summary');
  if (!upcomingList || !doneList) return;

  const features = window.RoadmapData || [];
  const upcoming = features.filter(f => !f.done).sort(byEta);
  const done = features
    .filter(f => f.done)
    .sort((a, b) => (b.completed || '').localeCompare(a.completed || ''));

  upcoming.forEach(f => upcomingList.appendChild(roadmapItem(f)));
  done.forEach(f => doneList.appendChild(roadmapItem(f)));

  if (summary) {
    summary.textContent = `${done.length} built so far, ${upcoming.length} on the way.`;
  }

  // Only hide a section when it's genuinely empty, so the page still reads
  // properly on the day everything is either shipped or still to come.
  document.getElementById('roadmap-upcoming-section')
    ?.classList.toggle('hidden', upcoming.length === 0);
  document.getElementById('roadmap-done-section')
    ?.classList.toggle('hidden', done.length === 0);
}

document.addEventListener('DOMContentLoaded', renderRoadmap);
