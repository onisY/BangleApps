# Orbit

**Orbit** is a Bangle.js 2 Sun-Earth-Moon orrery that redraws on 5-minute boundaries.
It is designed as a readable orbital diagram rather than a physically scaled solar-system view.

## Display

- Top: local date/time and battery percentage.
- Main view: the Sun in the centre, Earth's orbit, Earth, and an enlarged Moon orbit, viewed schematically from above Earth's north side.
- Sun: red disk with a small flare corona.
- Earth: light-blue disk. Your latitude/longitude is shown as a red point.
- Purple line: a schematic projected local-horizon line through the position marker.
- Moon: the hemisphere facing the Sun is gold; the far hemisphere is black with a gold outline.
- During lunar-eclipse alignment, Earth's umbral shadow progressively blacks out the lit part. Penumbral shading is shown more softly/dark-brown.
- Bottom: event slider.

The orbital radii and body sizes are deliberately not to scale, so the geometry remains visible on the 176 x 176 display.

## Event slider

Drag or tap the bottom slider:

- Far left (`0`) = **NOW**. Date/time and positions update every 5 minutes.
- Moving right selects lunar events from now through one year ahead.
- The header is inverted (black text on white) whenever an event is selected.
- New Moon, First Quarter, Full Moon, and Last Quarter are calculated on the watch.
- Solar/lunar eclipse maxima for 2026-2030 use NASA catalog UTC times and are converted to the watch's local time.
- Mid-Autumn Moon dates use the National Astronomical Observatory of Japan calendar. Since Mid-Autumn Moon is a cultural date rather than one exact astronomical instant, Orbit uses **20:00 local time** as the representative snapshot.

Eclipse entries are global astronomical events. Orbit does not claim that every listed eclipse is visible from the stored observer location.

## Location and privacy

Settings -> App/Widget Settings -> **Orbit** offers:

- **Auto GPS** (default): uses the Bangle's GPS briefly when Orbit opens, saves the most recent fix locally in `orbit.json`, then powers GPS off. This avoids leaving GPS on continuously.
- **My Location**: reads `mylocation.json` if you use the Bangle.js My Location app.
- **Manual**: use the latitude/longitude entered in Orbit settings.

Orbit does not send the position to a phone, server, or web service.

## Size settings

You can change Sun, Earth, Moon, and observer-marker sizes from the Orbit settings menu. GPS acquisition timeout is also configurable.

## Astronomy model

The normal orbital drawing uses compact low-cost solar/lunar ecliptic approximations suitable for a watch display. Phase-event times are numerically refined from those equations. Eclipse maximum times in the bundled 2026-2030 table are taken from NASA eclipse catalogs; Mid-Autumn dates are from NAOJ.

This is a visualization app, not a navigation or eclipse-safety tool.
