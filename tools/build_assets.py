"""Icons, backgrounds and sounds from the Last Origin Unity project.

Images are embedded as data URIs in js/assets.js (WebGL textures then work from file:// too).
Sounds are copied as files (ffmpeg, when present, turns the WAVs into mp3).

Usage: python tools/build_assets.py
"""
import base64
import io
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

SRC = r"E:/LAO_Google_QA/Assets/AssetBundleResource"
TEX = SRC + "/Texture"
SND = SRC + "/Sounds"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# unit id -> FormationIcon model (tools/roster.py)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roster import UNITS  # noqa: E402
ENEMIES = """NightChick_N Drone_N Legion_N Fallen_N Centurion_N Gigantes_N Intruder_N Phalangites_N Rampart_N
Juggernaut_N BigChick_N Fortress_N Destroyer_N EmperorChick_N Executioner_EW IronPrince_N""".split()

BG = {
    "bg_field": "BGImg/BG_7_1.png",
    "bg_city": "BGImg/BG_09_1.png",
    "bg_base": "BGImg/BG_5_1_1.png",
    "bg_title": "BGImg/BG_13_1.png",
}

SFX = {
    "rifle": "SFX/Common/Atk/Shot/atk_Rifle-1.wav",
    "gun": "SFX/Common/Atk/Shot/atk_gun_1.wav",
    "mg": "SFX/Common/Atk/Shot/atk_machinegun_small.wav",
    "cannon": "SFX/Common/Atk/Shot/atk_cannon_small.wav",
    "missile": "SFX/Common/Atk/Shot/atk_missile.wav",
    "laser": "SFX/Common/Atk/Shot/atk_laser_small.wav",
    "laserBig": "SFX/Common/Atk/Shot/atk_laser_big.wav",
    "elec": "SFX/Common/Atk/Energy/atk_elec.wav",
    "beam": "SFX/Common/Atk/Energy/atk_Beam1.wav",
    "charge": "SFX/Common/Atk/Energy/cast_charge_fast_03.wav",
    "swing": "SFX/Common/Atk/Swing/Swing_4.wav",
    "slash": "SFX/Common/Atk/Swing/CHR_SW_At_Act_Sword_ML_7.mp3",
    "expS": "SFX/Common/Explosion/explosion_small.wav",
    "expM": "SFX/Common/Explosion/explosion_mid.wav",
    "expB": "SFX/Common/Explosion/explosion_big.wav",
    "deploy": "SFX/UI/generate_B.wav",
    "coin": "SFX/UI/collect_coin_03.wav",
    "levelup": "SFX/UI/Reinforce_unit.wav",
    "start": "SFX/UI/battle_start.wav",
    "win": "SFX/UI/battle_win.wav",
    "clear": "SFX/UI/stage_clear.wav",
    "warning": "SFX/UI/Warning_infinite.wav",
    "click": "SFX/UI/Join_Search.wav",
    "fail": "SFX/comedy/QuestionMark.wav",
    "handgun": "SFX/Common/Atk/Shot/atk_handgun.wav",
    "spray": "SFX/Common/Atk/Shot/spray.wav",
    "ice": "SFX/effect/ice_effect.wav",
    "energy": "SFX/Common/Atk/Energy/energy_large_02.wav",
    "genA": "SFX/UI/generate_A.wav",
    "genS": "SFX/UI/generate_S.wav",
    "genSS": "SFX/UI/generate_SS.wav",
    "pickSS": "SFX/UI/pick_SS.wav",
    "rankUp": "SFX/UI/Rank_UP_SS.mp3",
    "purchase": "SFX/UI/item_purchase.wav",
}
BGM = {
    "title": "BGM/01 BGM_Title.mp3",
    "lobby": "BGM/02 BGM_Lobby.mp3",
    "battle": "BGM/03 BGM_Battle_01.mp3",
    "battle2": "BGM/05 BGM_Battle_02.mp3",
    "battle3": "BGM/12 BGM_Battle_03.mp3",
    "battle4": "BGM/22 BGM_Battle_04.mp3",
    "boss": "BGM/04 BGM_Battle_Boss_01.mp3",
    "boss2": "BGM/06 BGM_Battle_Boss_02.mp3",
    "boss3": "BGM/31 BGM_Battle_Boss_03.mp3",
    "ironprince": "BGM/28 BGM_IronPrince.mp3",
    "talk": "BGM/07 BGM_Talk_01.mp3",
    "talk2": "BGM/08 BGM_Talk_02.mp3",
    "thrill": "BGM/21 BGM_Thrill_01.mp3",
    "ending": "BGM/44 BGM_MemoryofTime.mp3",
    "defeat": "BGM/47 BGM_GrayClouds.mp3",
}


