# Coordinated Cooking

Plan a synchronised finish for every dish.

**[Try it →](https://cooking-times.pages.dev)**

Cooking a meal of several dishes means starting each one at a different time so
they are all ready together. Doing that arithmetic in your head, while cooking,
is how the potatoes end up cold. This does the arithmetic and then tells you
when to act.

## What it does

**Plan.** Pick your dishes and how you want each cooked. The app works out when
each one has to go on so everything lands at the same moment, and shows you the
running order.

**Cook.** Start the timer and it tells you what to do and when — put the chicken
on, take the steak off to rest, the kale is next. It beeps, raises a
notification, and keeps the screen awake while you cook.

Along the way it handles the things that make a real meal awkward:

- **Resting.** A steak comes off the heat before it's ready to eat. The app puts
  it on early enough that it finishes resting exactly when everything else is
  ready, and tells you twice — once to put it on, once to take it off.
- **Serving out of step.** A starter can be ready fifteen minutes before the
  main, or the bread ten minutes after. Set an offset per dish and the rest of
  the plan works around it.
- **Two of the same thing.** A rare steak and a well-done one are two separate
  dishes with their own timings and their own alerts.
- **Your times, not ours.** The built-in times are approximations. If your roast
  chicken takes ninety minutes, say so — the app remembers it for next time.
- **Your foods.** Thirty are built in; add your own and they stick around.
- **A plan you can take with you.** Copy the running order as text or print it,
  optionally with real clock times counted back from when you want to eat:
  *start the chicken at 18:55*.

It works offline, installs to a home screen, and survives a reload mid-cook —
the clock is derived from wall time, so closing the tab doesn't lose your place.

## What it doesn't do

It assumes you can cook everything at once. It has no idea how many rings or
pans you have, and it doesn't budget for the time each start actually costs you.
If the plan says put four things on within a minute of each other, that's on you
to sort out.

It also doesn't know *why* a cooking time is what it is — no model of quantity,
thickness or method. Rather than invent that arithmetic, it lets you correct any
time and remembers the correction.

## Running it locally

No build step and nothing to install to use it. It does need to be served over
HTTP — the pages are ES modules and the food list is fetched, so opening
`index.html` from disk won't work.

```bash
git clone https://github.com/borfast/cooking-times.git
cd cooking-times
python3 -m http.server        # or any static file server
```

Then open <http://localhost:8000>.

## Developing

```bash
npm install     # Biome, the only dependency, and dev-only
npm test        # lint, then run the suite
npm run format  # apply formatting
```

Tests run on Node's built-in runner — no test framework is installed. The
interesting logic lives in `static/js/core/`, which is pure: no DOM, no clock, no
storage. That's what makes it testable without a browser, and it's worth keeping
that way.

See [CLAUDE.md](CLAUDE.md) for the layout, the conventions a formatter can't
enforce, and a few traps that have bitten before.

## How it got here

The app was rebuilt from a specification that was reverse-engineered out of the
existing code, which produced a register of 26 gaps — defects, design limits and
product criticisms. Those were then worked through in phases.

Both documents are in the repository and kept current, including the gaps still
open on purpose:

- [The specification and gaps register](docs/superpowers/specs/2026-07-25-cooking-times-design.md)
- [The remediation roadmap](docs/superpowers/plans/2026-07-26-cooking-times-roadmap.md)
