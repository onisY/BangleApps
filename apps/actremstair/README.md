# Activity Reminder +stair

A Bangle.js 2 modification of Activity Reminder that automatically combines flat walking and stair climbing into one activity score.

Based on the original Activity Reminder by Stiralbios in espruino/BangleApps.

## Important before installing

Do not run the original **Activity Reminder** and **Activity Reminder +stair** at the same time, because both install background reminder code and could generate duplicate checks/alerts. Disable or uninstall the original Activity Reminder before enabling this version.

## Behaviour

There is no Steps/Stairs mode switch.

Normal walking counts as normal steps. When an upward stair segment is detected from barometric altitude while step events are occurring, the app substitutes only the raw steps belonging to that ascent with a height-based walking-step equivalent.

Effective activity is:

    raw walking steps
    - raw steps during detected stair ascent
    + stair rise in metres x current equivalent steps per metre

The Bangle system-wide step counter is not modified. Substitution is used only inside Activity Reminder +stair.

## Editable MET-based conversion

The conversion is now based on editable MET values. Defaults are:

- Walking MET = 3.8
- Stair-climbing MET = 6.8
- Base calibration = 28.6 equivalent walking steps per metre climbed

The base 28.6 steps/m calibration is the same energy-equivalence assumption used in v0.01 (approximately 8,000 walking steps = 280 m stair ascent). The current conversion is scaled by the MET ratio:

    current eq steps/m
      = base eq steps/m
        x (current stair MET / 6.8)
        x (3.8 / current walking MET)

So increasing Stair MET increases the credit per metre climbed, while increasing Walking MET decreases it.

All three values can be edited later under **Settings -> Energy model**:

- Walking MET
- Stair MET
- Base eq step/m

The menu also shows the resulting **Current eq/m** value. Changes to Walking MET, Stair MET and Base eq step/m are read from Storage when stair credit is calculated, so new stair segments use the updated values without reinstalling the app.

If upgrading from v0.01, a previously customised Stair eq step/m value is automatically migrated to Base eq step/m.

## Stair detection

- Bangle step events are used as a low-power motion gate.
- The barometer turns on only while walking-like step events continue.
- Pressure/altitude is sampled every 2 seconds.
- A 3-sample median suppresses pressure noise.
- A rise must exceed 1.5 m before it is accepted as stairs.
- Very fast altitude changes above 1.0 m/s are rejected as likely elevator or pressure jumps.
- A descent closes the preceding ascent segment.
- Only raw steps up to the detected highest point are replaced. Descent/flat steps after the top remain ordinary walking steps.
- If step events stop for 10 seconds, the barometer is turned off.

## Limitations

This is an experimental algorithm. Ventilation, door pressure changes, handrail use, escalators, unusually slow stair climbing and Bangle step-detection errors can affect classification.

MET values describe activity intensity, not vertical energy per metre by themselves. For that reason this app retains a separate base steps/m calibration and uses the MET values to scale it. This keeps the conversion adjustable without pretending that MET alone uniquely determines steps per metre.

Because it uses barometric altitude, this version supports Bangle.js 2 only.

## Installation from this fork

Open the App Loader for this fork:

https://onisY.github.io/BangleApps/

Search for **Activity Reminder +stair**, connect your Bangle.js 2, and press Install.

After installation, restart the watch so the bootloader includes the new background .boot.js code.

For Web IDE development, use Save on Send = RAM. Do not use Flash.
