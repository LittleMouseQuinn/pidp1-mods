# Adventure on stock SIMH

This branch carries the stock-SIMH compatibility path for the current
`wjenh/pidp1-mods` Adventure source.

Stock SIMH already provides the PDP-1D CPU features, the Type 23 parallel
drum, and a TMXR-backed Type 630 DCS. The compatibility gap is the guest-side
DCS2 socket/status interface: stock SIMH implements the original Type 630
character IOTs and leaves listener setup to the simulator console.

The `SIMH_COMPAT` build keeps Bill's normal DCS2 path unchanged and adapts
only that interface.

## Build

From `FunStuff/Adventure`, with the current AM1 assembler installed:

```sh
make adventure-simh
```

The target produces:

- `adventure-simh.rim`
- `simh-drum.img`

The SIMH target deliberately loads the generated Adventure data into the
local `simh-drum.img`; it does not write the normal
`/opt/pidp1-mods/pdp23drum` image.

## Run

```sh
pdp1 adventure-simh.ini
```

Then connect to port 2030 and send one initial character (an Enter is fine).
Stock SIMH has no guest-visible TCP-connected status bit, so that first
received character is used only as the session-start indication.

The supplied configuration sets sense switch 5. Adventure's documented SS5
behavior disables closing time and the other time-dependent paths, avoiding
the nonstandard Chrono-Log clock IOT while running under stock SIMH.

## Compatibility details

Under `SIMH_COMPAT`:

- DCS2 socket-control operations become no-ops because `ATTACH DCS` owns the
  listener.
- `dsfcon` / `dsfrdy` map to stock SIMH's DCS scanner-ready bit.
- the initial SSB path consumes the session-start scanner event.
- TCB waits for and consumes its transmit-completion scanner event.
- `getach` polls the stock DCS scanner and reads through the original
  RCH/RSC operations.

Normal pidp1-mods builds still include the native DCS2 definitions unchanged.

## Verification history

The original compatibility implementation was exercised on 31-Aug-2026
against stock SIMH commit
`22b6926ea6f90a07d7182b5b274f8f9bb69c4f2c`: Adventure booted, printed the
complete greeting, accepted `NO` at the instructions question, entered the
starting-road room, and returned `YOU ARE EMPTY-HANDED.` for `INVENTORY`.

This September rebase starts from Bill's current upstream after the large
Adventure/AM1/DCS updates. The branch includes an automated build and stock
SIMH smoke test so the rebased path is not presented upstream as verified
until that current-code test passes.
