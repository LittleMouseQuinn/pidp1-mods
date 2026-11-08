# Eve Quinn: experimental PDP-1 SHRDLU Type 630/SIMH patch, November 8, 2026

This is a review-only patch against Bill Ezell's `wjenh/pidp1-mods`
**ec2cee7cc87dd9ab5b012d4b05cf248df66a30c2**, the November 8
major-cleanup source head. The tested local source branch ends at
**d416d62**. No generated binaries, drum images, credentials, or private
files are included.

## What changed

* Guarded `SIMH_COMPAT` mode uses the stock Type 630 interface for
  PDP-1 SHRDLU while retaining the existing native DCS2 build by default.
* A corrected single-line Type 630 TX helper uses **TCC** (transmit
  and scanner-continue) instead of **TCB** (transmit only).
* New optional `simh-fastmotion` and `simh-paced-probe` Makefile
  targets plus guest TCP regression scripts. The paced probe keeps the
  ordinary `leg` and `handShow` code but takes coarse 512-pixel steps.
* Detailed interface and verification notes in
  `FunStuff/Shrdlu/SHRDLU-SIMH.md`.

## Why the TCC correction matters

Bill's original Type 630 combines scanner readiness from terminal input
and output completion. In a previous live PDP-1 motion test, the guest
received an old scanner-ready indication just before it sent the first
response byte `O`. With `TCB`, the next `K` transmission overwrote the
pending `O` before SIMH's line service could send it. The exact
regression response was `K.\n*\n` instead of `OK.\n*\n`. A separately
instrumented host confirmed TCB for `O` and no service before the next
TCB for `K`. The TCC update clears/continues the scanner correctly in
this **single-line** shim and the regression now passes.

This code has **not** been verified for multiple DCS lines or arbitrary
terminal typeahead.

## Verified November 8 results

The source patch was replayed onto `ec2cee7` without conflicts, and
tested using the **freshly rebuilt** experimental Type 340 SIMH host
source at `f963dea32000956d87a5b910c6ce3760ad325c74` with a clean
tracked tree and passing simulator register sanity check:

* Normal SIMH guest: 4/4 TCP dialogue/overlay checks pass.
* Opt-in FASTMOTION guest: 5/5 TCP checks pass, including a complete
  `PICK UP A BIG RED BLOCK.` reply.
* Opt-in coarse-paced guest: 5/5 pass, including the complete
  `OK.` reply that failed with TCB.
* All **13** drum overlays were verified current for each SIMH build.
* Original native DCS2 guest still assembles.

These tests used an existing earlier AM1 executable. The **new**
upstream AM1 source was not rebuilt on this host due to missing
`bison` and `flex`; no compiler-version validation is claimed.

## Apply and run

Starting from a clean copy of Bill's `ec2cee7` source:

```sh
git apply --check shrdlu-simh-nov08.patch
git apply shrdlu-simh-nov08.patch
cd FunStuff/Shrdlu/Shrdlu
make simh AM1=/path/to/am1 OVLLOAD=/path/to/ovlload
make simh-fastmotion AM1=/path/to/am1 OVLLOAD=/path/to/ovlload
make simh-paced-probe AM1=/path/to/am1 OVLLOAD=/path/to/ovlload
cd ../../..
python3 tests/run_shrdlu_simh_smoke.py --simh /path/to/EXPERIMENTAL-SIMH/BIN/pdp1
python3 tests/run_shrdlu_simh_smoke.py --simh /path/to/EXPERIMENTAL-SIMH/BIN/pdp1 --prefix shrdlu-simh-fast --motion --timeout 35
python3 tests/run_shrdlu_simh_smoke.py --simh /path/to/EXPERIMENTAL-SIMH/BIN/pdp1 --prefix shrdlu-simh-paced --motion --timeout 82
```

## Strict limitations

**This is not a complete port or an integration request.** The separate
experimental SIMH Type 340 adapter is required; stock SIMH is not enough
for the graphics path. Full original-step hand motion, SDL user interaction,
and mouse prediction at high movement speeds have **not** been validated.
Bill's current Type 340 docs say `DRP` and `DRC` share central motion
prediction; the experimental SIMH host does not implement that pipeline.
Bill's November 8 email clarified that t30dpy sends pen positions
asynchronously, with a roughly 8 ms client check interval; this guest
patch does not model that async input timing or test real human feedback.

Eve Quinn / LittleMouseQuinn
