# sens

`sens` is a Bangle.js 2 research app for simultaneous three-axis acceleration and barometric pressure measurement.

## Measurement screen

- Acceleration X: red
- Acceleration Y: green
- Acceleration Z: blue
- Pressure: yellow
- All enabled traces are overlaid on one full-screen graph.
- Every channel uses its own configured Y minimum and Y maximum.
- Axis scale numbers are intentionally not drawn.
- The X axis is time. `Span (s)` sets the time represented by the full screen width.
- The graph is a sweep display: it moves from left to right and, after reaching the right edge, returns to the left and overwrites the old trace progressively.
- Tap once anywhere on the measurement screen to open settings.
- Press the hardware button to exit the app.

Measurement and logging continue while the LCD is off; graph drawing is skipped while the LCD is off. When the LCD turns on again, the graph restarts from the left.

## Settings

`Span (s)` is global. Each channel (Accel X, Accel Y, Accel Z, Pressure) has:

- `Sample Hz`: effective sample rate for that channel.
- `Store`: include that channel in CSV logging.
- `Graph`: show or hide that channel.
- `Integrate`: 0 = raw value, 1 = one time integration, 2 = two time integrations.
- `Y min`, `Y max`: graph scale limits for that channel.

Opening settings pauses acquisition. Returning with `< Back` applies the settings, resets the graph, and resets integration state.

### Sampling implementation

The X/Y/Z axes are one physical accelerometer. `sens` therefore drives the accelerometer at the highest requested X/Y/Z rate and independently decimates each axis to its configured effective rate.

For rates up to 12.5 Hz, the accelerometer stays at 12.5 Hz and software decimation is used. For 25, 50, and 100 Hz, `sens` configures the Bangle.js 2 KX023 output data rate and polling interval accordingly.

Pressure settings are 0.2, 0.5, or 1 Hz and are obtained by decimating Bangle.js pressure events.

## Integration

Integration uses trapezoidal time integration and the actual interval between accepted samples.

- Acceleration raw unit is `g`; integrated graph units are therefore `g*s` and `g*s^2`.
- Pressure raw unit is `hPa`; integrated graph units are `hPa*s` and `hPa*s^2`.

No gravity removal, baseline subtraction, detrending, or drift correction is performed.

## Storage format

When at least one channel has `Store` enabled, the app creates a CSV file named like:

`sensYYMMDDhhmmss.csv`

Header:

```text
t_s,ax_g,ay_g,az_g,p_hPa
```

`t_s` is elapsed time from app launch. The CSV stores **raw sensor values**, not integrated graph values. This preserves the original measurements for later processing. A cell is blank when that channel is not due at that timestamp or its `Store` option is off.

Writes are buffered to reduce flash-write overhead.

The App Loader custom interface can download or delete saved `sens*.csv` files.
