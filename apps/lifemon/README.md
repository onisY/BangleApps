# Life Monitor

Life Monitor is a Bangle.js 2 background widget for activity classification, barometric height, wear state, resting heart rate and battery prediction.

## Real-time activity classifier

A 5 second rolling window (configurable) calculates four lightweight features:

- **dispRange** - 3-axis pseudo-displacement range from gravity-compensated double integration. This is a classification feature, not an absolute distance measurement.
- **accStd** - standard deviation of acceleration magnitude.
- **periodicity** - normalized autocorrelation peak in the approximate 0.8-2.5 Hz walking band.
- **altRate** - vertical speed in m/s from recent barometric pressure change.

The classifier reports one of eight states: desk, walk, stairs up/down, escalator up/down, or elevator up/down. Classification thresholds are configurable.

## Widget dots

The widget contains 12 dots in three rows. Green means active/threshold met and red means inactive.

- Row 1: Desk, Walk, Stairs up, Stairs down
- Row 2: Escalator up, Escalator down, Elevator up, Elevator down
- Row 3: dispRange, accStd, periodicity, altRate

When the predicted time to the configured low-battery target is at or below the warning time, the complete dot matrix flashes while the LCD is on.

## Other monitoring

- Accelerometer events are monitored continuously without forcing a faster polling interval.
- Pressure is sampled at a low rate normally and switched to fast barometer mode for movement/height classification and the existing stair/elevator detector.
- The original stair candidate detector still uses gravity-direction integration only as a trigger; recorded stair/elevator height uses relative barometric pressure.
- After 10 seconds of stillness the HRM starts. Good-confidence BPM values are sampled every 10 seconds and complete 5-minute averages are stored. Motion stops this HRM session.
- After 15 seconds of stillness, temperature is sampled three times at 3-second spacing and used with orientation/stillness for worn/off/placed detection.
- Battery percentage is sampled every minute and recent discharge is used to estimate time to the target level.

Open Settings > Apps > Life Monitor for live feature values, the indicator legend, thresholds and recent events.
