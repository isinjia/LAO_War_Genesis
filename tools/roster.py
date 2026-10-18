"""The playable roster: game unit id -> Unity model (keep in step with js/data.js UNITS).
Shared by build_sd.py (rigs), build_events.py (attack timing) and build_assets.py (portraits)."""

UNITS = {
    # B
    "brownie": "BR_Brownie_N", "leprechaun": "BR_Leprechaun_N", "gnome": "BR_Gnome_N", "impet": "BR_Impet_N",
    "daphne": "3P_Daphne_N",
    # A
    "banshee": "BR_Banshee_N", "sylphid": "BR_Sylphid_N", "raven": "BR_Raven_N", "nymph": "BR_Nymph_N",
    "amy": "BR_Amy_N", "andvari": "BR_Andvari_N",
    # S
    "phoenix": "BR_Phoenix_N", "thetis": "BR_Thetis_N", "hraesvelgr": "BR_Hraesvelgr_N", "undine": "BR_Undine_N",
    "valkyrie": "BR_Valkyrie_N",
    # SS (gacha only)
    "zero": "DS_KunoichiZero_N", "hela": "BR_Hela_N", "azazel": "DS_Azazel_N", "saraqael": "DS_Saraqael_N",
    "leona": "BR_Leona_N", "ullr": "ST_Ullr_N", "harpy": "BR_Harpy_N", "eternity": "3P_Eternity_N",
    "lemonadealpha": "PECS_LemonadeAlpha_N", "sleipnir": "BR_Sleipnir_N", "blacklilith": "3P_BlackLilith_N",
    "cyclopsprincess": "PECS_CyclopsePrincess_N", "blindprincess": "PECS_BlindPrincess_N", "brunhild": "BR_Brunhild_N",
    "tiamat": "ST_Tiamat_N", "khan": "BR_Khan_N", "labiata": "3P_Labiata_N", "lrl": "PECS_LRL_N",
    "constantia": "3P_ConstantiaS2_N", "titania": "3P_Titania_N", "mercury": "ST_Mercury_N", "empress": "PECS_Empress_N",
    "fafnir": "BR_Fafnir_N", "ramiel": "DS_Ramiel_N",
}
