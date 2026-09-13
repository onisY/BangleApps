# 5wCal

A compact five-week calendar for Bangle.js 2.

## Display

- Black background with the normal Bangle.js widget area at the top.
- The year/month of the first displayed day is centered in the top area.
- Monday to Sunday are shown across the screen.
- Five weeks (35 days) fill the remaining screen.
- Monday-Friday: black background, white text.
- Saturday: blue background, white text.
- Sunday and Japanese national holidays: red background, white text.
- Today: green background, black text. Today takes priority over weekend/holiday colors.

## Controls

- Swipe up: move forward by one 5-week page (35 days).
- Swipe down: move backward by one 5-week page (35 days).
- Tap: return to the initial page containing today.
- Side button once: after the 1-second double-press window, open settings.
- Side button twice within 1 second: exit to the clock.
- By default, 30 seconds without interaction exits to the clock.

## Settings

The in-app settings screen allows the automatic exit delay to be changed from 15 to 120 seconds.

## Holidays

Japanese national holidays are calculated in the app, including substitute holidays, Citizens' Holidays, equinox days for modern years, and the special 2019-2021 holiday changes.

## Notes

The app is intended for Bangle.js 2 (176 x 176). The weekday kanji are drawn directly by the app so no additional Japanese font package is required.
