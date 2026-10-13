# Sketchpad on stock SIMH: preflight

This is a lab note for the eventual stock-SIMH port of Bill Ezell's PDP-1
Sketchpad implementation.  The Sketchpad source is not public in pidp1-mods
yet, so this branch deliberately does not pretend to contain the port.

Bill's 11-Oct-2026 SIMH-list note says the program is over 30K lines of AM1
and uses the Type 340 display, real-time clock, a full complement of PDP-1
core, and Type 550/500 Microtape for picture saves.  His public Drive notes
also identify the light pen as the primary selection device.

## What stock SIMH already has

* PDP-1D #48 mode.
* Up to 64K words of memory (the full 16-bank address space).
* The PDP-1D clock at device 32.
* Type 550/555 DECtape support.  Stock SIMH recognizes the standard
  MSE/MLC/MRD/MWR/MRS IOTs at 720301..720701.
* SDL display infrastructure and a simulator-independent Type 340 engine.

## The important gap

Current stock SIMH does **not** wire the Type 340 engine into the PDP-1
simulator.

The PDP-1 build links PDP1/pdp1_dpy.c, which is the Type 30 point display,
and display/display.c.  It does not link display/type340.c.  PDP-1 IOT
dispatch has no handlers for devices 15, 16, or 17, which are the assignments
used by Bill's Type 340 implementation.

There is a second issue even after adding a PDP-1 wrapper: the generic SIMH
Type 340 engine increments its Display Address Counter with

    u->DAC = (u->DAC + 1) & 07777;

so sequential display-list execution wraps at 4K.  Bill's PDP-1 Type 340 DLA
accepts a full 16-bit address, and Sketchpad uses the full 64K machine.  A
stock-SIMH adapter therefore needs a host-selectable/full-PDP-1 DAC mask,
while retaining the Type 347 subroutine instruction's historical narrower
address field.

## Microtape caution

The core Type 550 IOT numbers overlap cleanly with stock SIMH, which is
promising.  Bill's implementation also has a non-standard MMT convenience
IOT for mounting images; stock SIMH does not.  His documentation explicitly
notes timing/behavior differences between his Microtape model and SIMH's
model.  Until Sketchpad source is released, picture-save compatibility should
be treated as a separate validation item rather than assumed.

## Port plan when source lands

1. Add a PDP-1 host wrapper for SIMH's reusable Type 340 engine at IOTs
   15/16/17, alongside (not replacing) the existing Type 30 DPY device.
2. Make the Type 340 DAC mask host-configurable and use the PDP-1 16-bit
   mask for sequential fetching.
3. Enable the Type 342 character generator and Type 347 subroutine option.
4. Implement DLA, DRS, DCF, DRA, DRC, and the DSP/DSS/DSV/DSH combined
   skips with Bill's PDP-1 semantics.
5. Validate light-pen coordinate and resume behavior.  Treat Bill's DRP
   motion-prediction IOT as optional/non-standard compatibility work.
6. Assemble Sketchpad with current AM1 and run first without picture-save
   operations, then validate Type 550 image/timing behavior separately.
7. Test actual 64K cross-bank display lists, not merely a bank-0 demo.

The CI workflow on this branch is a preflight guard: it builds current stock
SIMH PDP-1, exercises its 64K/clock/DECtape configuration, and verifies that
the Type 340 integration gaps described above still exist.  Once upstream
SIMH changes, a failing preflight is a signal to re-inspect rather than blindly
carrying old assumptions forward.
