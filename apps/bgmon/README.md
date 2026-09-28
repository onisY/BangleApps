# BG Monitor

BG Monitor is a read-only runtime activity monitor for Bangle.js 2. It is intended for debugging battery drain, sensor ownership and persistent/background behavior without changing sensor power state or installing its own boot service.

## Pages

1. **Overview** - version, RAM usage, estimated total power, active JavaScript timer count, watch count and monitored listener count.
2. **Sensors** - GPS, HRM, compass and barometer state together with application IDs recorded in `Bangle._PWR`.
3. **Timers** - active `setInterval`/`setTimeout` entries from Espruino's hidden runtime state. BG Monitor's own 2 second refresh timer is excluded.
4. **Events** - counts for selected Bangle sensor/system event listeners such as `pressure`, `GPS`, `HRM`, `mag`, `health` and `accel`.
5. **Boot files** - installed `*.boot.js` files. Presence means boot code is installed/loaded, not that it is currently doing work.
6. **Power / Modules** - estimated device power breakdown from `E.getPowerUsage()` when supported, plus cached module count.

Tap or swipe left to advance. Swipe right to go back. Press the hardware button to exit.

## Read-only design

BG Monitor deliberately does not switch sensors on/off, install a boot service, wrap sensor functions, or write runtime logs. While open it only adds one 2 second refresh interval, which is excluded from its own timer list.

## Interpretation

Sensor owner IDs are authoritative when an app supplies an `appID` to Bangle sensor power APIs. An app that omitted the ID can appear as `?`.

Espruino timers do not contain a formal application-owner field. BG Monitor therefore shows timer ID/type/interval/callback name without claiming an app owner.

Power use is a firmware estimate and is intended for finding obvious draws, not as a substitute for external current measurement.
