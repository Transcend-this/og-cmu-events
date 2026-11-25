// Nightly refresh: reads Oak Grove's EventLink calendar and Central Methodist's cheer/STUNT calendar feeds,
// and writes data/events.json for the app. Run with Node 20+: `node scripts/refresh.js`.
// Safety: if a source fails or returns nothing, that source's events from the previous file are kept.
const fs = require('fs'), path = require('path');

const OG_BASE = 'https://websites.eventlink.com';
const OG_EVENTS = OG_BASE + '/s/oak-grove-high-school/Events';
const CMU_CHEER_NEWS = 'https://cmueagles.prestosports.com/sports/cheer/headlines-featured';
const UA = 'Mozilla/5.0 (compatible; PanthersEaglesBot/2.0; +https://github.com/transcend-this/og-cmu-events)';
const DAYS_AHEAD = 45, MAX_PAGES = 15;
const OUT = path.join(__dirname, '..', 'data', 'events.json');

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const decode = s => String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');

// ---------- Oak Grove (EventLink HTML table) ----------
function parseOgDate(s) { // "Tue, Nov. 24 2026" -> "2026-11-24"
  const m = /([A-Za-z]{3,4})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s); if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()]; return mo ? `${m[3]}-${pad(mo)}-${pad(m[2])}` : null;
}
function parseOgTime(s) { // "4:30 PM CST" -> "16:30"; "All Day" -> "all"; "TBD" -> ""
  if (/all\s*day/i.test(s)) return 'all';
  const m = /(\d{1,2}):(\d{2})\s*([AP])M/i.exec(s); if (!m) return '';
  let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; return `${pad(h)}:${m[2]}`;
}
const DISPLAY = { 'central office': 'District', 'oak grove high school': 'High school', 'color gaurd': 'Color guard', 'color guard': 'Color guard',
  'choir-high school': 'Choir · High school', 'choir-middle school': 'Choir · Middle school', 'elementary event': 'Elementary', 'no school': 'District', 'early release': 'District' };
