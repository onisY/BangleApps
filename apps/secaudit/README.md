# Security Audit

Security Audit performs an **on-device static inspection** of a Bangle.js 2 and provides a small BLE-hardening helper.

It is intended to answer practical questions such as:

- Is Bluetooth enabled?
- Is the Bluetooth JavaScript REPL (`Programmable`) enabled?
- Is a six-digit passkey configured?
- Is a Bluetooth whitelist active?
- Is privacy / hidden device name enabled?
- Which boot-time JavaScript files are installed?
- Which applications are installed?
- Which readable JavaScript files contain APIs capable of Bluetooth transmission, outbound BLE connections, BLE re-enabling, raw flash writes, storage enumeration, or sensitive sensor access?

## Findings

The scanner labels code matches as:

- **HIGH** — powerful transmission/control capabilities such as `NRF.setAdvertising`, `NRF.connect`, `NRF.requestDevice`, `.gatt.connect`, `Bluetooth.write/print/println`, `NRF.wake`, `Bluetooth.setConsole`, or raw `Flash.write`.
- **MED** — capabilities such as `NRF.setScan`, `NRF.findDevices`, custom BLE services, TX power control, HID transmission, or storage enumeration.
- **INFO** — sensitive sensor access such as GPS, heart-rate or accelerometer use.

A match **does not mean an app is malicious**. Many legitimate Bangle apps need these APIs. The purpose is to identify code that deserves manual review.

From v0.04, each finding also stores a short `sample` of the code surrounding the match in `secaudit.json`. This makes it easier to distinguish an expected use from a false positive or an unexpected transmission path.

## BLE Hardening

The app includes a `BLE Hardening` menu.

It can, after confirmation:

- set `Programmable` OFF;
- set Bluetooth privacy to `Hide name`.

It also provides shortcuts/guidance for:

- configuring a six-digit Passkey in Settings;
- adding trusted devices to the Bluetooth Whitelist;
- restarting the watch and rescanning after changes.

Changes to boot-time Bluetooth behaviour may require a restart before they are fully reflected in the generated boot code.

## iPhone clipboard export

From v0.05, the App Loader interface can read `secaudit.json` from the connected watch and place it on the iPhone clipboard.

Open the app's interface page in App Loader, wait for the report to load, then tap:

`Copy to iPhone clipboard`

The report is also shown in a text area. If iOS/WebBLE blocks programmatic clipboard access, the interface falls back to selecting the full report so it can be copied with the normal iPhone Copy command.

Because iOS requires a user gesture for clipboard writes, the copy step is intentionally triggered by a button tap rather than attempted automatically after BLE transfer.

## Boot-code fingerprints

The app records CRC fingerprints for `.boot0`, `.bootcde`, `bootupdate.js`, and `*.boot.js` files. These are useful for comparing the same watch before and after changes, but they are **not cryptographic proof** that the firmware or boot code is official.

The Bangle Bootloader rebuilds `.boot0` when settings, installed JavaScript files, or the firmware Git commit change, so a `.boot0` CRC change after an expected app/settings update is not automatically suspicious.

## Saved report

Each scan writes a machine-readable report to:

`secaudit.json`

This includes firmware/version information, Bluetooth configuration, installed applications, boot files, code findings, match samples, and scanner limitations.

## Important limitations

This app cannot:

- prove that the nRF52840 firmware is byte-for-byte identical to an official Espruino build;
- inspect or authenticate the MCU bootloader binary from normal Storage;
- prove that undocumented hardware does not exist on the PCB;
- reliably inspect code that has been pretokenized or transformed so that API names are no longer stored as plain text;
- determine malicious intent merely from an API call.

For a stronger audit, combine this report with SWD readback / reflashing from a trusted build and, if required, physical PCB and RF inspection.

## Recommended interpretation

Pay particular attention to:

1. `Programmable = YES`
2. BLE enabled with no passkey and no whitelist
3. unexpected `*.boot.js` files
4. unexpected apps containing HIGH-capability BLE APIs
5. changes in core boot-file fingerprints without an expected update

## v0.05 changes

- Adds an App Loader interface page for `secaudit.json`.
- Reads the latest report over the existing Bangle/WebBLE connection.
- Adds a one-tap `Copy to iPhone clipboard` button.
- Adds a fallback that selects the complete report if direct clipboard access is blocked by iOS.

## v0.04 changes

- Fixed false-positive BLE-UART detections caused by complex regular-expression alternatives on Espruino.
- Uses separate, simpler patterns for each sensitive BLE API.
- Adds a short code sample to each finding.
- Keeps `NRF.findDevices()` detection so BLE Detector and similar scanners are identified correctly.
