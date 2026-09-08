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


## Version 0.09 controls and defaults

- Double-tap the right edge to move the displayed scene forward by one day.
- Double-tap the left edge to move the displayed scene backward by one day.
- Single edge tap remains one hour; holding an edge still scrubs continuously by one hour at a time.
- New-install defaults are Sun 6 px, Earth 30 px, Moon 9 px.
- A red local-zenith line now extends outward from the observer point, with length about twice the point-to-Moon-orbit gap.


## Version 0.10 rendering optimization

- The observer zenith line is now green, starts exactly at the red observer point, and extends outward from Earth.
- The zenith line is drawn at about twice the previous thickness.
- Earth day/night rendering no longer paints individual pixels. It uses horizontal scanlines, reducing JavaScript drawing-loop work from O(radius^2) pixel operations to O(radius) line operations.
- Moon illumination uses the same scanline method.
- Lunar-eclipse penumbra/umbra are rendered with circle/scanline intersections instead of per-pixel distance tests.
- These changes are intended to substantially improve redraw speed, especially with a large Earth setting.


## Version 0.11 rendering optimization

- The observer zenith line is green, 2 px thick, starts exactly at the red observer point, and extends outward away from Earth's centre.
- Earth and Moon illuminated halves use scanline fills instead of per-pixel double loops.
- Lunar-eclipse shadow intersections use scanline spans instead of testing every Moon pixel.
- Sun and Moon astronomical positions are calculated once per frame and reused by all drawing stages.
- These changes substantially reduce full-frame redraw work, especially while holding an edge to scrub time.


## Version 0.12 sunlight and interaction mode

- Moon illumination now uses parallel sunlight at Earth-Moon scale. The illuminated half no longer points toward the Moon's rendered screen position of the Sun; instead the same incoming solar-ray direction is used for Earth and Moon, approximating the Sun as effectively infinitely distant.
- Raising the wrist (`faceUp`) enters interaction mode: the watch unlocks touch input and turns the backlight on.
- Any touch/drag interaction refreshes an 8-second inactivity timer.
- After 8 seconds without interaction, Orbit returns to the real current time, clears event/manual time offsets, turns the backlight off, locks touch input, and resumes low-duty clock mode.
- In idle clock mode, the full scene redraws only on 5-minute boundaries.


## Version 0.13 input reliability and Tokyo locations

- Edge single-tap is now deferred for 420 ms so a second swift tap can be recognized as a true double-tap before the one-hour action is committed.
- Edge double-tap moves exactly one day.
- Long press uses the Bangle.js 2 touch `type=2` classification directly, rather than inferring a hold from a timer.
- Continuous hour scrubbing is slowed to 700 ms per step and stops on the drag-release event (`b=0`).
- A 30-second safety cutoff prevents runaway scrubbing if a release event is ever lost.
- Tokyo locations are now Chiyoda-ku, Machida-shi and Okutama-machi.
- Battery text is shown visually as `•85` rather than `B85%`.


## Version 0.14 Moon visibility line

- Orbit computes the Moon's topocentric horizon altitude from the selected location, current/displayed time, and the Moon's equatorial coordinates.
- When the Moon is above the local horizon (altitude > 0 degrees), a white line is drawn from the observer's red point to the Moon centre.
- When the Moon is below the horizon, that white line is not drawn.


## Version 0.15 Moon horizon geometry and slider removal

- The event slider has been removed.
- The freed lower-screen area is reused for a larger orbital diagram.
- Earth size can now be increased to 48 px radius.
- Moon visibility is now topocentric: lunar parallax is calculated from the selected latitude/longitude, Moon distance, Earth ellipsoid and observer elevation.
- The observer elevation is entered as `Elevation m` in Orbit settings and is included both in observer position and geometric horizon dip.
- Moon visibility uses the lunar upper limb, so a partially risen Moon counts as geometrically visible.
- Daylight is not a visibility veto: if the Moon is geometrically above the local horizon in daytime, the white observer-to-Moon line is drawn.
- Atmospheric refraction, local mountains/buildings and weather are not included.


## Version 0.16 automatic and manual location modes

Orbit settings now provide two location modes:

- **Place**: choose a prefecture and place. Orbit automatically stores that place's latitude, longitude and elevation together.
- **Manual**: directly edit latitude, longitude and elevation without using the place list.

The offline place table now contains latitude, longitude and DEM elevation for all 141 stored Japanese locations. The watch does not need network access to use these values.

Tokyo entries are:

- Chiyoda-ku: 35.694 N, 139.754 E, 16 m
- Machida-shi: 35.547 N, 139.439 E, 83 m
- Okutama-machi: 35.809 N, 139.096 E, 337 m

Manual mode stores the final selected values in `orbit.json` as `Manual / Custom`, and the Moon-horizon calculation uses those manual values exactly.


## Version 0.17 Moon sight-line fix

- Moon visibility remains purely geometric: observer elevation, lunar parallax, lunar upper limb and geometric horizon dip are included; daylight is not a veto.
- Atmospheric refraction is intentionally not used in the visibility decision.
- The white observer-to-Moon line is now drawn after the Moon, not before it.
- The white line is 2 px thick and the red observer marker is redrawn on top, making the line visible even when it overlaps the green zenith line.


## Version 0.18 display fixes from device photo

- Moon visibility uses a simpler, numerically stable geometric parallax correction suitable for Espruino.
- The **Moon sight line** is drawn only when the Moon's upper limb is geometrically above the observer horizon.
- The **observer horizon** is now bright magenta, 3 px thick, and extended well beyond the Earth so it is clearly visible.
- The place labels are moved to the actual lower-right edge.
- Battery percentage is sampled at most once every 10 minutes in idle mode and reused during time scrubbing, preventing 3-5% apparent jumps caused by repeatedly sampling battery voltage under changing display/CPU load.
