# LCARSi

LCARSi is an iPhone/iOS-compatible adaptation of **LCARS Clock** for Bangle.js 2.

It keeps the LCARS watch face, alarms, steps/HRM graphs, themes, battery display,
altitude and configurable data rows from the original app. Weather is supplied
through Bangle.js's official **iOS Integration** and **Weather** apps rather than
requiring Gadgetbridge.

## iOS setup

1. Install **LCARSi**. Its App Loader dependencies install **iOS Integration**
   and **Weather**.
2. Pair Bangle.js with the iPhone and allow Apple Notification Center Service
   (ANCS) access.
3. Install the official Bangle.js Weather Shortcut referenced by the iOS
   Integration/Weather app documentation.
4. Run the Shortcut once. It sends a notification titled
   `BangleDumpWeather`; iOS Integration parses it and stores it via the Weather
   module.
5. For automatic updates, create an iOS Shortcuts automation to run the weather
   Shortcut periodically (for example hourly).

LCARSi itself does not need Gadgetbridge. If weather has not yet been pushed,
weather rows display `?`; all other clock functions continue to work.

## Controls

* Tap left/right to change screens.
* Tap top/bottom to control the current screen.
* Main screen: top/bottom adjusts the timer alarm in 5-minute steps.
* Graph screen: top/bottom switches day/month view.

## Credits

Based on **LCARS Clock 0.34** by David Peer (peerdavid) and contributors in
Espruino/BangleApps. iOS adaptation by **onisY**.
