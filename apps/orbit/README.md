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


## Version 0.19 horizon and Moon sight-line correction

- The **observer horizon** is reduced to a 1 px line and shortened to only slightly longer than the Earth diameter.
- The **Moon sight line** visibility test now uses an independent compact SunCalc-style lunar position calculation plus horizontal-parallax correction.
- This independent path is deliberately separated from the schematic Moon-orbit drawing model, so a drawing-model error cannot suppress the visibility line.


## Version 0.20 Moon display simplification

- The **Moon sight line** has been removed completely.
- Moon visibility / above-horizon calculations are no longer performed by the clock.
- The Moon is now clipped to the hemisphere facing Earth: the hemisphere on the far side from Earth is not drawn.
- Solar illumination and lunar-eclipse shading are still calculated before the Earth-facing clipping is applied.


## Version 0.21 Moon far-side outline removal

- The Earth-far hemisphere of the Moon is now removed completely, including its outer rim.
- Only the outer semicircular rim of the Earth-facing hemisphere is drawn.


## Version 0.22 Moon near-side rendering

- The Earth-far hemisphere of the Moon is erased completely, and no far-side rim or semicircular outline is redrawn afterward.
- Only the Earth-facing hemisphere remains visible.
- On the Earth-facing hemisphere:
  - directly illuminated area is gold;
  - area without direct sunlight is deep blue.
- Lunar-eclipse shadow processing is retained on the visible Earth-facing hemisphere.


## Version 0.23 swipe screenshots

- Swipe anywhere on the Orbit clock to save the current screen as a BMP.
- Screenshots are stored as `orb00.bmp` through `orb19.bmp`.
- Storage is circular: after 20 images, the oldest slot is overwritten.
- A short vibration confirms a successful save; no on-screen message is drawn into the screenshot.
- Orbit settings now show the saved screenshot count and provide **Delete shots** to erase all screenshot BMP files.
- On a computer, connect the watch in Espruino Web IDE and use the Storage view to save the `orbNN.bmp` files to disk.


## Version 0.24 header, Moon size and Earth styles

- The top status header no longer shows the Reiwa year prefix. It now uses `MM/DD HH:MM •battery` and spreads the larger bold glyphs almost across the full display width.
- Header background states:
  - input-enabled: yellow with dark text;
  - current time: subdued blue-purple with white text;
  - other state: white with dark text.
- Moon size can now be increased to 18 px radius, approximately twice the original 9 px default.
- Earth display mode can be selected in settings:
  - **Current**: the existing Orbit Earth;
  - **Custom colors**: selectable day, night and rim colors;
  - **N.Hemi map**: simplified north-polar Northern Hemisphere sea/land map with fine reference/country-border lines.
- The Northern Hemisphere map rotates with the same local solar/geographic orientation used for the observer marker.


## Version 0.25 Northern Hemisphere map correction

- Reworked the N.Hemi map coastline data to avoid projection self-crossing around East Asia.
- Major geography is now represented as separate shapes for North America, Greenland, Eurasia, Japan and Great Britain.
- Japan is placed off the east coast of Eurasia instead of at the western edge of the continent.
- Removed fine internal country-border lines.
- Added a simple white Arctic sea-ice cap and a North Pole marker at the map center.
- Retained the existing sea/land color scheme and day/night shading.


## Version 0.26 Northern Hemisphere east-west fix

- Corrected the handedness of the north-polar longitude projection. East and west were mirrored because screen Y increases downward.
- Japan now uses separate Kyushu, Honshu/Shikoku and Hokkaido shapes on the east side of Eurasia.
- Added a distinct Scandinavian Peninsula outline.
- Enlarged and reshaped Greenland so it remains recognizable on the 176x176 display.
- Great Britain remains a separate island west of continental Europe.
- Fine internal country borders remain omitted.


## Version 0.27 physical rotation and North/South views

- Corrected the physical rotation directions in the polar/orbital schematic.
  - North-side view: Earth rotates counterclockwise as time advances.
  - North-side view: the Moon also orbits counterclockwise.
  - South-side view: both apparent directions reverse, as expected from the opposite side.
- Sunrise and sunset reference directions now follow the same view handedness.
- Map longitude is used directly, so east-west angular separation corresponds to local solar-time difference at 15 degrees per hour.
  - Tokyo/UK longitudes differ by roughly 140 degrees, about 9.3 hours of local solar time.
  - Contiguous North-American west/east coasts are roughly 57 degrees apart, about 3.8 hours of local solar time.
