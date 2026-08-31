# Adventure on stock SIMH

Adventure can run on the stock SIMH PDP-1 without modifying SIMH itself.

Stock SIMH already provides the pieces that the base game needs:

- PDP-1D CPU support, including the extended instructions used by Adventure.
- The Type 23 parallel drum.
- A Type 630 DCS implementation backed by SIMH's TMXR network layer.

The compatibility difference is at the guest DCS interface. DCS2 adds guest-side socket setup and status IOTs such as `SCB` and `RCS`; stock SIMH implements the original Type 630 character IOTs and leaves listener setup to the simulator console.

The `SIMH_COMPAT` build adapts that difference on the Adventure side. Normal DCS2 builds are unchanged.

## Build

From `FunStuff/Adventure`, with AM1 available on `PATH`:

```sh
make adventure-simh
```

This produces:

- `adventure-simh.rim`, the AM1 multi-bank paper-tape image.
- `simh-drum.img`, a local Type 23 drum image containing the generated Adventure data.

Unlike the normal pidp1-mods build, this target does not write the live drum image under `/opt`.

## Run

A ready-to-use SIMH command file is included in `FunStuff/Adventure/adventure-simh.ini`.
Run a current stock SIMH PDP-1 from the Adventure directory:

```sh
pdp1 adventure-simh.ini
```

Then connect to port 2030 with telnet and press Enter once.

Stock SIMH's original DCS interface has no guest-visible network connection-status bit. The compatibility path therefore treats the first received character only as the session-start event. Adventure then sends its normal greeting and enters the command interface.

The supplied configuration:

- selects a PDP1D48 CPU with 16K memory;
- attaches `simh-drum.img` as the Type 23 drum;
- enables one 8-bit DCS line on port 2030;
- sets sense switch 5;
- attaches `adventure-simh.rim` to the paper-tape reader;
- boots the tape through the simulated PDP-1 loader.

## Clock-dependent behavior

Sense switch 5 is set intentionally. Adventure's existing SS5 behavior disables closing time, save/restore anti-spoofing, and the other time-dependent paths, so the nonstandard Chrono-Log clock IOT is not called.

The native pidp1-mods configuration remains the path for the full clock-dependent behavior. The stock-SIMH mode is intended to run the game using only devices already present in stock SIMH.

## DCS compatibility details

Stock SIMH uses the Type 630 scanner flag for both receive-ready and transmit-complete events. The compatibility definitions serialize `TCB` output and consume each transmit-completion event before the next input poll. Input is read through the stock DCS bit in `CKS` and the original `RCH`/`RSC` operations.

DCS2's guest-side socket-control operations are no-ops in this mode because the listener is configured by `ATTACH DCS` in the SIMH command file.

## Verification

This path was exercised against current upstream SIMH on 31-Aug-2026. The test:

1. built the stock SIMH PDP-1 from upstream source;
2. built Adventure with `SIMH_COMPAT`;
3. generated and attached the local Type 23 drum image;
4. booted the AM1 multi-bank tape through the stock SIMH paper-tape reader;
5. connected through stock SIMH DCS;
6. received the complete Adventure greeting;
7. answered `NO` to the instructions question;
8. entered the starting road room and received its normal description;
9. issued `INVENTORY` and received `YOU ARE EMPTY-HANDED.`

The SIMH revision used for that run was commit `22b6926e` (`22b6926ea6f90a07d7182b5b274f8f9bb69c4f2c`).
