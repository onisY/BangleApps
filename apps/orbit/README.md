# Orbit 0.03

Orbit is a Bangle.js 2 **clock** and does not use GPS.

## Important boot-safety change

Version 0.02 could still consume unnecessary RAM during boot because the clock itself loaded the complete 47-prefecture/141-place table. Since Orbit can be the automatically loaded clock after a reboot, that was a poor design choice.

Version 0.03 changes this:

- The clock does **not** load `orbitloc` at boot.
- The 141-place table is used only inside the settings screen.
- Selecting a place writes only one selected name, latitude and longitude to `orbit.json`.
- The one-year lunar-event list is not built during boot. It is generated only when the bottom event slider is first touched.
- The normal clock therefore begins by reading one small JSON file and drawing the current Sun/Earth/Moon view.

## Layout

- Sun is fixed in the upper-right.
- Earth is fixed in the lower-left.
- Moon revolves around Earth according to lunar elongation.
- The top line shows date/time and battery percentage.
- The white Earth-Sun center line is the solar-noon reference.
- Yellow/orange rays show sunrise/sunset reference meridians for the selected location.
- The selected location is a red point and its projected local horizon is purple.
- The Moon has a gold Sun-facing hemisphere, black far side and eclipse shadowing.
- The bottom slider selects lunar events up to one year ahead. Far left returns to NOW.

## Location

Open **Settings -> App/Widget Settings -> Orbit** and choose Prefecture and Place.

All 47 prefectures have three stored places, for 141 offline locations. Roman lettering is used because the standard Bangle.js font does not provide a full Japanese kanji set.

Default location: Tokyo / Tokyo.

## Updating

- Time/battery header: every minute.
- Sun/Earth/Moon geometry: every five minutes.
- LCD off: timers are suspended.

## Version 0.06 display changes

- Corrects the observer marker using local apparent solar time, including longitude offset from the JST meridian and equation of time.
- Enlarges the top date/time/battery text to 2x system font and splits it across two rows.
- Raises the event slider for easier finger dragging.
- Earth radius can be set up to 24 px (twice the original 12 px default).
- Moon orbit radius expands automatically with Earth/Moon sizes so the Moon remains outside the Earth with a 10 px gap.


## Version 0.07 controls and layout

- Header is a single-line tall bold bitmap font: Reiwa year (for example R8), month/day, time and battery.
- Tap the left edge to move the displayed scene back by one hour.
- Tap the right edge to move the displayed scene forward by one hour.
- Double-tap the center to return immediately to the current time and clear any event/manual-time offset.
- Prefecture and place are shown as two right-aligned lines at the lower-right.
- Earth size can now be increased up to 40 px radius.
- The Moon orbit expands with Earth and Moon size so it remains outside the Earth.


## Version 0.08 day/night and hold controls

- Earth now uses the same day/night hemisphere style as the Moon: the Sun-facing half is light blue, the far half is black, and the whole Earth keeps a light-blue outline.
- The top header background is green only at the real current time. Any manually shifted time or lunar-event time uses a red background.
- Holding the left edge continuously moves the displayed scene backward one hour at a time and redraws after every step.
- Holding the right edge continuously moves the displayed scene forward one hour at a time and redraws after every step.
- A short edge tap still moves only one hour.
- Releasing the finger stops the continuous time movement.
