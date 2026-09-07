# Orbit 0.02

Orbit is now a Bangle.js 2 **clock** and does not use GPS.

## Layout

- Sun is fixed in the upper-right.
- Earth is fixed in the lower-left.
- Moon revolves around Earth according to the current lunar elongation.
- The top line shows date/time and battery percentage.
- A white Earth-Sun center line is the solar-noon reference.
- Yellow/orange rays from Earth show the sunrise/sunset meridians for the selected Japanese location and current solar declination.
- Earth remains light blue; the selected location is a red dot and its projected local horizon is purple.
- The Moon keeps the gold Sun-facing hemisphere and black far side. Lunar-eclipse shadowing is retained.
- The bottom slider selects lunar events up to one year ahead; the far-left position returns to NOW.

## Location

Orbit 0.02 contains an offline Japan location table. There is no GPS access and no network access.

Open **Settings -> App/Widget Settings -> Orbit** and choose:

1. Prefecture
2. Place

All 47 prefectures are included with at least three places each. Place names are written in Roman letters because the standard Bangle.js system font does not contain a full Japanese kanji font.

Default location: Tokyo / Tokyo.

## Startup change

Version 0.01 refined roughly one year of lunar phase events with repeated trigonometric calculations before the first screen draw. On Bangle.js 2 this could leave the launcher showing `Loading...` for a long time. Version 0.02 draws immediately and builds the event list with a lightweight mean-synodic calculation. Exact eclipse maxima remain stored explicitly for the relevant catalog events.

## Clock updating

- The current clock header refreshes each minute.
- Solar/lunar geometry is refreshed on five-minute boundaries.
- When the LCD is off, update timers are suspended and the screen is redrawn when it wakes.
