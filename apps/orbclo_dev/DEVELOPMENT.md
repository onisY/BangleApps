# Orbclo development method

Public app: `apps/orbclo` (stable only).

Integrated development app: `apps/orbclo_dev` (currently frozen at 0.03 while the new modular workflow is validated).

Isolated stage-1 test apps:
- `apps/orbclo_dev_orbit`: Orbit/main screen only.
- `apps/orbclo_dev_cal`: five-week calendar only.
- `apps/orbclo_dev_settings`: settings only.

Workflow:
1. Implement and test each screen independently.
2. Stress-test each screen without cross-screen transitions.
3. Combine Orbit + Calendar only and stress-test repeated round trips.
4. Add Settings only after the two-screen build is stable.
5. Promote to public `Orbclo` only after physical-watch verification.

Public version numbers are not changed for development-only fixes.
