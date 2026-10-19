# Motion-rest graph (tenkyu 0.04)

## Definition and settings

The accelerometer measures gravity even when stationary. A sample is quiet when
both the change between acceleration vectors (`diff`) and `abs(mag - 1 g)` are
at most the threshold. Default: **0.03 g**; `Rest graph / Quiet threshold`:
0.01-0.10 g. This measures wrist motion; a stationary unworn watch also qualifies.
Reference: https://www.espruino.com/Reference#l_Bangle_accel .

Quiet must continue for **10 seconds** before rest time begins accumulating.
The initial confirmation time is not backdated. Moving again ends the quiet run.
Time is integrated using sample timestamps, not a fixed number of samples.
Gaps over 2.5 seconds and invalid samples break confirmation and are not counted
as observed time. Native 80 ms / 800 ms sensor power saving is left unchanged.

Every five-minute UTC interval receives a completed level:

| Rest / observed time | Level |
|---|---:|
| 0-20% | 1 |
| >20-40% | 2 |
| >40-60% | 3 |
| >60-80% | 4 |
| >80-100% | 5 |

At least **270 of 300 seconds** must be observed. Otherwise the interval is
missing and has **no bar**. The unfinished current interval is not rated yet.
This also prevents a few seconds after installation from receiving a full-bin
rating. On an app switch the current accumulated totals are saved, but the quiet
run must be confirmed again after loading.

## Display

There are **288 five-minute positions** around the lunar orbit: one complete
turn is **24 hours**, independently of the Moon's 29.53-day movement. Each cyan
bar extends **outward** from the orbit. Its length is `level / 5 * maximum`.
`Rest graph / Level 5 height` sets the maximum from **1 to 14 pixels**, default
**10 pixels**. Rasterization rounds endpoints to whole pixels; very short bars
can coincide with the orbit. A 14-pixel limit fits the existing Moon envelope.

Bars are positioned at each interval's **end time**, using the same 24-hour
orientation as the observer/dial. The newest completed bar starts at the
observer's zenith direction; previous bars follow around the circle. North and
south views reverse direction consistently. A slot is overwritten by the new
value exactly 24 hours after the old slot was completed. Old lines are erased
by the existing full redraw before the current history is drawn.

The Moon, red location dot, green/yellow zenith line, Roman numerals, labels and
widgets are drawn above the bars. Widgets can hide the top of the ring. History
is hidden when the calendar selects a different date; the real-time recorder
continues recording. It is not a simulated future/past rest prediction.

## Lifecycle and power

`orbit.boot.js` installs the recorder for every app session. It listens to the
already-running accelerometer, including with the LCD off and in other apps.
It requests no GPS/heart-rate power and changes no sensor polling settings.
There is no added sampling or drawing timer: per-event work is constant-time
arithmetic; drawing uses the clock's existing five-minute refresh (30 seconds
during an eclipse). A frame reuses the boot service rather than parsing a second
copy of the module. `Enabled: Off` removes the listener immediately.

Levels use 288 bytes and epoch stamps 1152 bytes. No raw samples are retained.
Completed levels are serialized as 288 digits in `orbit.rest.json`; writes occur
once per completed interval and on app exit or recording configuration changes,
never per sample. App restarts restore history and the current-bin totals.
An app/render timer crossing a bin boundary may omit the last sub-second sensor
interval; it never extrapolates rest into an unobserved period. Long pauses
remain missing. Backward clock corrections discard future bins.

The initial release's green-by-day/yellow-by-night line is retained. Its boundary
is geometric solar-center altitude zero, consistently with sunrise/sunset rays.

Actual CPU time, sensor noise and battery impact require measurement on a watch.

## Verification

Run `node apps/orbit/test-rest.js` and `node apps/orbit/test.js`.
The new synthetic tests cover confirmation, level boundaries, gravity handling,
invalid/gapped samples, native sensor rates, five-minute boundaries, app/reboot
persistence, 24-hour rollover, clock corrections, outward geometry and adjustable
height, boot/off/LCD lifecycle, plot layering and daytime/nighttime line colors.
The existing eclipse/clock tests remain unchanged and pass.
