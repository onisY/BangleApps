# 5wCal

A compact five-week calendar for Bangle.js 2.

## Display

- Black background with the normal Bangle.js widget area at the top.
- The year/month of the first displayed day is shown in the free space of the top widget row.
- Monday to Sunday are shown across the screen.
- Five weeks (35 days) fill the remaining screen.
- Monday-Friday: black background, white text.
- Saturday: blue background, white text.
- Sunday and Japanese national holidays: red background, white text.
- Today: green background, black text. Today takes priority over weekend/holiday colors.
- Japanese mode uses the built-in drawn weekday kanji, so no additional Japanese font package is required.
- English mode uses M T W T F S S.

## Controls

- Swipe up: move forward by one 5-week page (35 days).
- Swipe down: move backward by one 5-week page (35 days).
- Single tap: return to the initial page containing today.
- Double tap: open 5wCal's own settings screen.
- Side button once: after the 1-second double-press window, open the Bangle.js system Settings app.
- Side button twice within 1 second: exit to the clock.
- By default, 30 seconds without interaction exits to the clock.

## Settings

Double-tap the calendar screen to open 5wCal settings.

- Language: Japanese / English.
- Auto exit: 15 to 120 seconds.

Settings are stored in `fivewcal.json`.

## Holidays

Japanese national holidays are calculated in the app, including substitute holidays, Citizens' Holidays, equinox days for modern years, and the special 2019-2021 holiday changes.

## Notes

The app is intended for Bangle.js 2 (176 x 176).
