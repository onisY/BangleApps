Activity Reminder+ for Bangle.js 2

Files to store on the watch:
  lib.js      -> actremplus
  boot.js     -> actremplus.boot.js
  stairs.js   -> actremplus.stairs
  app.js      -> actremplus.app.js
  settings.js -> actremplus.settings.js
  alert.js    -> actremplus.alert.js
  actremplus.info -> actremplus.info

The boot file is loaded only after the Bangle bootloader rebuilds/reloads boot code.
After uploading all files, restart the watch. The bootloader hash check will rebuild boot code.

IMPORTANT: In Web IDE development use Save on Send = RAM, never Flash.

Stair mode:
- step events are NOT counted toward the goal; they are used only as a low-power
  walking/wrist-motion gate to decide when to sample the barometer.
- barometer is enabled only while such motion continues.
- pressure is sampled every 2 s by default.
- only upward segments >=1.5 m are accumulated.
- vertical changes faster than 1.0 m/s are rejected as likely elevator/pressure jumps.
- daily default target is 280 m and reminder pacing is proportional between Start/End hour.

Step mode preserves the basic behavior of Activity Reminder: at least Min steps must
occur within Max inactivity, otherwise an alert may appear.
