all: adventure.rim
	cd $(RINGDIR) && $(MAKE) install

GENDIR = AdvDataLoader
RINGDIR = DecoderRing
DRUM   = /opt/pidp1-mods/pdp23drum
SIMH_DRUM ?= simh-drum.img
SIMH_BANK_USAGE ?= bank-usage-simh.txt

AM1 = am1
adventure.rim: adventure.am1 adv_defines.ah
	$(AM1) -S adventure.am1 | tee bank-usage.txt
	@rm -f bank-usage.txt

# Stock SIMH compatibility build. Generate the current Adventure include/data
# set exactly as the native build does, but load it into a local drum image
# instead of modifying /opt/pidp1-mods/pdp23drum.
.PHONY: simh-data
adventure-simh: adventure-simh.rim

adventure-simh.rim: adventure.am1 simh-data
	$(AM1) -DSIMH_COMPAT -S adventure.am1 | tee $(SIMH_BANK_USAGE)
	mv adventure.rim adventure-simh.rim
	@rm -f $(SIMH_BANK_USAGE)

simh-data: loaders
	@mkdir Includes 2>/dev/null || true
	$(GENDIR)/advdataloader -o Includes $(GENDIR)/adventure.adv
	./advdrumloader -i $(SIMH_DRUM) advtracks.drm

adv_defines.ah: $(GENDIR)/adventure.adv loaders
	@mkdir Includes 2>/dev/null || true
	$(GENDIR)/advdataloader -o Includes $(GENDIR)/adventure.adv
	./advdrumloader advtracks.drm

loaders:
	cd $(GENDIR) && $(MAKE) install

clean:
	@rm -f adventure.rim adventure-simh.rim simh-drum.img adventure.sym adventure.lst \
	    advdataloader advdrumloader advsave wz \
	    adv_msgtab.ah adv_roomtab.ah adv_drumlayout.ah adv_objdefs.ah \
	    *.ac advtracks.drm bank-usage.txt bank-usage-simh.txt 2>/dev/null || true
	@rm -rf Includes advtracks.drm 2>/dev/null || true
	cd $(GENDIR) && $(MAKE) clean
	cd $(RINGDIR) && $(MAKE) clean
