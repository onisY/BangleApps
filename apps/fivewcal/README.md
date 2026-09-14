# 5wCal

A compact five-week calendar for Bangle.js 2.

## Display

- Black background with the normal Bangle.js widget area at the top.
- The year/month of the first displayed day is shown in the free space of the top widget row.
- Monday to Sunday are shown across the screen.
- Five weeks (35 days) fill the remaining screen.
- Monday-Friday: black background, white text.
- Saturday: blue background, white text.
- Sunday and the selected holiday calendar's holidays: red background, white text.
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
- UK holidays: England/Wales / Scotland.
- Auto exit: 15 to 120 seconds.

City names are not displayed. London and Salisbury use the England/Wales calendar; Edinburgh uses the Scotland calendar.

Settings are stored in `fivewcal.json`.

## Holidays

- Japanese mode: Japanese national holidays, including substitute holidays, Citizens' Holidays, equinox days for modern years, and the special 2019-2021 holiday changes.
- English mode, England/Wales: New Year's Day and substitute day, Good Friday, Easter Monday, Early May bank holiday, Spring bank holiday, Summer bank holiday, Christmas Day, Boxing Day and substitute days, plus selected recent one-off bank holidays.
- English mode, Scotland: New Year's Day, 2 January and substitute days, Good Friday, Early May bank holiday, Spring bank holiday, the first-Monday August summer bank holiday, St Andrew's Day and substitute day, Christmas Day and Boxing Day with substitute days, plus selected recent one-off bank holidays. The 15 June 2026 Scotland World Cup bank holiday is included.

## Notes

The app is intended for Bangle.js 2 (176 x 176).
