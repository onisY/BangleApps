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
