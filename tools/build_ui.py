"""Pack the original game's UI pieces into js/ui_assets.js (same pipeline as 5_LAO_Defence/tools/build_ui.py).

- NGUI atlas sprites (with their 9-slice borders) -> CSS custom properties --s-<key>: url(data:...)
  and window.UIA.s[key] = {w, h, b:[left,right,top,bottom]}
- the game's fonts (GodoB/GodoM for Korean, Exo2 for latin / numbers), subset to the glyphs this game uses
- the LAST ORIGIN logo cut from the loading texture
Everything is inlined so the page keeps working from file://.
  python tools/build_ui.py
"""
import base64
import glob
import io
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "ui_ref"))
import ngui  # noqa: E402

ROOT = ngui.ROOT
OUT = os.path.join(HERE, "..", "js", "ui_assets.js")
PROJ = os.path.join(HERE, "..")

# key: (atlas prefab, sprite name)
SPRITES = {
    # battle banners
    "missionstart": ("BattleAtlas", "UI_Battle_text_missionstart"),
    "battlestart": ("BattleAtlas", "UI_Battle_text_battlestart"),
    "caution_text": ("BattleAtlas", "UI_Battle_Caution_text_1"),
    "caution_f1": ("BattleAtlas", "UI_Battle_Caution_frame_1"),
    "caution_mark": ("BattleAtlas", "UI_Battle_Caution_frame_text_2"),
    # mission clear
    "mc_bg1": ("BattleAtlas", "UI_Battle_Main_missionclear_background_1"),
    "mc_label": ("BattleAtlas", "UI_Battle_Main_missionclear_label_2"),
    "mc_acc": ("BattleAtlas", "UI_Battle_Main_missionclear_acc"),
    "mc_box": ("BattleAtlas", "UI_Battle_Main_missionclear_box"),
    "mc_box2": ("BattleAtlas", "UI_Battle_Main_missionclear_box_2"),
    "star": ("BattleAtlas", "UI_Battle_Main_missionclear_star_fill_2"),
    "star_frame": ("BattleAtlas", "UI_Battle_Main_missionclear_star_frame_2"),
    # buttons
    "btn13": ("BattleAtlas", "UI_btn_13"),
    "btn02": ("masterAtlas_V2", "UI_btn_02_White"),
    "cbtn_y": ("masterAtlas_V2", "UI_Common_Button_01"),
    "cbtn_w": ("masterAtlas_V2", "UI_Common_Button_00"),
    "set_option": ("BattleAtlas", "UI_Battle_set_Btn_option"),
    "set_speed": ("BattleAtlas", "UI_Battle_set_Btn_speed"),
    "ctrl_back": ("BattleAtlas", "UI_Battle_Main_Control_Btn_Withrow"),
    "close": ("masterAtlas_V2", "UI_Button_X_01"),
    "back": ("masterAtlas_V2", "back_Btn"),
    "round_y": ("masterAtlas_V2", "btn_round_yellow"),
    "round_yg": ("masterAtlas_V2", "btn_round_yellow_glow"),
    "round_b": ("masterAtlas_V2", "btn_round_blue"),
    "round_bg": ("masterAtlas_V2", "btn_round_blue_glow"),
    "round_deco": ("masterAtlas_V2", "btn_round_deco"),
    # panels / frames
    "popup_bg": ("masterAtlas_V2", "Bg_Popup_Bg"),
    "popup_title": ("masterAtlas_V2", "Bg_Popup_TitleBg"),
    "popup_deco": ("masterAtlas_V2", "Bg_Popup_Deco"),
    "title_bar": ("masterAtlas_V2", "UI_Title_Bar_01"),
    "deco_title": ("masterAtlas_V2", "deco_title"),
    "glowframe": ("masterAtlas_V2", "frame_box_outline_glow"),
    "sqframe": ("masterAtlas_V2", "Square-frame_1"),
    "sqframe2": ("masterAtlas_V2", "Square-frame_2"),
    "diag_box": ("masterAtlas_V2", "Frame_diagonal_box"),
    "dot3": ("masterAtlas_V2", "Bg_Dot_3"),
    "tabbox": ("masterAtlas_V2", "tab_box_01"),
    "rgrad": ("masterAtlas_V2", "Text_Board_RightGradation_1"),
    "lgrad": ("masterAtlas_V2", "Tab_Bg_LeftGradation_1"),
    "stageinfo": ("masterAtlas_V2", "UI_WolrdMap_StageInfo"),
    "stageinfo_deco": ("masterAtlas_V2", "UI_WolrdMap_StageInfo_Deco"),
    "bar_fill": ("BattleAtlas", "UI_Battle_bar_fill"),
    "bar_frame": ("BattleAtlas", "UI_Battle_bar_frame"),
    "hexframe": ("masterAtlas_V2", "frame_Cha_formation_icon_W"),
    "hexmask": ("masterAtlas_V2", "frame_Cha_formation_icon_mask"),
    "hex_ss": ("masterAtlas_V2", "frame_Cha_formation_icon_SSrank"),
    "hex_y": ("masterAtlas_V2", "ICON_UI_BeconON02"),
    "hex_g": ("masterAtlas_V2", "ICON_UI_BeconOFF"),
    "cf_bg": ("masterAtlas_V2", "UI_Common_CharaFrame_BG"),
    # unit frames by rank (the squad inventory's)
    "cf_B": ("masterAtlas_V2", "UI_CombatReinforInven_CharaFrame_B"),
    "cf_A": ("masterAtlas_V2", "UI_CombatReinforInven_CharaFrame_A"),
    "cf_S": ("masterAtlas_V2", "UI_CombatReinforInven_CharaFrame_S"),
    "cf_SS": ("masterAtlas_V2", "UI_CombatReinforInven_CharaFrame_SS"),
    "cf_add": ("masterAtlas_V2", "UI_CombatReinforInven_CharaFrame_ADD"),
    # dialogue (story)
    "dlg_frame": ("DialogAtlas_v2", "UI_Dialog_Main_CharDialog_Frame_2"),
    "dlg_name": ("DialogAtlas_v2", "UI_Dialog_Main_CharDialog_Frame_CharName_3"),
    "dlg_name2": ("DialogAtlas_v2", "UI_Dialog_Main_CharDialog_Frame_CharName_4"),
    "dlg_arrow": ("DialogAtlas_v2", "UI_Dialog_Main_CharDialog_arrow"),
    "dlg_acc": ("DialogAtlas_v2", "UI_Dialog_Main_CharDialog_acc_2"),
    "dlg_skip": ("DialogAtlas", "UI_Dialog_Main_BG_BTN_Skip"),
    # making (gacha)
    "make_back": ("CharaRewardAtlas", "UI_Make_Back"),
    "eff_back1": ("CharaRewardAtlas", "Effect_Back_1"),
    "eff_star": ("CharaRewardAtlas", "Effect_Back_Star"),
    "making_tab": ("masterAtlas", "TapBtn_SpecialMaking_Active_S"),
    "making_panel": ("masterAtlas", "MakingPenalBG_S"),
    # icons
    "i_tuna": ("masterAtlas_V2", "UI_Icon_Item_Tuna"),
    "i_squad": ("masterAtlas_V2", "Icon_UI_NaviSquad"),
    "i_world": ("masterAtlas_V2", "Icon_UI_NaviWorld"),
    "i_making": ("masterAtlas_V2", "icon_making"),
    "i_battle": ("masterAtlas_V2", "UI_Icon_battle"),
    "i_lock": ("masterAtlas_V2", "lock"),
    "i_check": ("masterAtlas_V2", "UI_Icon_Check"),
    "i_time": ("masterAtlas_V2", "UI_Icon_time"),
    "i_atk": ("masterAtlas_V2", "UI_power"),
    "i_range": ("masterAtlas_V2", "UI_Icon_SkillDistance01"),
    "i_power": ("masterAtlas_V2", "UI_Icon_Power"),
    "i_gear": ("masterAtlas_V2", "UI_Icon_Gear"),
    "i_warning": ("masterAtlas_V2", "UI_Icon_Warning"),
    "i_promote": ("masterAtlas_V2", "icon_promote"),
    "i_medal": ("masterAtlas_V2", "UI_Icon_IW_Medel"),
    "i_plus": ("masterAtlas_V2", "UI_PlusMark"),
    "i_shield": ("masterAtlas_V2", "UI_shield"),
    "i_fire": ("masterAtlas_V2", "UI_Battle_Atktype_fire"),
    "i_resource": ("masterAtlas", "UI_Common_Consumption_resource"),
    "i_together": ("BattleAtlas", "UI_Icon_TogetherAttack"),
    "i_double": ("BattleAtlas", "UI_Icon_DoubleAttack"),
    # rank badges
    "rank_B": ("BattleAtlas", "UI_Icon_CHA_SwordB_Big"),
    "rank_A": ("BattleAtlas", "UI_Icon_CHA_SwordA_Big"),
    "rank_S": ("BattleAtlas", "UI_Icon_CHA_SwordS_Big"),
    "rank_SS": ("BattleAtlas", "UI_Icon_CHA_SwordSS_Big"),
}

