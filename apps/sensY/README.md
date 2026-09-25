# sensY

`sensY` is a Bangle.js 2 research app for simultaneous three-axis acceleration and barometric pressure measurement.

## Measurement screen

Trace colours are chosen automatically for contrast with the active Bangle.js theme.

Dark background:
- Acceleration X: white
- Acceleration Y: yellow
- Acceleration Z: cyan
- Pressure: magenta

Light background:
- Acceleration X: black
- Acceleration Y: red
- Acceleration Z: blue
- Pressure: magenta
- All enabled traces are overlaid on one full-screen graph.
- Acceleration X/Y/Z share one configured Y minimum and maximum; pressure has its own Y minimum and maximum.
- Axis scale numbers are intentionally not drawn.
- The X axis is time. `Span (s)` sets the time represented by the full screen width.
- The graph is a sweep display: it moves from left to right and, after reaching the right edge, returns to the left and overwrites the old trace progressively.
- Tap once anywhere on the measurement screen to open settings.
- Press the hardware button to exit the app.

Measurement and logging continue while the LCD is off; graph drawing is skipped while the LCD is off. When the LCD turns on again, the graph restarts from the left.

## Settings

`Span (s)` is global. `Accel Integrate`, `Accel Y min`, and `Accel Y max` are common settings for all three acceleration axes. Each channel (Accel X, Accel Y, Accel Z, Pressure) has:

- `Sample Hz`: effective sample rate for that channel.
- `Store`: include that channel in CSV logging.
- `Graph`: show or hide that channel.
Acceleration X/Y/Z no longer have individual Y-axis limits; all three use the shared `Accel Y min` and `Accel Y max` values.

Pressure keeps its own `Integrate`, `Y min`, and `Y max` settings. Acceleration integration is controlled only by the single top-level `Accel Integrate` item:
- 0 = gravity-compensated acceleration
- 1 = one time integration of the gravity-compensated acceleration
- 2 = two time integrations of the gravity-compensated acceleration

Opening settings pauses acquisition. Returning with `< Back` applies the settings, resets the graph, and resets integration state.

### Sampling implementation

The X/Y/Z axes are one physical accelerometer. `sensY` therefore drives the accelerometer at the highest requested X/Y/Z rate and independently decimates each axis to its configured effective rate.

For rates up to 12.5 Hz, the accelerometer stays at 12.5 Hz and software decimation is used. For 25, 50, and 100 Hz, `sensY` configures the Bangle.js 2 KX023 output data rate and polling interval accordingly.

Pressure settings are 0.2, 0.5, or 1 Hz and are obtained by decimating Bangle.js pressure events.

## Gravity compensation and integration

Before acceleration data is used, `sensY` estimates the gravity vector from the three-axis accelerometer with a low-pass filter. The estimated vector is normalised to 1 g and subtracted from the measured X/Y/Z vector. The resulting linear-acceleration components are treated as the acceleration raw data everywhere else in the app: graphing, integration, and CSV storage.

The current gravity-estimation time constant is 0.8 s. This lets the estimate follow changes in watch orientation, but very slow motion can partly enter the gravity estimate. No additional baseline subtraction or detrending is performed.

Integration uses trapezoidal time integration and the actual interval between accepted samples.

When `Accel Integrate` is 1 or 2 and at least one acceleration trace is enabled for graph display, sensY also performs a drift-reset check. It stores the three displayed integrated acceleration values, waits 3 seconds, and compares them with the current X/Y/Z values. If the relative change of **all three axes** is 5% or less, the first- and second-order acceleration integrators for X/Y/Z are reset together to zero. If the condition is not met, the current values become the reference for the next 3-second window.

The relative change is calculated from the absolute difference divided by the larger absolute magnitude of the old and new values. A small numerical floor is used near zero to avoid division by zero.

- Gravity-compensated acceleration raw unit is `g`; integrated graph units are `g*s` and `g*s^2`.
- Pressure raw unit is `hPa`; integrated graph units are `hPa*s` and `hPa*s^2`.

## Storage format

When at least one channel has `Store` enabled, the app creates a CSV file named like:

`sensY<YYMMDDhhmmss>.csv`

Header:

```text
t_s,ax_lin_g,ay_lin_g,az_lin_g,p_hPa
```

`t_s` is elapsed time from app launch. The CSV stores **gravity-compensated acceleration raw values** and raw pressure, not integrated graph values. This preserves the corrected acceleration used by the app for later processing. A cell is blank when that channel is not due at that timestamp or its `Store` option is off.

Writes are buffered to reduce flash-write overhead.

The App Loader custom interface can download or delete saved `sensY*.csv` files.
