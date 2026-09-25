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

The graph uses point plots only. There are no connecting lines.

Each pressure sample advances the graph by exactly one horizontal pixel. The corresponding averaged acceleration magnitude is plotted at the same X coordinate.

The graph retains the most recent samples that fit in the plot width. When the plot is full, the oldest sample is removed and the remaining samples shift one pixel to the left.

### Pressure Y axis

Pressure scaling is automatic and cannot be set manually.

For the pressure values currently visible across the horizontal plot range:

- normally, the minimum visible pressure becomes the bottom of the pressure scale and the maximum visible pressure becomes the top;
- if the visible maximum-minus-minimum is 1 mbar or less, the pressure scale is centred on the visible mean and forced to mean ±0.5 mbar.

The pressure Y axis is labelled in mbar. Top, middle, and bottom tick values are drawn on screen.

### Acceleration Y axis

Acceleration magnitude uses the user-configured `Accel Y min` and `Accel Y max`.

This acceleration scale is intentionally not printed on the measurement screen.

### Time X axis

There is no user-settable horizontal-span setting.

One pressure sample equals one horizontal pixel. Therefore the time scale is derived automatically from:

- `Pressure int s`: pressure interval in seconds
- the number of horizontal plot pixels

The screen displays both seconds-per-pixel and the total time span represented by the plot width.

## Settings

- `Pressure int s`: pressure sample interval, 1 to 300 seconds.
- `Pressure graph`: show/hide pressure points.
- `Pressure store`: save pressure data to CSV.
- `Accel Hz`: acceleration sampling frequency.
- `Accel graph`: show/hide interval-averaged acceleration-magnitude points.
- `Accel store`: save interval-averaged acceleration magnitude to CSV.
- `Accel Y min`: acceleration graph minimum.
- `Accel Y max`: acceleration graph maximum.

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

The barometer remains powered while acquisition is active. Pressure events are accepted according to the configured `Pressure int s` interval.

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