# tinted variants (NGUI multiplies white sprites by the widget colour): key: (base, "#rrggbb", alpha)
TINTS = {
    "btn13_y": ("btn13", "#ffcc00", 1), "btn13_o": ("btn13", "#ff6200", 1), "btn13_d": ("btn13", "#2a2e35", 1),
    "btn13_k": ("btn13", "#000000", 0.75), "btn13_b": ("btn13", "#2fb7ff", 1),
    "btn02_y": ("btn02", "#ffcc00", 1), "btn02_d": ("btn02", "#23272e", 1),
    "glowframe_y": ("glowframe", "#ffce00", 1), "dot3_n": ("dot3", "#14262e", 1),
    "rgrad_o": ("rgrad", "#ff7900", 0.7), "rgrad_k": ("rgrad", "#000000", 0.75), "lgrad_k": ("lgrad", "#000000", 0.8),
    "mc_box2_y": ("mc_box2", "#f1b002", 1), "mc_box_k": ("mc_box", "#000000", 0.58),
    "title_bar_k": ("title_bar", "#000000", 0.7), "tabbox_y": ("tabbox", "#ffcc00", 1),
}


def tint(im, hexc, a):
    r, g, b = int(hexc[1:3], 16) / 255, int(hexc[3:5], 16) / 255, int(hexc[5:7], 16) / 255
    ch = im.split()
    lut = lambda f: [min(255, int(i * f + 0.5)) for i in range(256)]
    return Image.merge("RGBA", (ch[0].point(lut(r)), ch[1].point(lut(g)), ch[2].point(lut(b)), ch[3].point(lut(a))))


