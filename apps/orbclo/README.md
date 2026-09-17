# Orbclo 0.01

Orbclo is a clean-room rewrite for Bangle.js 2. It does not reuse the previous Orbit or 5wCal runtime code. The design goal is immediate input feedback, bounded RAM use, and a small number of long-lived listeners/timers.

## Main screen

- Sun is fixed at the upper-right and Earth at the lower-left.
- Earth has a day/night hemisphere, optional lightweight polar map outline, observer marker, zenith line and horizon line.
- Sunrise and sunset reference rays are recalculated from latitude, longitude and solar declination.
- Moon position follows a compact synodic-month model and the visible disk shows the lunar phase.
- Header shows `MM/DD HH:MM NN%`.
- Header updates at the next minute boundary; astronomy redraw is aligned to five-minute boundaries.
- Battery is sampled at most every five minutes and shown in red at 20% or below.

## Controls

### Orbclo screen

- Single tap: after the 400 ms single/double decision window, open the integrated five-week calendar.
- Double tap: the second tap is accepted immediately and opens Orbclo settings.
- Swipe: save a screenshot (`oc00.bmp` ... `oc19.bmp`).
- Side button: exit cleanly to the Bangle launcher.

A confirmed screen transition first fills the LCD solid navy, then performs the heavier work. This gives immediate confirmation that the input was accepted.

### Five-week calendar

- Five weeks × seven days are shown.
- Saturday is blue, Sunday/Japanese public holidays are red, and today is green.
- Double tap a date to select it.
- The selected date alternates white/black every 0.5 seconds.
- Single tap returns to Orbclo at the selected date and the current clock time.
- The selected date continues to advance at real-time speed.
- Swipe vertically to move five weeks backward/forward.
- Calendar inactivity return is configurable from 15 to 120 seconds.

If Orbclo is reopened from a selected virtual date, the calendar opens on the matching five-week page with that date still selected. LCD off clears the temporary date selection and returns the next wake to the real current date/time.

## Settings

Double tap the Orbclo screen to open the combined settings menu.

- Location preset: Chiyoda / Machida / Okutama / Manual
- Manual latitude and longitude
- One-shot GPS position acquisition
- North / South view
- Lightweight Earth map on/off
- Sun / Earth / Moon / marker sizes
- Daily solar-event buzz on/off
- Calendar public-holiday coloring on/off
- Calendar automatic return time
- Screenshot count and delete-all

GPS is powered only during an explicit acquisition attempt and is turned off on success, timeout, LCD off, or app exit.

## Solar-event buzzes

When enabled, Orbclo schedules only the next event instead of polling continuously. Events are:

- 00:00 civil time
- 12:00 civil time
- calculated sunrise
- calculated sunset

The configured latitude/longitude are used for sunrise/sunset.

## Performance design

Orbclo 0.01 deliberately avoids the previous wrapper/eval/patch architecture.

- No dynamic `eval` or runtime source rewriting.
- One long-lived touch listener, swipe listener, LCD listener and button watch.
- Screen mode is a single state variable rather than nested app loads.
- Timers are explicitly cancelled when their screen is left.
- Orbit/calendar switching does not append history or register duplicate listeners.
- No Storage writes occur during ordinary screen switching; only settings and deliberate screenshots are written.
- LCD off stops visual timers and clears temporary date state.

## Accuracy note

Orbclo 0.01 uses compact astronomical approximations chosen for watch-scale visualization and low computational cost. It is intended as an informative schematic clock rather than a precision ephemeris.
