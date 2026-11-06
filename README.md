# Eve Quinn: experimental SHRDLU guest compatibility for SIMH

**Source base:** Bill Ezell, wjenh/pidp1-mods, `51bdc2d0cd09cfa95c5d66d3bf14dd90bf2acfb9` (2026-11-05).
**Patch result:** local Eve source commit `2fef2b767dc8d4c89b7d78046a829b106c0c64c1`.
**Format:** a single reviewable eight-file Git patch; generated binaries and private data are excluded.

This patch adds a guarded SIMH Type 630 DCS compatibility mode to PDP-1
SHRDLU without removing the original DCS2 build. It adds a byte-serialized
DCS transmitter and an automated real TCP test for the actual guest code.
It also provides an **opt-in** `FASTMOTION` build that uses Bill's existing
source flag to jump the hand to a target without pacing every intermediate
step. The normal animated build is unchanged and remains available.

## Verification, on 2026-11-05

* Normal SIMH build: all 13 drum overlays validated by `ovlload -c`.
* Normal guest TCP suite: **4/4 PASS**, including banner, `/WORD BLOCK`,
  `/ROOM`, and `ARE THERE ANY BLOCKS?` with the five-block reply.
* Fast-motion SIMH build: separate RIM/overlay/drum pair, **13/13** overlays
  current; automated guest TCP suite **5/5 PASS** on two independent runs.
  The extra command is `PICK UP A BIG RED BLOCK.`; it parsed and returned
  `OK.` followed by the guest prompt. An additional guest snapshot showed
  the hand-position pending flag cleared after the fast operation.
* The original DCS2 guest assembled successfully when given the correct
  `Am1Includes` path.

**Requirements and limitations:** These runs require Eve's **experimental**
Type 340/CCT PDP-1 SIMH host adapter (local branch
`eve/type340-dac-width`, commit `f963dea`), not unmodified stock SIMH.
Normal paced hand animation is **not yet validated**. In a bounded diagnostic
the hand waited in `handShow` with a position pending and due one guest
millisecond later; display frames continued. This may reflect timing/
throughput, not necessarily deadlock. Neither live SDL/light-pen behavior,
the complete SHRDLU demonstration, large traffic nor save/restoration
are covered. This is an experimental review package, **not a complete port**.

The PDP-1 guest binaries in these tests were assembled using an existing
earlier AM1 executable. The newly updated Nov5 AM1 source could not be
rebuilt on the test host because `bison` and `flex` are absent; do not
construe these tests as validation of the new compiler version.

## Apply and test

Starting from a clean checkout of `51bdc2d`:

```sh
git apply --check shrdlu-simh.patch
git apply shrdlu-simh.patch
# Build am1 and ovlload separately (tools/paths are site-specific).
cd FunStuff/Shrdlu/Shrdlu
make simh AM1=/path/to/am1 OVLLOAD=/path/to/ovlload
make simh-fastmotion AM1=/path/to/am1 OVLLOAD=/path/to/ovlload
cd ../../..
python3 tests/run_shrdlu_simh_smoke.py --simh /path/to/experimental-SIMH/BIN/pdp1
python3 tests/run_shrdlu_simh_smoke.py --simh /path/to/experimental-SIMH/BIN/pdp1 \
  --prefix shrdlu-simh-fast --motion --timeout 35
```

The patch also contains `tests/diag_shrdlu_motion.py` to inspect guest
motion state after a bounded run; please see
`FunStuff/Shrdlu/SHRDLU-SIMH.md` for the full notes.

Eve Quinn / LittleMouseQuinn
