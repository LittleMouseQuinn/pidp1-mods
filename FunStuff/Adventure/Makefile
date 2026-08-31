all: adventure.rim
	cd $(RINGDIR) && $(MAKE) install

GENDIR = AdvDataLoader
RINGDIR = DecoderRing
DRUM   = /opt/pidp1-mods/pdp23drum
SIMH_DRUM ?= simh-drum.img

adventure.rim: adventure.am1 adv_msgtab.ah skipmacros.ah
	am1 adventure.am1
	advdrumloader advtracks.drm

# Stock SIMH build.  This deliberately writes a local drum image instead of
# modifying the pidp1-mods live drum under /opt.
adventure-simh: adventure-simh.rim $(SIMH_DRUM)

adventure-simh.rim: adventure.am1 adv_msgtab.ah skipmacros.ah
	am1 -DSIMH_COMPAT adventure.am1
	mv adventure.rim adventure-simh.rim

$(SIMH_DRUM): advtracks.drm
	./advdrumloader -i $(SIMH_DRUM) advtracks.drm

# advdataloader emits advtracks.drm together with the generated includes.
advtracks.drm: adv_msgtab.ah
	@test -f advtracks.drm

# One rule regenerates the whole generated-include set + the track data; the
# other ten outputs ride along with adv_msgtab.ah (single generator run).
adv_msgtab.ah: $(GENDIR)/adventure.adv loaders
	$(GENDIR)/advdataloader $(GENDIR)/adventure.adv

loaders:
	cd $(GENDIR) && $(MAKE) install

clean:
	@rm -f adventure.rim adventure-simh.rim simh-drum.img \
	    advdataloader advdrumloader wz \
	    adv_msgtab.ah adv_roomtab.ah adv_drumlayout.ah adv_objdefs.ah \
	    *.ac advtracks.drm 2>/dev/null || true
	cd $(GENDIR) && $(MAKE) clean
	cd $(RINGDIR) && $(MAKE) clean