# original effect textures (AssetBundleResource/FX): key -> (path, output size, frame columns, frame rows)
FX_DIR = SRC + "/FX"
FXTEX = {
    "hit": ("character_prefab/fafnir_skill/Fafnir_ns1_skill/skill2/eff_fafnir_ns1_Hit_Dager_2x2.png", 512, 2, 2),
    "smoke": ("character_prefab/KunoichiEnrai_skill/NS1/2x2_Smoke_Sprite_0243 1.png", 512, 2, 2),
    "aura": ("enemy_prefab/MP_ravager_skill/Up_aura_Explosion_2x2_Sprite 1.png", 512, 2, 2),
    "bolt": ("character_prefab/koyori_skill/Labiata_NS1_lighting_2x2_Sprite_01 1.png", 512, 2, 2),
    "spark": ("character_prefab/Alcyone_skill/4X4_Spark_01 1.png", 128, 2, 2),
    "slash": ("character_prefab/charybdis_skill/N/skill 2/eff_charybdis_N_skill2_slash.png", (512, 256), 2, 2),
    "burst": ("character_prefab/Khan_skill/NS5/skill 1/eff_Khan_NS5_skill1_hit.png", 256, 1, 1),
    "flash": ("character_prefab/hela_skill/Flash 1.png", 128, 1, 1),
    "blue": ("character_prefab/koyori_skill/Fire_Hit_Sprite_2x2 1.png", 512, 2, 2),
}


def data_uri(im, fmt="WEBP", quality=88):
    buf = io.BytesIO()
    im.save(buf, fmt, quality=quality, method=6)
    return "data:image/%s;base64,%s" % (fmt.lower(), base64.b64encode(buf.getvalue()).decode())


def fit(path, size, mode="RGBA"):
    im = Image.open(path).convert(mode)
    if isinstance(size, int):
        size = (size, size)
    return im.resize(size, Image.LANCZOS)


def scaled(path, w, mode="RGB"):
    im = Image.open(path).convert(mode)
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


FULL_DIR = r"E:/LAO_Google_QA/Assets/AssetBundleResourceSub/Texture/FullbodyImg"
VOICE_DIR = SND + "/Voice"


def fullbody(model):
    """The unit's full-body illustration in its base outfit (the one its battle rig wears); none when that picture
    only exists split into parts. Skins are not used: the page falls back to the portrait."""
    p = FULL_DIR + "/FullbodyIMG_%s.png" % model
    return p if os.path.exists(p) else None


def level_voice(src, dst):
    """Character lines at the effects' loudness (-16 LUFS), mono 64k."""
    ff = ffmpeg_exe()
    if not ff:
        return shutil.copyfile(src, dst)
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", src, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1",
                    "-b:a", "64k", dst], check=True)


def build_gallery():
    """assets/full/<id>.webp (illustration, cropped, 900 px tall) and assets/voice/<id>.mp3 (the "join" line)."""
    import glob
    fdir, vdir = os.path.join(OUT, "assets", "full"), os.path.join(OUT, "assets", "voice")
    os.makedirs(fdir, exist_ok=True)
    os.makedirs(vdir, exist_ok=True)
    voices = {os.path.basename(p).lower(): p for p in glob.glob(VOICE_DIR + "/**/*_Join.mp3", recursive=True)}
    full, voice, bark = {}, {}, {}
    for uid, model in UNITS.items():
        p = fullbody(model)
        if p:
            im = Image.open(p).convert("RGBA")
            im = im.crop(im.getbbox())
            k = min(1.0, 900 / im.height)
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            im.save(os.path.join(fdir, uid + ".webp"), "WEBP", quality=86, method=6)
            full[uid] = "assets/full/%s.webp" % uid
        base = model[:-2] if model.endswith("_N") else model
        v = voices.get(("voice_%s_join.mp3" % base).lower())
        if v:
            level_voice(v, os.path.join(vdir, uid + ".mp3"))
            voice[uid] = "assets/voice/%s.mp3" % uid
        # battle barks: deploy (SortiePick), skill (BattleFocus), win (MVP)
        for kind, line in (("deploy", "SortiePick"), ("skill", "BattleFocus"), ("win", "MVP")):
            src = os.path.join(os.path.dirname(v), "Voice_%s_%s.mp3" % (base, line)) if v else None
            if src and os.path.exists(src):
                level_voice(src, os.path.join(vdir, "%s_%s.mp3" % (uid, kind)))
                bark.setdefault(uid, {})[kind] = "assets/voice/%s_%s.mp3" % (uid, kind)
    return full, voice, bark


