# ZMachine on stock SIMH — Eve lab notes

Branch: `eve/zmachine-stock-simh-lab`  
Baseline: wjenh/pidp1-mods `a639f42f6ab1232f769652063c95d6303a804ac4`

This branch is an independent compatibility investigation. It does not imply
an upstream commitment from Bill. Native pidp1-mods behavior should remain
unchanged outside explicit `SIMH_COMPAT` guards.

## First-pass device audit

### Type 630 DCS

The main incompatibility is DCS2's guest-side socket control. Stock SIMH owns
the listener from the simulator console and exposes the original Type 630
character IOTs.

Adventure's stock-SIMH compatibility layer is a useful starting point, but it
cannot be copied into ZMachine unchanged. ZMachine emits many characters with
bare `tcc`. In stock SIMH the receive and transmit paths share the per-line
buffer and scanner flag, so the compatibility path must serialize transmit
completion and protect against receive/transmit races.

ZMachine's session lifecycle should map naturally to stock SIMH once listener
ownership is moved outside the guest:

- `zTextDcsOpen`: wait for a session-start indication rather than open/bind.
- `zTextDcsNext`: leave the externally attached listener in place and wait
  for the next session-start indication rather than rebind.
- Connection startup can use the same deliberate first-character handshake
  proven by the Adventure work; a browser proxy can send it automatically.

#### Echo is a real compatibility constraint

Stock SIMH's PDP-1 DCS line device exposes terminal mode modifiers
(`UC`, `7B`, `8B`, `7P`) but no `NOECHO` control. Its receive service
unconditionally echoes each received character back through TMXR.

That differs materially from ZMachine's DCS2 path. ZMachine turns DCS2 echo
off while reading and then performs deliberate application-side echo/editing,
including backspace erasure, line redraw after timed-read interrupts, and
suppression of bytes it chooses not to store.

Therefore DCS2 echo modification cannot simply become a no-op while leaving
all of ZMachine's bare echo `tcc` operations intact, or normal input will be
double-echoed.

Initial options to test:

1. direct stock-SIMH terminal mode: under `SIMH_COMPAT`, suppress ordinary
   application-side character echo and compensate only where the stock echo
   is insufficient (for example erase completion and final LF);
2. browser/proxy mode: let the proxy know which bytes it injected and suppress
   the stock DCS echo on the network side, preserving ZMachine's own echo
   semantics;
3. avoid terminal capability queries initially under `SIMH_COMPAT`, using
   the existing 24x80 plain-terminal defaults, because stock DCS would echo
   terminal response escape sequences back to the client.

The direct-terminal path should be judged separately from the browser path;
do not claim identical DCS2 terminal semantics until it is actually proven.

### Type 550/555 Microtape

This looks substantially better than expected.

Stock SIMH's PDP-1 DECtape implementation is explicitly Type 550/555. Its IOT
pulse map includes MSE and MLC in the same positions used by pidp1-mods, and
the status register bits ZMachine actually tests line up with the stock
controller:

- data flag
- block-end flag
- error flag
- end-of-tape
- bit-13 tape error condition
- reverse
- GO
- the remaining controller error bits

ZMachine save/restore uses `mse`, `mlc`, `mrs`, `mrd`, and `mwr`;
it does not require DCS2-style guest-side file mounting. The working hypothesis
is therefore that save/restore can run with little or no guest-code patching
if stock SIMH has the appropriate tape attached externally to drive 2 and the
image is in SIMH's 18-bit format.

That hypothesis must be tested, not assumed.

### Clock / timed input

This is a real compatibility seam, but there is a clean stock-SIMH primitive
to build it from.

pidp1-mods ZMachine uses the BBN countdown interface: arm a 100 ms countdown
with `cct`, poll `cks`, and test `cctcks`.

Stock SIMH does not implement that BBN countdown interface. However, both
pidp1-mods and stock SIMH expose `RCK` as PDP-1 IOT 32. Stock SIMH's
`pdp1_clk.c` maintains a 0..59999 counter at an effective one millisecond
per count and returns it through `RCK`.

