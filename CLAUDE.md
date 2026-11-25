# Panthers & Eagles: rules for making updates

A one-page app that combines Oak Grove (Mo.) R-VI district activities with Central Methodist University cheer and STUNT. People use it to decide where to drive, so wrong dates matter more than missing ones.

## What is where
- `index.html`: the whole app. Event data is the `RAW` array near the top of the script; each row is `[date, time, title, category, level, team, H/A, location, source, url?]`.
  - time: `HH:MM` (24-hour, Central time), `'all'` for all day, `''` for TBD.
  - category: `sports | cheer | arts | academic | school`; level: `hs | ms | college | other`; source: `og | cmu`.
- `tests/run_tests.js`: runs the page's built-in tests.
- `CHANGELOG.md`: one entry per release, newest first.

## Data rules
- Copy events only from the official sources: Oak Grove's EventLink calendar (https://websites.eventlink.com/s/oak-grove-high-school/Events) and Central Methodist Athletics (cmueagles.com / cmueagles.prestosports.com). Never guess a date, time or opponent.
- When refreshing, update `SNAPSHOT` (when the data was copied) and `SNAP_THROUGH` (last date covered).
- If the same event is listed twice with different places, keep one row and name both places.
- Keep past CMU results only while CMU has no upcoming dates; once the new season is posted, list its dates.

## Every release
1. Make the change in `index.html`.
2. Bump `APP_VERSION` (1.1, 1.2 … for data refreshes and features; 2.0 for automatic refresh).
3. Add a CHANGELOG.md entry in plain language.
4. Run `cd tests && npm install && node run_tests.js`. It must end with ALL PASSED. Do not push if it fails.
5. Commit as `Panthers & Eagles 1.x: <summary>` and push to `main`. GitHub Pages updates in 1 to 2 minutes.

## To undo a bad release
`git revert <commit>` and push.