def ffmpeg_exe():
    """ffmpeg on PATH, else the binary bundled with the imageio-ffmpeg package (pip install imageio-ffmpeg)."""
    for exe in ("ffmpeg",):
        try:
            subprocess.run([exe, "-version"], capture_output=True, check=True)
            return exe
        except Exception:  # noqa: BLE001
            pass
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return None


def main():
    images = {}
    for uid, model in UNITS.items():
        images["u_" + uid] = data_uri(fit(TEX + "/FormationIcon/FormationIcon_%s.png" % model, 192), quality=85)
    for e in ENEMIES:
        images["e_" + e] = data_uri(fit(TEX + "/TbarIcon/TbarIcon_MP_%s.png" % e, 96))
    fxmeta = {}
    for k, (p, size, cols, rows) in FXTEX.items():
        im = Image.open(FX_DIR + "/" + p).convert("RGBA")
        if im.getextrema()[3][0] == 255:  # opaque on black (drawn additively in the game): luminance -> alpha
            from PIL import ImageChops
            a = im.convert("L")
            im.putalpha(a)
        images["fx_" + k] = data_uri(im.resize(size if isinstance(size, tuple) else (size, size), Image.LANCZOS), quality=90)
        fxmeta[k] = [cols, rows]
    images["_fxmeta"] = fxmeta
    for k, p in BG.items():
        images[k] = data_uri(scaled(TEX + "/" + p, 1600 if k == "bg_title" else 1024), quality=80)

    os.makedirs(os.path.join(OUT, "js"), exist_ok=True)
    ff = ffmpeg_exe()
    sounds, music = {}, {}
    for folder, table, dst in (("sfx", SFX, sounds), ("bgm", BGM, music)):
        d = os.path.join(OUT, "assets", folder)
        os.makedirs(d, exist_ok=True)
        for k, p in table.items():
            ext = os.path.splitext(p)[1].lower()
            if ff:  # every sound levelled (EBU R128): effects / voices -16 LUFS, music -21 LUFS under them
                level = "loudnorm=I=-16:TP=-1.5:LRA=11" if folder == "sfx" else "loudnorm=I=-21:TP=-2:LRA=11"
                out = os.path.join(d, k + ".mp3")
                subprocess.run([ff, "-y", "-loglevel", "error", "-i", SND + "/" + p, "-af", level, "-ar", "44100"]
                               + (["-ac", "1", "-b:a", "96k"] if folder == "sfx" else ["-b:a", "128k"]) + [out], check=True)
                ext = ".mp3"
            else:
                shutil.copyfile(SND + "/" + p, os.path.join(d, k + ext))
            dst[k] = "assets/%s/%s%s" % (folder, k, ext)
    with open(os.path.join(OUT, "js", "assets.js"), "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_assets.py - do not edit by hand.\n")
        f.write("window.IMG = " + json.dumps(images, indent=0) + ";\n")
        f.write("window.SND = " + json.dumps(sounds, indent=0) + ";\n")
        f.write("window.BGM = " + json.dumps(music, indent=0) + ";\n")
    full, voice, bark = build_gallery()
    with open(os.path.join(OUT, "js", "assets.js"), "a", encoding="utf-8") as f:
        f.write("window.FULL = " + json.dumps(full, indent=0) + ";\n")
        f.write("window.VOICE = " + json.dumps(voice, indent=0) + ";\n")
        f.write("window.BARK = " + json.dumps(bark, separators=(",", ":")) + ";\n")
    print("illustrations:", len(full), "voices:", len(voice), "barks:", sum(len(v) for v in bark.values()))
    print("images:", len(images), "sfx:", len(sounds), "bgm:", len(music), "(mp3)" if ff else "(wav kept)")


if __name__ == "__main__":
    main()
    import stamp_build
    stamp_build.main()  # new data -> new service-worker cache