_atlas_guid = {}


def atlas_by_name(name):
    if name not in _atlas_guid:
        p = ROOT + "/AssetBundleResource/Atlas/" + name + ".prefab"
        _atlas_guid[name] = re.search(r"guid: ([0-9a-f]+)", open(p + ".meta").read()).group(1)
    return ngui.atlas(_atlas_guid[name])


def uri(im, fmt="PNG"):
    buf = io.BytesIO()
    if fmt == "WEBP":
        im.save(buf, "WEBP", lossless=True, quality=100, method=6)
        return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def sprites():
    out = {}
    for key, (an, sn) in SPRITES.items():
        im, s = ngui.sprite_img(atlas_by_name(an), sn)
        if im is None:
            print("  missing sprite", an, sn)
            continue
        b = [int(s.get(k, 0)) for k in ("borderLeft", "borderRight", "borderTop", "borderBottom")]
        out[key] = {"u": uri(im, "WEBP"), "w": im.width, "h": im.height, "b": b, "_im": im}
    for key, (base, c, a) in TINTS.items():
        if base not in out:
            continue
        src = out[base]
        im = tint(src["_im"], c, a)
        out[key] = {"u": uri(im, "WEBP"), "w": im.width, "h": im.height, "b": src["b"], "_im": im}
    for v in out.values():
        v.pop("_im")
    return out


def logo():
    im = Image.open(ROOT + "/AssetBundleResource/Texture/loading_test.png").convert("L")
    box = im.point(lambda v: 255 if v > 40 else 0).getbbox()
    im = im.crop(box)
    rgba = Image.new("RGBA", im.size, (255, 255, 255, 0))
    rgba.putalpha(im)
    return {"u": uri(rgba), "w": rgba.width, "h": rgba.height}


def used_chars():
    chars = set()
    for p in glob.glob(os.path.join(PROJ, "js", "*.js")) + [os.path.join(PROJ, "index.html")]:
        if p.endswith(("assets.js", "ui_assets.js")):
            continue
        chars |= set(open(p, encoding="utf-8").read())
    chars |= set(chr(c) for c in range(0x20, 0x7f))
    chars |= set("…·•→←↑↓★☆♥%×÷±①②③④⑤ⅠⅡⅢ「」『』—～")
    return "".join(sorted(c for c in chars if ord(c) >= 0x20))


def font(path, text):
    from fontTools import subset
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    f = subset.load_font(path, opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(f)
    buf = io.BytesIO()
    subset.save_font(f, buf, opts)
    return "data:font/woff2;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
    sp = sprites()
    text = used_chars()
    fonts = {
        "Godo": [(font(ROOT + "/font/GodoB.ttf", text), 700), (font(ROOT + "/font/GodoM.ttf", text), 400)],
        "Exo2": [(font(ROOT + "/font/Exo2-SemiBold.otf", text), 600), (font(ROOT + "/font/Exo2-Bold.otf", text), 700),
                 (font(ROOT + "/font/Exo2-BlackItalic.otf", text), 900)],
    }
    css = []
    for fam, faces in fonts.items():
        for u, wgt in faces:
            style = "italic" if fam == "Exo2" and wgt == 900 else "normal"
            css.append("@font-face{font-family:'%s';src:url(%s) format('woff2');font-weight:%d;font-style:%s;font-display:block}" % (fam, u, wgt, style))
    css.append(":root{" + "".join("--s-%s:url(%s);" % (k, v["u"]) for k, v in sp.items()) + "}")
    data = {"s": {k: {kk: vv for kk, vv in v.items() if kk != "u"} for k, v in sp.items()}, "logo": logo()}
    js = ("window.UIA=%s;\n(function(){var s=document.createElement('style');s.id='ui-assets';s.textContent=%s;"
          "document.head.appendChild(s);})();\n") % (json.dumps(data, separators=(",", ":")), json.dumps("".join(css)))
    open(OUT, "w", encoding="utf-8").write(js)
    print("ui_assets.js %.2f MB, %d sprites, %d glyphs" % (len(js) / 1e6, len(sp), len(text)))
    for k, v in sp.items():
        print("  %-14s %dx%d slice %s" % (k, v["w"], v["h"], v["b"]))


if __name__ == "__main__":
    main()
    import stamp_build
    stamp_build.main()  # new data -> new service-worker cache
