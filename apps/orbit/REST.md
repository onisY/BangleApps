# Rest bar and power management (tenkyu v0.065)

## Five-level bars

The underlying five-minute measure is still the percentage of local maxima
in the high-pass-filtered Z acceleration whose amplitude is no greater than the
configured threshold (0.001–0.729 g, seven choices).

Display stage: 0–19%=1, 20–39%=2, 40–59%=3, 60–79%=4, 80–100%=5.
Worn, observed inactivity with zero peaks is 100% (stage 5). Worn,
high-motion intervals that yield 0% quiet peaks still display stage 1.
Non-wear = stage 0 and draws no bar. Missing coverage (<270 seconds)
also draws no bar but is stored separately; no-data and non-wear must not
be treated as the same physiological state.

The goal is that sleep-like motionlessness maps approximately to 5,
desk work to 3, and walking to 1; a Z-peak ratio alone does not guarantee
those classes. Validate thresholds against actual Bangle.js 2 samples.

Bars are drawn **after the Moon**, so they overwrite lunar pixels, and before
the red observer point. Sunrise/sunset classification is cached by
five-minute slot for 288 bins, reducing repeated astronomy calculations
during full-screen redraw.

## Retained history

Save v3 with 288 hexadecimal bytes: 00–64 (0–100%) for observed data,
FE for non-wear, FF for absent/insufficient data. Load v2 percentages for
backward compatibility but reinterpret v2 zero (which could mean either zero
activity or absent data) conservatively as missing. The previous v1
duration-based levels remain incompatible.

## Power

* After the LCD/backlight timeout, turn off backlight and lock touch input;
  leave the memory-in-pixel LCD displaying the clock. If system timeout=0,
  use a 10-second fallback. Face-up/twist still unlock and light the watch.
* For the 5-minute HRM wear probe, power down the LED immediately after the
  first reliable pulse, otherwise continue up to the selected probe limit
  (default 30s).
* Preserve all existing accelerometer events for peak fidelity but avoid
  unnecessary loops and array allocations in the typical sample path.
* Evaluate eclipse approximately every five minutes when inactive; use the
  existing 30-second precision path when active. The normal time display
  remains updated each minute.
* Cache 288 day/night results with per-slot stamps rather than recomputing
  the full astronomical solar position for every bar on every redraw.
* Real Bangle.js 2 power and wake behavior require a physical test.


## Orientation-independent non-wear (v0.064)

The rest *level* continues to derive from screen-normal Z-axis acceleration peaks.
Only the **non-wear** motion gate now uses all three axes. Each accelerometer
sample contributes to a one-second mean vector (X,Y,Z) in g. For a complete
five-minute window, let a0 denote its first one-second mean, and let ai be
subsequent one-second means. Define maximum drift D=max_i ||ai-a0||_2.
A single user-selected threshold (0.001..0.729 g) applies to D, without
axis-specific or orientation-dependent limits. The metric detects both
rotation/tilt of the gravitational acceleration vector and translational
acceleration; there is no expensive atan2/acos/normalization for each sample.
The 1-second averaging suppresses brief outlier spikes (at the cost of
ignoring brief excursions). For typical magnitude near 1g, a pure tilt
of theta radians produces D approximately theta g; 0.009g is roughly 0.52°.

The low-drift condition is combined with >=270 seconds of valid 3D
accelerometer coverage and a valid no-pulse HRM result. Incomplete coverage,
failed/skipped HRM or no-pulse with movement produces an unknown slot (FF),
rather than a misleading rest stage of 5. Late HRM results can finalize the
most recently closed slot.
The existing persisted `restWearThreshold` config key is retained to avoid
resetting user preferences; its menu label changes from Z range to 3D drift.

## Non-wear finalization and diagnostics (v0.065)

The old algorithm silently treated `noPulse=false` as proof of wearing.
That caused stage 5 on a perfectly motionless unworn watch whenever the HRM
probe was skipped, failed, or completed a little late. It also required a
sample within 2.5 seconds of the beginning/end of each 5-minute slot, even
when well over 270 seconds of data were available.

The updated logic has distinct HRM states:
0 = pending/unknown, 1 = pulse detected, 2 = no pulse detected during
a successful probe, 3 = probe unavailable/failed. With non-wear enabled:
- At least 270 seconds of continuous valid 3D data are required.
- Detected pulse: classify as worn (rest bar stages 1–5).
- No pulse and drift under the 3D threshold: stage 0, draw no bar (FE).
- No pulse and movement above threshold: unknown, no bar (FF).
- Pending/failed probe, incomplete sensor coverage: unknown, no bar (FF).

One late callback may finalize the immediately preceding five-minute bin.
A detected pulse cancels the remainder of the optical test and schedules
the *next* five-minute bin, not another probe in the current one.
The old strict start/end 2.5s alignment gate is removed; sufficiently
covered intervals are evaluated.

The last 12 completed bins contain a bounded `diag` log in
`orbit.rest.json`, with `bucket`, `coverageSec`, `driftG`, `pulse`,
`result` and `reason`. On-watch: Settings → Rest graph → Last check.
These records are generated at existing five-minute save points. They are
diagnostic estimates, not medically reliable wear or sleep detection.
History from previous releases remains on the graph until it ages out
after 24 hours, including any incorrectly classified stage-5 bars.
