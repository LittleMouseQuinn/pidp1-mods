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
- DCS2 echo/socket modification requests become compatibility no-ops.
- Connection startup can use the same deliberate first-character handshake
  proven by the Adventure work; a browser proxy can send it automatically.

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

This is a real compatibility seam.

pidp1-mods ZMachine uses the BBN countdown interface: arm a 100 ms countdown
with `cct`, poll `cks`, and test `cctcks`.

Stock SIMH's PDP-1 clock is a free-running counter with periodic interrupts;
it does not implement the same BBN countdown IOT interface.

The preferred compatibility goal is to preserve timed reads using the stock
clock rather than simply deleting timed input. A `SIMH_COMPAT` timing shim
can poll elapsed stock-clock counts and present the same tenth-second behavior
to `zReadKey`.

## Bring-up order

1. Add a guarded stock-SIMH DCS path without altering native DCS2 behavior.
2. Build the unchanged interpreter plus compatibility path with current AM1.
3. Boot a V3 story first (Zork I is the initial target) and prove terminal
   connect, terminal query/fallback, command input, output, quit, and a second
   connection.
4. Attach a stock-SIMH Type 550/555 image on drive 2 and prove SAVE and
   RESTORE independently.
5. Add the stock-clock timed-read shim and test a V5 story that actually uses
   timed input.
6. Only after those bounded proofs, add automated end-to-end tests.

## Rule

Do not patch stock SIMH merely because pidp1-mods and stock SIMH differ.
Compatibility assumptions belong in the guest-side `SIMH_COMPAT` path unless
a reproducible simulator defect is isolated separately.