function teamFromLabel(label, title = '') { // "Basketball (G-V)" -> {team, level, cat}; title helps with generic labels
  const L = label.trim(), low = L.toLowerCase(), both = (low + ' ' + title.toLowerCase());
  let cat = 'sports';
  if (/cheer/.test(low)) cat = 'cheer';
  else if (/band|choir|music|orchestra|guard|gaurd|theat|drama|concert|art show|performing/.test(both)) cat = 'arts';
  else if (/scholar|speech|debate|fbla|deca|\bffa\b|academic|robotics|science olympiad|quiz|honor society|awards banquet/.test(both)) cat = 'academic';
  else if (/no school|elementary|pto|board|district|central office|early release|conference|graduation|enrollment|picture|d\.?a\.?r\.?e/.test(both)) cat = 'school';
  else if (/^oak grove high school$/.test(low)) cat = 'school';
  let level = 'hs';
  const levelText = cat === 'sports' || cat === 'cheer' ? low : both;
  if (/\bms\b|middle|7th|8th|6th/.test(levelText)) level = 'ms';
  if (/elementary|special olympics|no school|pto|district|central office|board|early release/.test(levelText)) level = 'other';
  if (DISPLAY[low]) return { team: DISPLAY[low], level, cat };
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(L);
  if (!m) return { team: L, level, cat };
  const sport = m[1].trim(), t = m[2].replace(/-/g, ' ').trim();
  const words = [];
  if (/\b(g|girls)\b/i.test(t)) words.push('Girls'); else if (/\b(b|boys)\b/i.test(t)) words.push('Boys'); else if (/coed/i.test(t)) words.push('Coed');
  if (/7th\s*\/\s*8th/i.test(t)) words.push('7th/8th');
  else if (/\bjv\b/i.test(t)) words.push('JV');
  else if (/c\s*team/i.test(t)) words.push('C team');
  else if (/\bms\b/i.test(t)) words.push('middle school');
  else if (/\bv\b|varsity/i.test(t)) words.push('varsity');
  const team = words.length ? `${sport} · ${words.join(' ')}` : L;
  return { team: team.replace(/^Cheerleading/, 'Cheer'), level, cat };
}
function cleanLocation(s) { // "Elementary Cafeteria (Elementary Cafeteria)" -> "Elementary Cafeteria"
  const t = decode(s); const m = /^(.*?)\s*\((.*)\)$/.exec(t);
  if (m && m[1].toLowerCase() === m[2].toLowerCase()) return m[1];
  if (t && t === t.toUpperCase() && /[A-Z]{3}/.test(t)) return t.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  return t;
}
function parseOgPage(html) {
  const out = [];
  const body = (/<tbody>([\s\S]*?)<\/tbody>/.exec(html) || [])[1] || '';
  for (const row of body.split(/<tr[\s>]/).slice(1)) {
    const cells = row.split(/<td[\s>]/).slice(1);
    if (cells.length < 4) continue;
    const label = decode((/<h4[^>]*>([\s\S]*?)<\/h4>/.exec(cells[0]) || [])[1]);
    const ps = [...cells[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(x => x[1]);
    const first = ps[0] || '', extra = decode(ps[1] || '');
    const ha = /title="Away Game"/.test(first) ? 'A' : /title="Home Game"/.test(first) ? 'H' : '';
    const name = decode(first.replace(/<span[\s\S]*?<\/span>/g, ''));
    const dps = [...cells[2].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(x => decode(x[1]));
    const date = parseOgDate(dps[0] || ''); if (!date) continue;
    const time = parseOgTime(dps[1] || '');
    const loc = cleanLocation((/<p[^>]*>([\s\S]*?)<\/p>/.exec(cells[3]) || [])[1]);
    const href = (/href="([^"]*\/Event\/[^"]*)"/.exec(row) || [])[1];
    const { team, level, cat } = teamFromLabel(label || 'Event', name + ' ' + extra);
    let title = ha === 'A' ? `at ${name}` : ha === 'H' ? `vs ${name}` : name;
    if (extra) title += ` (${extra.toLowerCase()})`;
    out.push([date, time, title, cat, level, team, ha, loc, 'og', href ? OG_BASE + href : OG_EVENTS]);
  }
  const next = /aria-label="Next"[^>]*href="[^"]*pageNumber=(\d+)"/i.exec(html) || /href="[^"]*pageNumber=(\d+)"[^>]*aria-label="Next"/i.exec(html);
  return { events: out, nextPage: next ? +next[1] : null };
}
function mergeDuplicates(rows) { // same date/time/team/title at two places -> one row naming both
  const map = new Map();
  for (const r of rows) {
    const k = [r[0], r[1], r[5], r[2]].join('|');
    if (!map.has(k)) { map.set(k, r.slice()); continue; }
    const kept = map.get(k);
    if (r[7] && kept[7] && r[7] !== kept[7] && !kept[7].includes(r[7])) kept[7] = `${kept[7]} (also listed at ${r[7]})`;
  }
  return [...map.values()];
}

// ---------- Central Methodist (PrestoSports iCal feeds) ----------
function seasonFor(d) { const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1; return m >= 7 ? `${y}-${pad((y + 1) % 100)}` : `${y - 1}-${pad(y % 100)}`; }
function utcToCentral(y, mo, d, h, mi) {
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(dt);
  const g = t => p.find(x => x.type === t).value;
  return [`${g('year')}-${g('month')}-${g('day')}`, `${g('hour')}:${g('minute')}`];
}
function parseIcs(text, teamName, link) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out = [];
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const get = k => { const m = new RegExp('^' + k + '(;[^:]*)?:(.*)$', 'm').exec(block); return m ? { params: m[1] || '', value: m[2].trim() } : null; };
    const un = s => (s || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
    const ds = get('DTSTART'); if (!ds) continue;
    let date, time;
    const v = ds.value;
    if (/VALUE=DATE/.test(ds.params) || /^\d{8}$/.test(v)) { date = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`; time = 'all'; }
    else {
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(v); if (!m) continue;
      if (v.endsWith('Z')) [date, time] = utcToCentral(+m[1], +m[2], +m[3], +m[4], +m[5]);
      else { date = `${m[1]}-${m[2]}-${m[3]}`; time = `${m[4]}:${m[5]}`; }
    }
    let summary = un((get('SUMMARY') || {}).value).replace(/^\((cheerleading|stunt|cheer)\)\s*/i, '');
    const desc = un((get('DESCRIPTION') || {}).value);
    let loc = un((get('LOCATION') || {}).value);
    if (!loc) { const i = desc.indexOf(summary); if (i >= 0) loc = desc.slice(i + summary.length).replace(/^[,\s]+/, '').trim(); }
    let ha = '';
    if (/^at\s/i.test(summary)) ha = 'A'; else if (/^vs\.?\s/i.test(summary)) ha = 'H';
    out.push([date, time, summary, 'cheer', 'college', teamName, ha, loc, 'cmu', link]);
  }
  return out;
}

// ---------- fetching ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
function centralToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); }

async function fetchOg(today) {
  const limit = new Date(today + 'T12:00:00Z'); limit.setUTCDate(limit.getUTCDate() + DAYS_AHEAD);
  const until = limit.toISOString().slice(0, 10);
  let page = 1, all = [];
  while (page && page <= MAX_PAGES) {
    const html = await get(page === 1 ? OG_EVENTS : `${OG_EVENTS}?pageNumber=${page}`);
    const { events, nextPage } = parseOgPage(html);
    all = all.concat(events);
    if (!events.length || events.some(e => e[0] > until) || !nextPage || nextPage <= page) break;
    page = nextPage; await sleep(1200);
  }
  return mergeDuplicates(all.filter(e => e[0] <= until));
}
async function fetchCmu(now) {
  const season = seasonFor(now), out = [];
  const feeds = [['cheer', 'CMU Competitive Cheer'], ['stunt', 'CMU STUNT']];
  let ok = 0;
  for (const [sport, team] of feeds) {
    const page = `https://cmueagles.com/sports/${sport}/${season}/schedule`;
    try {
      const text = await get(`${page}?print=ical`);
      if (!/BEGIN:VCALENDAR/.test(text)) continue;
      ok++; out.push(...parseIcs(text, team, sport === 'cheer' ? CMU_CHEER_NEWS : page));
    } catch (e) { console.log('CMU feed skipped:', e.message); }
    await sleep(800);
  }
  return { ok: ok > 0, events: out, season };
}

async function main() {
  const now = new Date(), today = centralToday();
  let prev = { events: [] };
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  const prevBy = src => (prev.events || []).filter(e => e[8] === src);

  let og = [], ogOk = false;
  try { og = await fetchOg(today); ogOk = og.length > 0; } catch (e) { console.log('Oak Grove failed:', e.message); }
  if (!ogOk) { og = prevBy('og'); console.log('Keeping previous Oak Grove events:', og.length); }

  let cmu = { ok: false, events: [] };
  try { cmu = await fetchCmu(now); } catch (e) { console.log('CMU failed:', e.message); }
  let cmuEvents = cmu.ok ? cmu.events : prevBy('cmu');

  const events = [...og, ...cmuEvents].sort((a, b) => a[0].localeCompare(b[0]) || (a[1] || '99').localeCompare(b[1] || '99'));
  const ogDates = og.map(e => e[0]).sort();
  const data = {
    generated: now.toISOString(),
    through: ogDates[ogDates.length - 1] || null,
    sources: { og: { ok: ogOk, count: og.length }, cmu: { ok: cmu.ok, count: cmuEvents.length, season: cmu.season || null } },
    events
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const same = JSON.stringify(prev.events) === JSON.stringify(events);
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log(`Oak Grove: ${og.length} (${ogOk ? 'fresh' : 'kept'}), CMU: ${cmuEvents.length} (${cmu.ok ? 'fresh' : 'kept'}), through ${data.through}${same ? ', no changes' : ''}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { parseOgPage, parseOgDate, parseOgTime, teamFromLabel, cleanLocation, parseIcs, mergeDuplicates, seasonFor };
