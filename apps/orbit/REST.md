# Screen-normal acceleration peak rest graph (tenkyu 0.061)

## Definition

Each 5-minute interval is represented by one outward radial bar. The height is
the percentage of **local Z-axis acceleration peaks** whose amplitude is
less than or equal to the configured threshold (g):

    rest_percent = 100 * below_threshold_peaks / all_peaks

Bangle.js 2 `accel.z` is the axis in/out of the watch screen. The recorder
tracks `abs(z - baseline)`, using a lightweight 2-second time-constant
exponential baseline to suppress static gravity and slowly changing watch
orientation. A local maximum is found from consecutive samples and counted
only once on a flat-top peak. Positive and negative Z variations both count.
The `diff` vector and `mag - 1` old quiet-test are no longer used.

The rest thresholds remain selectable in seven steps:
`0.001 / 0.003 / 0.009 / 0.027 / 0.081 / 0.243 / 0.729 g`.
The setting is now **Rest graph / Peak threshold**. The previous
"Quiet seconds" setting is removed because there is no ten-second confirmation
in this definition.

If no movement peak occurs in an otherwise fully observed and worn interval,
the percentage is 100%. The percentage is stored as an integer 0–100.
0% means no visible bar, 50% means half the configured maximum bar height,
and 100% means the full maximum height. **Rest graph / Max bar height**
sets that height from 1 to 14 pixels (default 10 pixels).

At least 270 of the 300 seconds must have consecutive valid Z samples with
no intervening gap longer than 2.5 seconds. Missing data produces no bar.
These are proportions *of detected peaks*, not the fraction of time resting.
A high frequency of small noise peaks may bias the proportion; available
peaks are limited by the sensor's actual sampling rate.

## Non-wear classification and colors

Non-wear uses the existing 5-minute optical heart-rate check together with
the whole-bin Z range, which is independently threshold-configurable.
If there is no valid pulse and Z variation stayed below that range threshold,
the bin is drawn black (no bar). For an observed, worn, motionless watch,
there are no peaks, so the rest ratio is 100%.

Bars are green from sunrise to sunset and yellow at night, evaluated at the
end of each five-minute interval, as before. They extend outward from the
lunar orbit without changing the Moon, red observer dot or other overlay order.

## Storage, power and compatibility

The recording uses existing accelerometer events, does not raise polling rates,
and does not retain raw accelerometer samples. Only the peak counts, baseline,
three-point extrema state, time coverage and non-wear extrema are maintained.
Memory and computation per event are constant. The radial history is 288
five-minute bins (24 hours). Completed percentages are stored as two hex
digits per bin, for 576 characters in `orbit.rest.json` (`v:2`).
Current-bin counts are saved at app exits and at the five-minute rollover.

Old `v:1` rest-level history is intentionally not interpreted as v2 data:
10-second quiet-duration levels and peak-ratio percentages have different
definitions. A new graph will build up over 24 hours after upgrade; configuration,
non-wear options and other app state are unchanged. The previous data file
is overwritten on a completed bin, app exit, or other recorder persistence
event.

Sensor noise and power behavior need checking on a real Bangle.js 2. The
energy cost is primarily event processing with the existing sampling frequency
plus the unchanged periodic short HRM probe.

## Verification

Run `node apps/orbit/test-rest.js` and `node apps/orbit/test.js`.
Test both low and high peaks, mixed ratios, uninterrupted stillness, sparse
sampling, insufficient coverage, device non-wear, midnight and clock
corrections, persistence, layering and day/night colors.
