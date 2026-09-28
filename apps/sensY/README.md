# sensY

`sensY` is a Bangle.js 2 research app for synchronized barometric-pressure and acceleration-magnitude measurement.

## Measurement model

All acceleration integration features have been removed.

Acceleration is still gravity-compensated first. sensY estimates the three-axis gravity vector with a low-pass filter (time constant 0.8 s), normalises that estimate to 1 g, and subtracts it from the measured X/Y/Z vector.

For every accepted acceleration sample, sensY then calculates the gravity-compensated acceleration magnitude:

`sqrt(x^2 + y^2 + z^2)`

All of those magnitude samples acquired during one pressure-sampling interval are averaged. When the next pressure sample is accepted, sensY creates one synchronized graph sample containing:

- barometric pressure in hPa/mbar
- mean gravity-compensated acceleration magnitude in g for the same pressure interval

## Graph

The measurement screen always uses a black background. Settings menus continue to use the normal Bangle.js theme.

Pressure and interval-averaged acceleration magnitude are both shown as line graphs. Their line colours and widths are independently configurable.

Available line colours are:
- White
- Red
- Green
- Blue
- Yellow
- Cyan
- Magenta

Each trace width can be set from 1 to 5 pixels. Width is added vertically so normal sweep updates remain confined to the current/next two X columns.

The graph does not scroll. The sweep starts at the left edge, advances one horizontal pixel for each accepted pressure sample, reaches the right edge, then returns to the left and overwrites the old graph in place. A vertical red line marks the next write position.

### Pressure Y axis

Pressure scaling is automatic and cannot be set manually.

The minimum full-scale span is 0.5 mbar. When a visible pressure sample reaches or exceeds the current display range, sensY immediately doubles the full-scale span and redraws the whole graph so the trace is no longer clipped to the top or bottom edge. If the expanded range is still insufficient, it continues doubling until all visible pressure samples fit.

To avoid rapid scale oscillation, pressure scale reduction is slower. At the end of a complete horizontal sweep, if the visible pressure range occupies no more than one quarter of the current full scale, sensY halves the full-scale span once. It never shrinks below 0.5 mbar.

The pressure Y axis is labelled in mbar. Top, middle, and bottom tick values are drawn on screen.

### Acceleration Y axis

`Accel auto Y` enables the same x2 / x0.5 adaptive full-scale behaviour for interval-averaged acceleration magnitude.

When automatic acceleration scaling is enabled, `Accel Y min` and `Accel Y max` define the starting range. If a visible acceleration sample reaches or exceeds that range, sensY immediately expands the full scale in x2 steps. At each completed sweep, it may halve the span once when the visible data occupies no more than one quarter of the current full scale.

When `Accel auto Y` is disabled, `Accel Y min` and `Accel Y max` remain a fixed scale.

The acceleration scale is intentionally not printed on the measurement screen.

### Time X axis

There is no user-settable horizontal-span setting.

One pressure sample equals one horizontal pixel. Therefore the time scale is derived automatically from:

- `Pressure int s`: pressure interval in seconds
- the number of horizontal plot pixels

The screen displays both seconds-per-pixel and the total time span represented by the plot width.

## Settings

- `Pressure int s`: pressure sample interval, 0.5 to 120 seconds in 0.5-second steps.
- `Pressure graph`: show/hide the pressure line.
- `Pressure color`: pressure line colour.
- `Pressure width`: pressure line width, 1 to 5 pixels.
- `Pressure store`: save pressure data to CSV.
- `Accel Hz`: acceleration sampling frequency.
- `Accel graph`: show/hide the interval-averaged acceleration-magnitude line.
- `Accel color`: acceleration line colour.
- `Accel width`: acceleration line width, 1 to 5 pixels.
- `Accel store`: save interval-averaged acceleration magnitude to CSV.
- `Accel auto Y`: automatically expand/contract the acceleration full scale in x2 / x0.5 steps.
- `Accel Y min`: acceleration graph minimum; also the starting lower bound when auto Y is enabled.
- `Accel Y max`: acceleration graph maximum; also the starting upper bound when auto Y is enabled.

Tap the measurement screen to open settings. Returning from settings starts a fresh measurement graph.

## Pause / resume

On the measurement screen:

- swipe from top to bottom: stop sensor acquisition and enter standby;
- swipe from bottom to top: restart sensor acquisition.

While paused, the existing graph remains visible and `PAUSED` is shown.

The hardware button exits sensY.

## Sampling

Acceleration hardware sampling supports:

`1, 2, 5, 10, 12.5, 25, 50, 100 Hz`

For requested rates up to 12.5 Hz, the accelerometer operates at 12.5 Hz and sensY decimates in software. For 25/50/100 Hz, sensY changes the Bangle.js 2 KX023 output data rate and polling interval.

The barometer remains powered while acquisition is active. Pressure events are accepted according to the configured `Pressure int s` interval, which may be set from 0.5 to 120 seconds in 0.5-second steps.

## CSV storage

When either storage option is enabled, sensY creates a file named like:

`sensY<YYMMDDhhmmss>.csv`

Header:

```text
t_s,acc_mag_avg_g,p_hPa
```

Each CSV row corresponds to one accepted pressure sample. The acceleration value in that row is the mean gravity-compensated acceleration magnitude accumulated during the preceding pressure interval.

A field is left blank when its corresponding storage option is disabled.

Writes are buffered to reduce flash-write overhead. The App Loader interface can download or delete saved `sensY*.csv` files.


## Display power during measurement

While acquisition is active, sensY keeps the LCD/backlight on and disables the normal lock/LCD/backlight timeouts. When acquisition is paused, settings are opened, or the app exits, the original Bangle.js timeout settings are restored.

Normal samples still use the low-overhead two-column sweep update. If a visible pressure or auto-scaled acceleration sample reaches/exceeds the current Y range, sensY expands that full scale immediately and performs one full redraw so existing pixels are remapped. Scale contraction is considered only at a completed sweep boundary, which prevents repeated expand/shrink pumping.