That means `SIMH_COMPAT` does not need an instruction-count delay and does
not need to remove timed input. The compatibility path can preserve
ZMachine's existing tenth-second model by:

1. recording the current `RCK` value whenever the native path would arm
   `cct` for 100 ms;
2. polling `RCK` while waiting for input;
3. computing elapsed milliseconds, adding 60000 when the subtraction crosses
   the one-minute counter wrap;
4. treating elapsed >= 100 as the native `cctcks` event and reusing the
   existing `zrkTick` / escape-sequence state machine.

This also preserves the important behavior where an ESC sequence gets its own
100 ms window and where a partially elapsed tenth can be handed from one
`zReadKey` call to the next. The shim will need one persistent start-count
word for that running tenth; it must not be an ephemeral local recreated on
each call.

Stock SIMH's clock device must be enabled in the simulator configuration.
The native BBN-clock path stays unchanged when `SIMH_COMPAT` is not defined.

## CI baseline

The lab branch has its own GitHub Actions workflow,
`.github/workflows/zmachine-stock-simh.yml`.

Before compatibility code lands it establishes two invariants:

- current native ZMachine still builds with Bill's current AM1 and produces
  `zmachine.rim` plus `zloader`;
- pinned stock SIMH PDP-1
  `47b7ddabbe5b548cfc32f2fd45f7bed238ff7921` still builds, and the source
  audit confirms the shared RCK target used by the timed-read plan.

The first run was started by commit
`66e3dc406df47b74ea253eefeea0dca714e5aed0`.

## First stock-SIMH boot proof

GitHub Actions run `35776400651`, at lab commit
`5a01a8f1fec9d6bfc19be3a1123d7bfbe363f8cc`, produced the first successful
ZMachine gameplay proof on unmodified stock SIMH
`47b7ddabbe5b548cfc32f2fd45f7bed238ff7921`.

The run:

- built native ZMachine unchanged;
- built the guarded `SIMH_COMPAT` image;
- created a stock Type 23 drum image containing the included Zork I V3 story;
- booted that image on stock SIMH with PDP-1D #48 and the full 64K-word
  memory space;
- connected through stock Type 630 DCS on port 2031;
- printed the Zork I banner and initial West of House description;
- accepted `LOOK` and printed the West of House description again.

The first successful transcript also exposed the two expected terminal
differences clearly: stock SIMH echoed each typed character in addition to
ZMachine's application echo (`LOOK` appeared doubled), and stock Type 630
delivered CR/LF separately, so the LF became a second empty command.  Those are
now regression targets, not unknowns.

The earlier "undefined instruction" stop at extended address `174215` was
not a missing PDP-1D instruction.  The assembly map identified the word as
`LEM` at `zSessionReset`; the stock-SIMH configuration had accidentally
copied Adventure's 16K memory setting.  ZMachine occupies banks 0 through 15,
so the correct stock-SIMH configuration is 64K words.

## Bring-up order

1. Keep native ZMachine green in the lab CI.
2. Add a guarded stock-SIMH DCS path without altering native DCS2 behavior.
3. Build the interpreter with `SIMH_COMPAT`.
4. Boot a V3 story first (Zork I is the initial target) and prove terminal
   connect, plain terminal input/output, quit, and a second connection.
5. Attach a stock-SIMH Type 550/555 image on drive 2 and prove SAVE and
   RESTORE independently.
6. Add the RCK-backed timed-read shim and test a V5 story that actually uses
   timed input.
7. Revisit full terminal capability-query behavior after the basic stock-DCS
   path is stable.
8. Only after those bounded proofs, add automated end-to-end gameplay tests.

## Rule

Do not patch stock SIMH merely because pidp1-mods and stock SIMH differ.
Compatibility assumptions belong in the guest-side `SIMH_COMPAT` path unless
a reproducible simulator defect is isolated separately.
