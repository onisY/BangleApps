# orbit

A Bangle.js 2 Sun-Earth-Moon clock with an integrated five-week calendar.

## Controls

- Single-tap the orbit face to open the integrated calendar.
- Double-tap the orbit face to open orbit settings.
- In the calendar, double-tap a date to select it. Only the current selected date blinks yellow; changing selection repaints the calendar body first so an older selection cannot remain highlighted.
- Single-tap the calendar to return to orbit using the selected date. The visible yellow selection highlight is cleared before the screen changes to orbit; the selected date itself remains active in Orbit.
- Reopen the calendar and the selected date continues blinking.
- Double-tap outside the date grid to clear the selected date.
- Swipe vertically in the calendar to move by five weeks.
- BTN opens the launcher.

## Settings

Open **Settings > Apps > orbit**, or double-tap the orbit face. The settings menu includes **Exit to orbit** so it can return directly to the clock. The standard app settings screen controls:

- location selection has three explicit entries: **Place name**, **Manual**, and **GPS**
- Place: Japan selects prefecture then municipality; other countries use national capitals, with representative cities added for wide countries using multiple civil-time standards
- Manual: latitude/longitude
- GPS: on-demand fix only while this Settings screen is acquiring; GPS is immediately switched off after a fix, cancel, or leaving Settings
- selectable **View side: North / South** polar viewpoint
- balanced body sizes: Sun 6-15 px, Earth 40-45 px, Moon 14-16 px
- lunar-orbit radius with a dynamic minimum of Earth radius + Moon radius + 4 px, so the displayed value matches the actual drawing
- calendar/holiday region: Japan, England/Wales, Scotland, Northern Ireland
- calendar auto-return timeout
- holiday cache deletion
- anniversaries and exceptional holidays

Calendar display language and holiday region remain coupled: Japan uses Japanese weekday labels; the three UK regions use English labels.

On the orbit face, the bottom-right shows the active location source: Place name shows the saved place name; Manual shows latitude and longitude; GPS shows a small satellite mark plus latitude and longitude.

Location storage is intentionally simple: `manualLat/manualLon` are the single canonical coordinate pair used by the orbit clock. Manual editing changes them directly; GPS overwrites them only after a valid fix; Place selection copies the chosen place coordinates into them. Place tables are loaded only while Place is being edited, and Japan municipality data is read only for the selected prefecture.

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