- Added **View side: North / South** in Orbit settings.
- The map mode is now **N/S Hemi map**:
  - North view shows North America, Greenland, Eurasia, Scandinavia, Japan, Great Britain and the Arctic.
  - South view shows South America, southern Africa, Australia, Madagascar, New Zealand and an Antarctic polar cap.


## Version 0.28 daily buzzes and coastline refinement

- Added a 7-second vibration at four daily events:
  - 00:00 local civil time;
  - local sunrise;
  - 12:00 local civil noon;
  - local sunset.
- Sunrise and sunset are calculated from the configured observer latitude/longitude using the standard apparent solar altitude of -0.833 degrees.
- The next event only is scheduled at a time, so the feature does not require frequent polling.
- Northern Hemisphere coastlines were refined:
  - Florida peninsula is more recognizable;
  - Mexico includes Baja/Yucatan character;
  - Iberian and Italian peninsulas and Mediterranean coastline are represented;
  - the East Asian mainland coast leaves a clearer Japan Sea gap;
  - Ogasawara and Hawaiian islands are drawn as tiny one-pixel references.


## Version 0.29 runtime size optimization

Orbit keeps the readable development sources (`app.js`, `settings.js`) in the repository, while App Loader now installs minified runtime files (`app.min.js`, `settings.min.js`).

Static files installed to the watch:

| File | Before | v0.29 runtime |
| --- | ---: | ---: |
| orbit.app.js | 28,321 B | 19,306 B |
| orbit.settings.js | 5,455 B | 4,364 B |
| orbitloc | 4,818 B | 4,818 B |
| orbit.img source payload | 397 B | 397 B |
| **Total** | **38,991 B** | **28,885 B** |

Reduction: **10,106 bytes (25.9%)** overall. The main clock runtime alone is reduced by about **31.8%** from the pre-optimization source used by v0.28.

The optimization removes unused legacy code and strips comments, indentation, line breaks and unnecessary whitespace from the installed copies. Functional logic, map coordinates, astronomical calculations, interactions, daily buzz scheduling, screenshots and settings are unchanged.

Dynamic user data such as `orbit.json`, screenshot BMP files and screenshot state are not included in the static program-size comparison.


## Version 0.30 BLE reset helper

- Added **BLE reset** to Orbit settings for development use.
- The action disconnects the current BLE link and restarts the BLE stack.
- Pairing/bond information is intentionally kept; it does **not** call `NRF.eraseBonds()`.
- A confirmation prompt is shown before reset, followed by a short buzz after restart.
- Intended workflow when WebBLE/App Loader loses the usable communication endpoint:
  1. Orbit settings -> **BLE reset**
  2. wait briefly
  3. reconnect from WebBLE/App Loader
- Both readable `settings.js` and installed minified `settings.min.js` are updated.


## Version 0.31 side-button BLE reset

- While Orbit is running, double-click the Bangle.js 2 side button within 450 ms to reset BLE.
- BLE reset disconnects the current link and restarts the BLE stack while keeping bond/pairing information.
- A single side-button click still opens the launcher after the 450 ms double-click window.
- The previous **BLE reset** item was removed from Orbit settings.
- The implementation is isolated in the readable source between `BEGIN ORBIT BLE DOUBLE CLICK` and `END ORBIT BLE DOUBLE CLICK`, so it can be removed later as one block.
- Orbit uses `Bangle.setUI({mode:"custom",clock:1,...})`, preserving clock behavior while overriding the button handler.


## Version 0.32 robust side-button BLE double-click

- Side-button detection is now release-based rather than press-based.
- The first button press is swallowed so Orbit cannot immediately leave the clock before a second click is detected.
- After the first release, Orbit waits 1.0 second:
  - a second release during the window performs BLE reset;
  - if no second release arrives, Orbit opens the launcher.
- BLE reset still keeps pairing/bond information.


## Version 0.33 raw BTN1 double-click handler

- Removed button handling from Bangle clock/custom UI entirely.
- Orbit now calls `Bangle.setUI({mode:"custom",remove:cleanup})` with no button handler and installs a raw `setWatch(..., BTN1, ...)` afterward.
- This prevents the normal clock button-to-launcher behavior from pre-empting the second click.
- First button event starts a 1 second double-click window.
- Second event inside the window resets BLE; otherwise the launcher opens after the window expires.
- The raw watch is removed in Orbit's cleanup handler.
