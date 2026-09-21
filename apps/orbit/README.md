# orbit

A Bangle.js 2 Sun-Earth-Moon clock with an integrated five-week calendar.

## Controls

- Tap the orbit face to open the integrated calendar.
- In the calendar, double-tap a date to select it. The selected date blinks yellow.
- Single-tap the calendar to return to orbit using the selected date.
- Reopen the calendar and the selected date continues blinking.
- Double-tap outside the date grid to clear the selected date.
- Swipe vertically in the calendar to move by five weeks.
- BTN opens the launcher.

## Settings

Open **Settings > Apps > orbit**. The standard app settings screen controls:

- location mode: Place, Manual, or GPS
- Place: all 47 Japanese prefectural capitals and world national capitals
- Manual: latitude/longitude
- GPS: on-demand fix only while this Settings screen is acquiring; GPS is immediately switched off after a fix, cancel, or leaving Settings
- Sun, Earth, Moon and lunar-orbit sizes
- calendar/holiday region: Japan, England/Wales, Scotland, Northern Ireland
- calendar auto-return timeout
- holiday cache deletion
- anniversaries and exceptional holidays

Calendar display language and holiday region remain coupled: Japan uses Japanese weekday labels; the three UK regions use English labels.

The orbit clock itself never enables GPS. A saved GPS fix is just stored latitude/longitude and costs no GPS power during normal clock use.

## Holidays

Normal statutory holidays are generated into compact yearly 366-bit (46-byte) tables and persisted on demand. The current and following year are warmed automatically; scrolling to another year generates that year's table once.

Exceptional holidays and personal dates are stored separately in `orbit.events.json`. Settings can add, edit and delete ordinary date events. The JSON format also supports ranges.

Example:

```json
{
  "version": 1,
  "events": [
    {
      "date": "10-15",
      "repeat": "yearly",
      "type": "family",
      "label": "Anniversary",
      "region": "all",
      "color": "yellow",
      "blink": true
    },
    {
      "date": "2030-05-02",
      "type": "holiday",
      "label": "Extra holiday",
      "region": "jp",
      "color": "red",
      "blink": false
    }
  ]
}
```

Supported named colors are red, yellow, green, blue, cyan, magenta, orange, white, gray and black.
