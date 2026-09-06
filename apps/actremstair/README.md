# Activity Reminder +stair

A Bangle.js 2 modification of Activity Reminder that automatically combines flat walking and stair climbing into one activity score.

Based on the original Activity Reminder by Stiralbios in espruino/BangleApps.

## Important before installing

Do not run the original **Activity Reminder** and **Activity Reminder +stair** at the same time, because both install background reminder code and could generate duplicate checks/alerts. Disable or uninstall the original Activity Reminder before enabling this version.

## Behaviour

There is no Steps/Stairs mode switch.

Normal walking counts as normal steps. When an upward stair segment is detected from barometric altitude while step events are occurring, the app substitutes the raw steps taken during that ascent with a height-based step equivalent.

Effective activity is:

    raw walking steps
    - raw steps during detected stair ascent
    + stair rise in metres x stair-equivalent steps per metre

The default conversion is 28.6 equivalent steps per metre. This corresponds approximately to 8,000 walking steps = 280 m stair ascent for the experimental energy-equivalence assumption used here.

The Bangle system-wide step counter is not modified. Substitution is used only inside Activity Reminder +stair.

## Stair detection

- Bangle step events are used as a low-power motion gate.
- The barometer turns on only while walking-like step events continue.
- Pressure/altitude is sampled every 2 seconds.
- A 3-sample median suppresses pressure noise.
- A rise must exceed 1.5 m before it is accepted as stairs.
- Very fast altitude changes above 1.0 m/s are rejected as likely elevator or pressure jumps.
- A descent closes the preceding ascent segment.
- If step events stop for 10 seconds, the barometer is turned off.

## Settings

The original Activity Reminder settings are retained. Added settings are:

- Stair eq step/m: equivalent walking steps credited per metre climbed, default 28.6
- Min stair rise: minimum vertical rise before a segment is treated as stairs, default 1.5 m

## Limitations

This is an experimental algorithm. Ventilation, door pressure changes, handrail use, escalators, unusually slow stair climbing and Bangle step-detection errors can affect classification.

Because it uses barometric altitude, this version supports Bangle.js 2 only.

## Installation from this fork

Enable GitHub Pages for this BangleApps fork if it is not already enabled, then open:

https://onisY.github.io/BangleApps/

Search for **Activity Reminder +stair**, connect your Bangle.js 2, and press Install.

After installation, restart the watch so the bootloader includes the new background `.boot.js` code.

For Web IDE development, use Save on Send = RAM. Do not use Flash.
