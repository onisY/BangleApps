# Orbclo Dev

`Orbclo Dev` is the development channel for Orbclo.

The public app remains `Orbclo`. Experimental changes are made and tested here first. Only after the user accepts a development build are those changes promoted to the public `Orbclo` app and the public version number advanced.

The development app uses separate settings (`orbclo_dev.json`), GPS power tag (`orbclodev`), screenshot state (`orbclo_devshot.json`) and screenshot prefix (`odNN.bmp`) so it does not overwrite the public Orbclo state.

The development harness evaluates its bundled `orbclo_dev.core.js` after applying only development-name/storage substitutions. This indirection exists only in Orbclo Dev; the public Orbclo runtime remains the direct clean implementation without runtime source rewriting.

## Version policy

- Public `Orbclo`: version changes only when an accepted development build is promoted.
- `Orbclo Dev`: development revisions may change freely without changing the public version.
