# Life Monitor

Life Monitor is a Bangle.js 2 background widget for motion, barometric height, wear state, resting heart rate and battery prediction.

## Operation

- Accelerometer events are monitored continuously without forcing a faster polling interval.
- Pressure is sampled every 15 seconds in the normal state.
- After 2 seconds of stillness the barometer enters a temporary high-rate mode for elevator detection.
- A gravity-compensated double integral of acceleration is used only as a stair-candidate trigger. Final stair height is always calculated from relative pressure change.
- After 10 seconds of stillness the HRM starts. Good-confidence BPM values are sampled every 10 seconds and complete 5-minute averages are stored. Motion stops this HRM session.
- After 15 seconds of stillness, temperature is sampled three times at 3-second spacing and then the temporary temperature/barometer power owner is released. Temperature, orientation and stillness are combined into worn/off/placed states.
- Battery percentage is sampled every minute. A regression over recent discharge samples estimates time to 10%. At 3 hours or less the widget flashes while the LCD is on.

## Settings and data

Open Settings > Apps > Life Monitor. Current/today data, recent events, and all important thresholds can be viewed or changed there.

The double-integrated acceleration is deliberately not used as the recorded altitude because wrist orientation and accelerometer bias cause rapid drift.