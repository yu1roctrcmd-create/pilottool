#!/usr/bin/env python3
"""
Circling Approach Calculator
サークリングアプローチ計算ツール  NCA 飛行訓練支援

起動: streamlit run circling_approach/app.py
"""
import math
import io
import base64
import json
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

# ───────────────────── 定数 ─────────────────────────────────────────────────
G_FTS2   = 32.174
KT_TO_FTS = 1.68781

# ───────────────────── 速度テーブル ─────────────────────────────────────────
# VREF (KIAS) — Based on 10000ft reference pressure altitude
# Weight (1000 LB): Flap30, Flap25
VREF_TABLE = {
    1000: {"F30": 186, "F25": 190},
     950: {"F30": 181, "F25": 184},
     900: {"F30": 175, "F25": 179},
     850: {"F30": 170, "F25": 173},
     800: {"F30": 165, "F25": 168},
     750: {"F30": 160, "F25": 163},
     700: {"F30": 154, "F25": 158},
     650: {"F30": 148, "F25": 152},
     600: {"F30": 142, "F25": 145},
     550: {"F30": 136, "F25": 138},
     500: {"F30": 129, "F25": 132},
     450: {"F30": 122, "F25": 125},
}

# Flap Maneuver Speed (KIAS) — Sea Level Pressure Altitude
# Weight (1000 LB): UP, F1, F5, F10, F20, F25, F30
FLAP_MAN_TABLE = {
    1000: {"UP": 264, "F1": 243, "F5": 223, "F10": 203, "F20": 193, "F25": 190, "F30": 186},
     950: {"UP": 258, "F1": 238, "F5": 218, "F10": 200, "F20": 188, "F25": 184, "F30": 181},
     900: {"UP": 254, "F1": 233, "F5": 213, "F10": 196, "F20": 183, "F25": 179, "F30": 175},
     850: {"UP": 249, "F1": 228, "F5": 208, "F10": 193, "F20": 178, "F25": 173, "F30": 170},
     800: {"UP": 243, "F1": 223, "F5": 203, "F10": 190, "F20": 174, "F25": 168, "F30": 165},
     750: {"UP": 239, "F1": 219, "F5": 199, "F10": 186, "F20": 172, "F25": 163, "F30": 160},
     700: {"UP": 234, "F1": 214, "F5": 193, "F10": 180, "F20": 166, "F25": 158, "F30": 154},
     650: {"UP": 228, "F1": 208, "F5": 188, "F10": 173, "F20": 160, "F25": 152, "F30": 148},
     600: {"UP": 222, "F1": 202, "F5": 182, "F10": 166, "F20": 153, "F25": 145, "F30": 142},
     550: {"UP": 216, "F1": 196, "F5": 175, "F10": 158, "F20": 147, "F25": 138, "F30": 136},
     500: {"UP": 209, "F1": 189, "F5": 169, "F10": 151, "F20": 140, "F25": 132, "F30": 129},
     450: {"UP": 205, "F1": 185, "F5": 164, "F10": 144, "F20": 134, "F25": 125, "F30": 122},
}

FLAP_KEYS = ["UP", "F1", "F5", "F10", "F20", "F25", "F30"]
VREF_FLAP_KEYS = ["F25", "F30"]
WEIGHTS_LB = sorted(VREF_TABLE.keys())  # 450..1000


def interpolate_speed(table: dict, weight_1000lb: float, flap_key: str) -> int:
    """重量（1000 LB）でテーブルを線形補間して速度を返す。"""
    weights = sorted(table.keys())
    w = weight_1000lb
    if w <= weights[0]:
        return table[weights[0]][flap_key]
    if w >= weights[-1]:
        return table[weights[-1]][flap_key]
    for i in range(len(weights) - 1):
        w0, w1 = weights[i], weights[i + 1]
        if w0 <= w <= w1:
            v0, v1 = table[w0][flap_key], table[w1][flap_key]
            return int(round(v0 + (v1 - v0) * (w - w0) / (w1 - w0)))
    return table[weights[-1]][flap_key]
FT_PER_NM = 6076.12

# ───────────────────── ユーティリティ ────────────────────────────────────────
def turn_radius_nm(spd_kt: float, bank_deg: float) -> float:
    v = spd_kt * KT_TO_FTS
    return v**2 / (G_FTS2 * math.tan(math.radians(bank_deg))) / FT_PER_NM

def brg_dist_to_en(brg_deg: float, dist_nm: float):
    """Bearing + distance → (East, North) nm"""
    r = math.radians(brg_deg)
    return dist_nm * math.sin(r), dist_nm * math.cos(r)

def en_to_brg_dist(e: float, n: float):
    """(East, North) → (bearing_deg, dist_nm)  VOR at origin"""
    dist = math.hypot(e, n)
    brg  = math.degrees(math.atan2(e, n)) % 360
    return brg, dist

def right_perp_en(hdg_deg: float):
    """右側垂直ベクトル (E,N)"""
    r = math.radians(hdg_deg)
    return math.cos(r), -math.sin(r)

def arc_en(cx, cy, R, start_math_deg, end_math_deg, clockwise, n=120):
    """
    数学角（+E軸=0°、反時計方向正）で円弧を返す。
    clockwise=True → 時計回り（右旋回）
    """
    if clockwise:
        while end_math_deg >= start_math_deg:
            end_math_deg -= 360.0
    else:
        while end_math_deg <= start_math_deg:
            end_math_deg += 360.0
    a = np.linspace(start_math_deg, end_math_deg, n)
    return cx + R * np.cos(np.radians(a)), cy + R * np.sin(np.radians(a))

def math_angle(e: float, n: float) -> float:
    """点(e,n)のベクトルが原点からなす数学角(度)"""
    return math.degrees(math.atan2(n, e))

# ───────────────────── メイン計算 ─────────────────────────────────────────────
def compute(
    thr_brg: float,     # VOR → Threshold 方位 (°)
    thr_dist: float,    # VOR → Threshold 距離 (nm)
    fac: float,         # Final Approach Course (inbound heading, °)
    rwy_hdg: float,     # 着陸滑走路方位 (°)
    turn_dir: str,      # 'right' or 'left'
    dw_width: float,    # ダウンウインド幅 (nm)
    R_break: float,     # Break 旋回半径 (nm)
    R_bt: float,        # Base Turn 旋回半径 (nm)
    R_ft: float,        # Final Turn 旋回半径 (nm)
    dw_speed: float,    # DW 対地速度 (kt) — タイミング計算用
    final_dist: float,  # ファイナル開始距離 THR から (nm)
):
    """
    座標系: VOR = (0,0), 東 = +E, 北 = +N  [nm]
    """
    sign = 1 if turn_dir == 'right' else -1      # right=+1, left=-1

    # ── スレッショルド ─────────────────────────────────────────────────────
    thr_e, thr_n = brg_dist_to_en(thr_brg, thr_dist)

    # ── 滑走路方位ベクトル ─────────────────────────────────────────────────
    rwy_r  = math.radians(rwy_hdg)
    rwy_e  = math.sin(rwy_r)   # 着陸方向単位ベクトル East
    rwy_n  = math.cos(rwy_r)   # 着陸方向単位ベクトル North

    # ダウンウインドの側（Right circuit → +sign, Left → −sign に滑走路から横にオフセット）
    perp_e = sign * math.cos(rwy_r)    # 右垂直 East
    perp_n = -sign * math.sin(rwy_r)   # 右垂直 North

    # ── ダウンウインドヘッディング / ベースヘッディング ─────────────────────
    dw_hdg   = (rwy_hdg + 180) % 360
    # Right circuit: DW→Base は右旋回90°
    #   右旋回90°: DW_HDG + 90 (clockwise) 正確には heading が +90° 増える
    base_hdg = (dw_hdg + 90 * sign) % 360

    # ── ①ファイナルターン逆算 ─────────────────────────────────────────────
    # ft_exit = THR の手前 final_dist、滑走路中心線上
    ft_exit_e = thr_e - rwy_e * final_dist
    ft_exit_n = thr_n - rwy_n * final_dist

    rpe_rwy, rpn_rwy = right_perp_en(rwy_hdg)
    ft_cen_e = ft_exit_e + sign * R_ft * rpe_rwy
    ft_cen_n = ft_exit_n + sign * R_ft * rpn_rwy

    rpe_base, rpn_base = right_perp_en(base_hdg)
    ft_entry_e = ft_cen_e - sign * R_ft * rpe_base
    ft_entry_n = ft_cen_n - sign * R_ft * rpn_base

    # ── ② DW トラック（固定幅 dw_width）& BT Entry 算出 ─────────────────
    # DW トラック基準点: THR から横に dw_width だけオフセット
    dw_ref_e = thr_e + perp_e * dw_width
    dw_ref_n = thr_n + perp_n * dw_width

    u_dw_e = math.sin(math.radians(dw_hdg))
    u_dw_n = math.cos(math.radians(dw_hdg))

    rpe_dw, rpn_dw = right_perp_en(dw_hdg)

    # BT 変位: bt_exit = bt_entry + delta_bt
    delta_bt_e = sign * R_bt * (rpe_dw - rpe_base)
    delta_bt_n = sign * R_bt * (rpn_dw - rpn_base)

    # 制約: bt_exit と ft_entry が base_hdg 方向で繋がる
    #   (ft_entry - bt_exit) · right_perp(base_hdg) = 0
    #   bt_exit = dw_ref + t*u_dw + delta_bt
    #   → t = (ft_entry - dw_ref - delta_bt) · rpe_base
    #           / (u_dw · rpe_base)
    num_t = ((ft_entry_e - dw_ref_e - delta_bt_e) * rpe_base
             + (ft_entry_n - dw_ref_n - delta_bt_n) * rpn_base)
    den_t = u_dw_e * rpe_base + u_dw_n * rpn_base
    t_dw  = num_t / den_t if abs(den_t) > 1e-9 else 0.0

    bt_entry_e = dw_ref_e + t_dw * u_dw_e
    bt_entry_n = dw_ref_n + t_dw * u_dw_n

    # ── ③ Base Turn 弧 ────────────────────────────────────────────────────
    bt_cen_e = bt_entry_e + sign * R_bt * rpe_dw
    bt_cen_n = bt_entry_n + sign * R_bt * rpn_dw
    bt_exit_e = bt_cen_e - sign * R_bt * rpe_base
    bt_exit_n = bt_cen_n - sign * R_bt * rpn_base

    # ── ④ Base Leg（直線区間）────────────────────────────────────────────
    # bt_exit → ft_entry が base_hdg 方向の直線（長さゼロも可）
    base_leg_length = math.hypot(ft_entry_e - bt_exit_e,
                                  ft_entry_n - bt_exit_n)

    # ── ⑤ Break 旋回逆算 ─────────────────────────────────────────────────
    # Break 旋回: approach (fac) → dw_hdg
    delta = (dw_hdg - fac) % 360
    break_left = delta > 180
    brk_sign = -1 if break_left else 1

    rpe_fac, rpn_fac = right_perp_en(fac)

    # DW トラック法線
    dw_norm_e = -u_dw_n
    dw_norm_n = u_dw_e

    # DW track 基準点 = dw_ref（固定 dw_width）
    dw_track_ref_e = dw_ref_e
    dw_track_ref_n = dw_ref_n

    cen_off_e = brk_sign * rpe_fac
    cen_off_n = brk_sign * rpn_fac

    exit_cen_off_e = brk_sign * rpe_dw
    exit_cen_off_n = brk_sign * rpn_dw

    sum_e = cen_off_e - exit_cen_off_e
    sum_n = cen_off_n - exit_cen_off_n

    fac_out = (fac + 180) % 360
    app_e = math.sin(math.radians(fac_out))
    app_n = math.cos(math.radians(fac_out))

    A = app_e * dw_norm_e + app_n * dw_norm_n
    B = (dw_track_ref_e * dw_norm_e + dw_track_ref_n * dw_norm_n
         - R_break * (sum_e * dw_norm_e + sum_n * dw_norm_n))

    D_break = B / A if abs(A) > 1e-9 else 0.0

    brk_e = D_break * app_e
    brk_n = D_break * app_n

    brk_cen_e = brk_e + R_break * cen_off_e
    brk_cen_n = brk_n + R_break * cen_off_n

    dw_entry_e = brk_cen_e - R_break * exit_cen_off_e
    dw_entry_n = brk_cen_n - R_break * exit_cen_off_n

    # ── ④降下開始点（FAF or Break と同じ位置として扱う） ──────────────────
    descent_e = brk_e
    descent_n = brk_n

    # ── ⑤ダウンウインド タイミング ─────────────────────────────────────────
    dw_length = math.hypot(dw_entry_e - bt_entry_e, dw_entry_n - bt_entry_n)
    dw_time_sec = (dw_length / dw_speed) * 3600 if dw_speed > 0 else 0

    # Abeam Threshold 点: THR から DW track に下ろした垂線の足
    # DW 方向単位ベクトル
    dw_dir_e2 = math.sin(math.radians(dw_hdg))
    dw_dir_n2 = math.cos(math.radians(dw_hdg))
    # THR → DW Entry ベクトルの DW 方向成分 (DW は dw_entry から bt_entry へ向かう)
    t_proj = ((thr_e - dw_entry_e) * dw_dir_e2
              + (thr_n - dw_entry_n) * dw_dir_n2)
    abeam_e = dw_entry_e + t_proj * dw_dir_e2
    abeam_n = dw_entry_n + t_proj * dw_dir_n2
    # Abeam から BT Start までの DW 上の距離
    abeam_to_bt = math.hypot(abeam_e - bt_entry_e, abeam_n - bt_entry_n)
    abeam_time_sec = (abeam_to_bt / dw_speed) * 3600 if dw_speed > 0 else 0

    # ── ⑥弧の点列 ────────────────────────────────────────────────────────
    def _arc(cen_e, cen_n, R, h_in, h_out, cw):
        s = math_angle(brk_e - cen_e, brk_n - cen_n)  # dummy start
        # use entry/exit from center
        return None  # overridden below

    def make_arc(cen_e, cen_n, R, from_e, from_n, to_e, to_n, cw):
        sa = math_angle(from_e - cen_e, from_n - cen_n)
        ea = math_angle(to_e - cen_e, to_n - cen_n)
        return arc_en(cen_e, cen_n, R, sa, ea, cw)

    # Break arc: break_left=True → CCW, False → CW
    brk_arc_x, brk_arc_y = make_arc(brk_cen_e, brk_cen_n, R_break,
                                     brk_e, brk_n,
                                     dw_entry_e, dw_entry_n,
                                     not break_left)

    # Base turn arc: right circuit=CW, left=CCW
    bt_arc_x, bt_arc_y = make_arc(bt_cen_e, bt_cen_n, R_bt,
                                   bt_entry_e, bt_entry_n,
                                   bt_exit_e, bt_exit_n,
                                   turn_dir == 'right')

    # Final turn arc
    ft_arc_x, ft_arc_y = make_arc(ft_cen_e, ft_cen_n, R_ft,
                                   ft_entry_e, ft_entry_n,
                                   ft_exit_e, ft_exit_n,
                                   turn_dir == 'right')

    # ── ⑦VOR DME / Radial ────────────────────────────────────────────────
    def vor_info(e, n, label):
        brg, dist = en_to_brg_dist(e, n)
        radial = (brg + 180) % 360   # TO bearing → Radial
        return {"地点": label,
                "VOR DME (nm)": round(dist, 2),
                "VOR Bearing": f"{brg:.0f}°",
                "VOR Radial": f"R-{radial:.0f}°"}

    wps = [
        vor_info(brk_e,      brk_n,      "Break Point（旋回開始）"),
        vor_info(dw_entry_e, dw_entry_n, "DW Entry（ダウンウインド開始）"),
        vor_info(bt_entry_e, bt_entry_n, "Base Turn Start（ベースターン開始）"),
        vor_info(bt_exit_e,  bt_exit_n,  "Final Turn Entry（ファイナルターン入口）"),
        vor_info(ft_exit_e,  ft_exit_n,  "Final Start（ファイナル開始）"),
        vor_info(thr_e,      thr_n,      "Threshold（スレッショルド）"),
    ]

    return {
        # キーポイント座標
        "thr":        (thr_e, thr_n),
        "break_pt":   (brk_e, brk_n),
        "dw_entry":   (dw_entry_e, dw_entry_n),
        "bt_entry":   (bt_entry_e, bt_entry_n),
        "bt_exit":    (bt_exit_e, bt_exit_n),
        "ft_entry":   (ft_entry_e, ft_entry_n),
        "ft_exit":    (ft_exit_e, ft_exit_n),
        # 弧
        "brk_arc":    (brk_arc_x, brk_arc_y),
        "bt_arc":     (bt_arc_x, bt_arc_y),
        "ft_arc":     (ft_arc_x, ft_arc_y),
        # 情報
        "D_break":    D_break,
        "dw_length":      dw_length,
        "dw_time":        dw_time_sec,
        "abeam_pt":       (abeam_e, abeam_n),
        "abeam_to_bt":    abeam_to_bt,
        "abeam_time":     abeam_time_sec,
        "wps":        wps,
        # パラメータ
        "fac":        fac,
        "rwy_hdg":    rwy_hdg,
        "dw_hdg":     dw_hdg,
        "base_hdg":   base_hdg,
        "turn_dir":   turn_dir,
        "R_break":    R_break,
        "R_bt":       R_bt,
        "R_ft":       R_ft,
        "dw_width":        dw_width,
        "base_leg_length": base_leg_length,
        "final_dist":      final_dist,
    }


# ───────────────────── LDA / Base Turn to Final 計算 ──────────────────────
def compute_lda(
    thr_brg: float,    # VOR → Threshold 方位 (°)
    thr_dist: float,   # VOR → Threshold 距離 (nm)
    fac: float,        # Final Approach Course / inbound heading (°)
    rwy_hdg: float,    # 着陸滑走路方位 (°)
    turn_dir: str,     # 'right' or 'left'  (MAP での旋回方向)
    map_dist: float,   # MAP の VOR DME 距離 (nm)
    R_bt: float,       # Base Turn 旋回半径 (nm)
    final_dist: float, # ファイナル開始距離 (nm from THR)  ※Direct Turn時は無視
    base_leg: float,   # MAP から outbound に飛ぶ Base Leg 距離 (nm)  0 = Direct Turn at MAP
):
    """
    LDA / Base Turn to Final パターン。
    - base_leg > 0: MAP → base_leg outbound → Base Turn → Final
    - base_leg = 0: Direct Turn at MAP（FAC inbound → 即ターン → Final）
    座標系: VOR = (0,0), 東 = +E, 北 = +N [nm]
    """
    sign = 1 if turn_dir == 'right' else -1

    # スレッショルド
    thr_e, thr_n = brg_dist_to_en(thr_brg, thr_dist)

    # 滑走路方位ベクトル
    rwy_r = math.radians(rwy_hdg)
    rwy_e = math.sin(rwy_r)
    rwy_n = math.cos(rwy_r)

    # FAC outbound 方向
    fac_out = (fac + 180) % 360
    fac_out_e = math.sin(math.radians(fac_out))
    fac_out_n = math.cos(math.radians(fac_out))

    # MAP 位置（fac inbound track 上、VOR から fac 方向に map_dist）
    map_e, map_n = brg_dist_to_en(fac, map_dist)

    # 滑走路方向の右垂直ベクトル
    rpe_rwy, rpn_rwy = right_perp_en(rwy_hdg)

    # Direct Turn モード判定
    direct_turn = (base_leg < 0.01)

    if direct_turn:
        # ── Direct Turn at MAP ─────────────────────────────────────────────
        # 機体は FAC (inbound) で MAP に到達し、そのまま旋回して Final へ
        bt_entry_e, bt_entry_n = map_e, map_n

        # 旋回中心 = MAP + sign * R_bt * right_perp(fac)
        #   （FAC inbound 方向の右垂直 = 右旋回なら右側）
        rpe_fac, rpn_fac = right_perp_en(fac)
        bt_cen_e = bt_entry_e + sign * R_bt * rpe_fac
        bt_cen_n = bt_entry_n + sign * R_bt * rpn_fac

        # Final Start = 旋回中心から rwy_hdg 方向の左垂直（出口）
        ft_exit_e = bt_cen_e - sign * R_bt * rpe_rwy
        ft_exit_n = bt_cen_n - sign * R_bt * rpn_rwy

    else:
        # ── Standard: outbound Base Leg → Base Turn ───────────────────────
        # ファイナル Start (THR 手前 final_dist)
        ft_exit_e = thr_e - rwy_e * final_dist
        ft_exit_n = thr_n - rwy_n * final_dist

        # Base Turn 旋回中心（出口から逆算）
        bt_cen_e = ft_exit_e + sign * R_bt * rpe_rwy
        bt_cen_n = ft_exit_n + sign * R_bt * rpn_rwy

        # BT Entry = MAP から fac_out 方向に base_leg 進んだ点
        bt_entry_e = map_e + fac_out_e * base_leg
        bt_entry_n = map_n + fac_out_n * base_leg

    # ── Base Turn 弧 ───────────────────────────────────────────────────────
    def make_arc(cen_e, cen_n, R, from_e, from_n, to_e, to_n, cw):
        sa = math_angle(from_e - cen_e, from_n - cen_n)
        ea = math_angle(to_e - cen_e, to_n - cen_n)
        return arc_en(cen_e, cen_n, R, sa, ea, cw)

    bt_arc_x, bt_arc_y = make_arc(
        bt_cen_e, bt_cen_n, R_bt,
        bt_entry_e, bt_entry_n,
        ft_exit_e, ft_exit_n,
        turn_dir == 'right',
    )

    leg_length = 0.0 if direct_turn else base_leg

    # ── VOR DME / Radial ────────────────────────────────────────────────
    def vor_info(e, n, label):
        brg, dist = en_to_brg_dist(e, n)
        radial = (brg + 180) % 360
        return {"地点": label,
                "VOR DME (nm)": round(dist, 2),
                "VOR Bearing": f"{brg:.0f}°",
                "VOR Radial": f"R-{radial:.0f}°"}

    wps = [
        vor_info(map_e,      map_n,      "MAP / Break Point"),
        vor_info(bt_entry_e, bt_entry_n, "Base Turn Entry"),
        vor_info(ft_exit_e,  ft_exit_n,  "Final Start"),
        vor_info(thr_e,      thr_n,      "Threshold"),
    ]

    return {
        "thr":          (thr_e, thr_n),
        "map_pt":       (map_e, map_n),
        "bt_entry":     (bt_entry_e, bt_entry_n),
        "bt_exit":      (ft_exit_e, ft_exit_n),
        "ft_exit":      (ft_exit_e, ft_exit_n),
        "bt_arc":       (bt_arc_x, bt_arc_y),
        "leg_length":   leg_length,
        "base_leg":     base_leg,
        "direct_turn":  direct_turn,
        "fac":          fac,
        "fac_out":      fac_out,
        "rwy_hdg":      rwy_hdg,
        "turn_dir":     turn_dir,
        "R_bt":         R_bt,
        "final_dist":   final_dist,
        "map_dist":     map_dist,
        "wps":          wps,
    }


# ───────────────────── Jeppesen チャート OCR ──────────────────────────────
def extract_chart_params(image_bytes: bytes, api_key: str):
    """
    Jeppesen アプローチチャート画像から計算に必要なパラメータを抽出する。
    Claude claude-opus-4-6 の vision を使用。
    成功時: dict, 失敗時: None
    """
    client = anthropic.Anthropic(api_key=api_key)
    image_b64 = base64.standard_b64encode(image_bytes).decode()

    prompt = """あなたは航空計器進入チャート（Jeppesen）の専門家です。
このチャート画像から以下の数値を正確に読み取り、JSON形式で返してください。

抽出する項目:
- vor_ident: VOR識別符号 (例: "SWE", "KKJ")
- thr_brg: VORから着陸滑走路スレッショルドへの方位 (°, 0-360)
- thr_dist: VORからスレッショルドまでの距離 (nm, DME値)
- fac: Final Approach Course / インバウンドコース (°, 例: 274)
- rwy_hdg: 着陸滑走路方位 (°, 例: 360)
- turn_dir: 回路旋回方向 ("right" または "left")
- dw_width: ダウンウインド幅の推定値 (nm, 不明なら 1.5)

チャートを注意深く見て:
1. VOR局の識別符号と周波数を確認
2. Final Approach Course (FAC) は太い矢印の方位
3. 着陸滑走路番号×10でほぼ滑走路方位
4. DME距離はチャート上の数字（例: D1.0, D9.5など）
5. 回路パターンの向き（右回りか左回りか）

必ず以下の形式のみで回答してください（説明不要）:
{
  "vor_ident": "...",
  "thr_brg": 数値,
  "thr_dist": 数値,
  "fac": 数値,
  "rwy_hdg": 数値,
  "turn_dir": "right" または "left",
  "dw_width": 数値,
  "notes": "読み取れなかった項目や不確かな点のメモ"
}"""

    with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image_b64,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }],
    ) as stream:
        text = stream.get_final_message().content[0].text

    # JSON 部分だけ抽出
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start == -1 or end == 0:
        return None
    return json.loads(text[start:end])


# ───────────────────── 図の作成 ────────────────────────────────────────────
def make_figure(r: dict, show_grid: bool, vor_ident: str,
                rwy_length_nm: float = 0.5) -> go.Figure:
    thr_e, thr_n       = r["thr"]
    brk_e, brk_n       = r["break_pt"]
    dwe_e, dwe_n       = r["dw_entry"]
    bte_e, bte_n       = r["bt_entry"]
    btx_e, btx_n       = r["bt_exit"]
    fte_e, fte_n       = r["ft_entry"]
    ftx_e, ftx_n       = r["ft_exit"]
    brk_ax, brk_ay     = r["brk_arc"]
    bt_ax, bt_ay       = r["bt_arc"]
    ft_ax, ft_ay       = r["ft_arc"]
    rwy_r              = math.radians(r["rwy_hdg"])
    fac_r              = math.radians(r["fac"])
    fac_out            = (r["fac"] + 180) % 360
    fac_out_r          = math.radians(fac_out)

    fig = go.Figure()

    # ── 滑走路（THR から着陸方向に rwy_length_nm）─────────────────────────
    fig.add_trace(go.Scatter(
        x=[thr_e, thr_e + math.sin(rwy_r) * rwy_length_nm],
        y=[thr_n, thr_n + math.cos(rwy_r) * rwy_length_nm],
        mode="lines", name="Runway",
        line=dict(color="lightgray", width=8),
    ))
    # 滑走路端マーカー (反対側 THR)
    opp_thr_e = thr_e + math.sin(rwy_r) * rwy_length_nm
    opp_thr_n = thr_n + math.cos(rwy_r) * rwy_length_nm
    fig.add_trace(go.Scatter(
        x=[opp_thr_e], y=[opp_thr_n],
        mode="markers",
        marker=dict(symbol="triangle-left", size=10, color="lightgray"),
        name="Opp THR", showlegend=False,
    ))

    # ── アプローチトラック（Break point の手前 8nm まで）──────────────────
    fac_far = 8.0
    fig.add_trace(go.Scatter(
        x=[brk_e + math.sin(fac_out_r) * fac_far, brk_e],
        y=[brk_n + math.cos(fac_out_r) * fac_far, brk_n],
        mode="lines", name="Approach Track",
        line=dict(color="steelblue", width=1.5, dash="dash"),
    ))

    # ── Break 旋回弧 ──────────────────────────────────────────────────────
    fig.add_trace(go.Scatter(
        x=brk_ax, y=brk_ay,
        mode="lines", name="Break Turn",
        line=dict(color="darkorange", width=2.5),
    ))

    # ── ダウンウインド ────────────────────────────────────────────────────
    fig.add_trace(go.Scatter(
        x=[dwe_e, bte_e], y=[dwe_n, bte_n],
        mode="lines", name="Down Wind",
        line=dict(color="mediumseagreen", width=2.5),
    ))

    # ── ベースターン弧 ────────────────────────────────────────────────────
    fig.add_trace(go.Scatter(
        x=bt_ax, y=bt_ay,
        mode="lines", name="Base Turn",
        line=dict(color="coral", width=2.5),
    ))

    # ── Base Leg（直線区間、存在する場合）────────────────────────────────
    base_leg_length = r.get("base_leg_length", 0.0)
    if base_leg_length > 0.02:
        btx_e, btx_n = r["bt_exit"]
        fte_e, fte_n = r["ft_entry"]
        fig.add_trace(go.Scatter(
            x=[btx_e, fte_e], y=[btx_n, fte_n],
            mode="lines", name="Base Leg",
            line=dict(color="yellow", width=2.5),
        ))

    # ── ファイナルターン弧 ────────────────────────────────────────────────
    fig.add_trace(go.Scatter(
        x=ft_ax, y=ft_ay,
        mode="lines", name="Final Turn",
        line=dict(color="mediumpurple", width=2.5),
    ))

    # ── ファイナルアプローチ ──────────────────────────────────────────────
    fig.add_trace(go.Scatter(
        x=[ftx_e, thr_e], y=[ftx_n, thr_n],
        mode="lines", name="Final",
        line=dict(color="hotpink", width=2.5),
    ))

    # ── VOR シンボル ──────────────────────────────────────────────────────
    fig.add_trace(go.Scatter(
        x=[0], y=[0],
        mode="markers+text",
        marker=dict(symbol="hexagram", size=16, color="royalblue",
                    line=dict(color="navy", width=1.5)),
        text=[f"{vor_ident}"], textposition="top right",
        name=f"VOR {vor_ident}",
        showlegend=False,
    ))

    # ── スレッショルド ────────────────────────────────────────────────────
    fig.add_trace(go.Scatter(
        x=[thr_e], y=[thr_n],
        mode="markers+text",
        marker=dict(symbol="triangle-right", size=14, color="black"),
        text=["THR"], textposition="top right",
        name="Threshold", showlegend=False,
    ))

    # ── キーポイント + VOR DME / Radial アノテーション ───────────────────
    pts = [
        (brk_e, brk_n, "BREAK", "red"),
        (dwe_e, dwe_n, "DW Entry", "seagreen"),
        (bte_e, bte_n, "BT Start", "coral"),
        (ftx_e, ftx_n, "Final Start", "mediumpurple"),
    ]
    for pe, pn, label, col in pts:
        brg, dist = en_to_brg_dist(pe, pn)
        radial = (brg + 180) % 360
        ann_text = f"{label}<br>R-{radial:.0f} / D{dist:.1f}"
        fig.add_trace(go.Scatter(
            x=[pe], y=[pn],
            mode="markers+text",
            marker=dict(symbol="circle", size=10, color=col),
            text=[ann_text], textposition="top center",
            name=label, showlegend=False,
            textfont=dict(size=10, color=col),
        ))

    # Abeam Threshold 点
    abm_e, abm_n = r["abeam_pt"]
    fig.add_trace(go.Scatter(
        x=[abm_e], y=[abm_n],
        mode="markers+text",
        marker=dict(symbol="diamond", size=12, color="yellow",
                    line=dict(color="orange", width=1.5)),
        text=["ABEAM THR<br>▶ TIME IN"],
        textposition="middle left",
        name="Abeam THR", showlegend=False,
        textfont=dict(size=10, color="yellow"),
    ))

    # ── 北矢印 ────────────────────────────────────────────────────────────
    all_e = np.concatenate([[brk_e], brk_ax, bt_ax, ft_ax, [thr_e, 0]])
    all_n = np.concatenate([[brk_n], brk_ay, bt_ay, ft_ay, [thr_n, 0]])
    e_min, e_max = float(all_e.min()) - 0.3, float(all_e.max()) + 0.3
    n_min, n_max = float(all_n.min()) - 0.3, float(all_n.max()) + 0.5

    north_e = e_min + 0.5
    north_n = n_max - 0.5
    arrow_len = 0.4
    fig.add_annotation(
        x=north_e, y=north_n + arrow_len,
        ax=north_e, ay=north_n,
        xref="x", yref="y", axref="x", ayref="y",
        showarrow=True, arrowhead=2, arrowsize=1.5,
        arrowwidth=2, arrowcolor="white",
        text="N", font=dict(size=13, color="white"),
    )

    fig.update_layout(
        title=dict(text="Circling Approach — キーポイント計算結果",
                   font=dict(size=18, color="white")),
        xaxis=dict(
            title="East (nm)", range=[e_min, e_max],
            zeroline=True, zerolinecolor="rgba(255,255,255,0.3)", zerolinewidth=1,
            tickfont=dict(color="white"), title_font=dict(color="white"),
        ),
        yaxis=dict(
            title="North (nm)", range=[n_min, n_max],
            scaleanchor="x", scaleratio=1,
            zeroline=True, zerolinecolor="rgba(255,255,255,0.3)", zerolinewidth=1,
            tickfont=dict(color="white"), title_font=dict(color="white"),
        ),
        showlegend=True,
        legend=dict(x=0.01, y=0.99,
                    bgcolor="rgba(0,0,80,0.7)",
                    font=dict(color="white")),
        height=680,
        hovermode="closest",
        plot_bgcolor="navy",
        paper_bgcolor="navy",
    )
    if show_grid:
        fig.update_xaxes(showgrid=True, gridcolor="rgba(255,255,255,0.15)", dtick=0.5)
        fig.update_yaxes(showgrid=True, gridcolor="rgba(255,255,255,0.15)", dtick=0.5)

    return fig


# ───────────────────── LDA 図の作成 ───────────────────────────────────────
def make_figure_lda(r: dict, show_grid: bool, vor_ident: str,
                    rwy_length_nm: float = 0.5) -> go.Figure:
    thr_e, thr_n   = r["thr"]
    map_e, map_n   = r["map_pt"]
    bte_e, bte_n   = r["bt_entry"]
    ftx_e, ftx_n   = r["ft_exit"]
    bt_ax, bt_ay   = r["bt_arc"]
    rwy_r          = math.radians(r["rwy_hdg"])
    fac_out_r      = math.radians((r["fac"] + 180) % 360)

    fig = go.Figure()

    # 滑走路
    fig.add_trace(go.Scatter(
        x=[thr_e, thr_e + math.sin(rwy_r) * rwy_length_nm],
        y=[thr_n, thr_n + math.cos(rwy_r) * rwy_length_nm],
        mode="lines", name="Runway",
        line=dict(color="lightgray", width=8),
    ))

    # アプローチトラック (MAP より手前 10nm)
    fac_far = 10.0
    fig.add_trace(go.Scatter(
        x=[map_e + math.sin(fac_out_r) * fac_far, map_e],
        y=[map_n + math.cos(fac_out_r) * fac_far, map_n],
        mode="lines", name="Approach Track",
        line=dict(color="steelblue", width=1.5, dash="dash"),
    ))

    # MAP → BT Entry leg
    if r["leg_length"] > 0.05:
        fig.add_trace(go.Scatter(
            x=[map_e, bte_e], y=[map_n, bte_n],
            mode="lines", name="Outbound Leg",
            line=dict(color="yellow", width=2.0, dash="dot"),
        ))

    # Base Turn 弧
    fig.add_trace(go.Scatter(
        x=bt_ax, y=bt_ay,
        mode="lines", name="Base Turn",
        line=dict(color="coral", width=2.5),
    ))

    # Final
    fig.add_trace(go.Scatter(
        x=[ftx_e, thr_e], y=[ftx_n, thr_n],
        mode="lines", name="Final",
        line=dict(color="hotpink", width=2.5),
    ))

    # VOR
    fig.add_trace(go.Scatter(
        x=[0], y=[0],
        mode="markers+text",
        marker=dict(symbol="hexagram", size=16, color="royalblue",
                    line=dict(color="navy", width=1.5)),
        text=[vor_ident], textposition="top right",
        name=f"VOR {vor_ident}", showlegend=False,
    ))

    # THR
    fig.add_trace(go.Scatter(
        x=[thr_e], y=[thr_n],
        mode="markers+text",
        marker=dict(symbol="triangle-right", size=14, color="white"),
        text=["THR"], textposition="top right",
        name="Threshold", showlegend=False,
        textfont=dict(color="white"),
    ))

    # MAP
    map_brg, map_dist = en_to_brg_dist(map_e, map_n)
    map_radial = (map_brg + 180) % 360
    fig.add_trace(go.Scatter(
        x=[map_e], y=[map_n],
        mode="markers+text",
        marker=dict(symbol="circle", size=12, color="red"),
        text=[f"MAP / BREAK<br>R-{map_radial:.0f} / D{map_dist:.1f}"],
        textposition="top right",
        name="MAP", showlegend=False,
        textfont=dict(size=10, color="red"),
    ))

    # Final Start
    fs_brg, fs_dist = en_to_brg_dist(ftx_e, ftx_n)
    fs_radial = (fs_brg + 180) % 360
    fig.add_trace(go.Scatter(
        x=[ftx_e], y=[ftx_n],
        mode="markers+text",
        marker=dict(symbol="circle", size=10, color="mediumpurple"),
        text=[f"Final Start<br>R-{fs_radial:.0f} / D{fs_dist:.1f}"],
        textposition="bottom left",
        name="Final Start", showlegend=False,
        textfont=dict(size=10, color="mediumpurple"),
    ))

    # 北矢印
    all_e = np.concatenate([[map_e, thr_e, bte_e, ftx_e, 0], bt_ax])
    all_n = np.concatenate([[map_n, thr_n, bte_n, ftx_n, 0], bt_ay])
    e_min, e_max = float(all_e.min()) - 0.5, float(all_e.max()) + 0.5
    n_min, n_max = float(all_n.min()) - 0.5, float(all_n.max()) + 0.5
    north_e = e_min + 0.5
    north_n = n_max - 0.5
    fig.add_annotation(
        x=north_e, y=north_n + 0.4, ax=north_e, ay=north_n,
        xref="x", yref="y", axref="x", ayref="y",
        showarrow=True, arrowhead=2, arrowsize=1.5,
        arrowwidth=2, arrowcolor="white",
        text="N", font=dict(size=13, color="white"),
    )

    fig.update_layout(
        title=dict(text="LDA / Base Turn to Final — キーポイント計算結果",
                   font=dict(size=18, color="white")),
        xaxis=dict(title="East (nm)", range=[e_min, e_max],
                   zeroline=True, zerolinecolor="rgba(255,255,255,0.3)",
                   tickfont=dict(color="white"), title_font=dict(color="white")),
        yaxis=dict(title="North (nm)", range=[n_min, n_max],
                   scaleanchor="x", scaleratio=1,
                   zeroline=True, zerolinecolor="rgba(255,255,255,0.3)",
                   tickfont=dict(color="white"), title_font=dict(color="white")),
        showlegend=True,
        legend=dict(x=0.01, y=0.99, bgcolor="rgba(0,0,80,0.7)",
                    font=dict(color="white")),
        height=620,
        hovermode="closest",
        plot_bgcolor="navy",
        paper_bgcolor="navy",
    )
    if show_grid:
        fig.update_xaxes(showgrid=True, gridcolor="rgba(255,255,255,0.15)", dtick=0.5)
        fig.update_yaxes(showgrid=True, gridcolor="rgba(255,255,255,0.15)", dtick=0.5)
    return fig


# ───────────────────── Streamlit UI ──────────────────────────────────────────
def main():
    st.set_page_config(
        page_title="Circling Approach Calculator",
        page_icon="✈",
        layout="wide",
    )
    st.title("✈  Circling Approach Calculator")
    st.caption("サークリングアプローチ  旋回開始・降下開始ポイント計算ツール  |  NCA飛行訓練支援")

    # ── OCR: Jeppesenチャート自動読み取り ─────────────────────────────────
    # session_state でOCR結果を保持し、フォームのデフォルト値に反映
    ocr_defaults = st.session_state.get("ocr_defaults", {})

    with st.expander("📷 Jeppesenチャートから自動読み取り（OCR）", expanded=not bool(ocr_defaults)):
        if not ANTHROPIC_AVAILABLE:
            st.warning("`pip install anthropic` を実行してください。")
        else:
            api_key = st.text_input(
                "Anthropic API Key",
                type="password",
                help="ANTHROPIC_API_KEY。入力しない場合は環境変数を使用します。",
                value="",
            )
            chart_file = st.file_uploader(
                "Jeppesenチャート画像をアップロード",
                type=["jpg", "jpeg", "png", "webp"],
                help="アプローチチャート全体が写った画像を使用してください。",
            )

            if chart_file and st.button("🔍 チャートを読み取る", type="primary"):
                effective_key = api_key.strip() or None
                import os
                effective_key = effective_key or os.environ.get("ANTHROPIC_API_KEY", "")
                if not effective_key:
                    st.error("API Key を入力するか、環境変数 ANTHROPIC_API_KEY を設定してください。")
                else:
                    with st.spinner("Claudeがチャートを解析中…"):
                        try:
                            result = extract_chart_params(chart_file.read(), effective_key)
                            if result:
                                st.session_state["ocr_defaults"] = result
                                st.success("読み取り完了！下のパラメータに反映されました。")
                                if result.get("notes"):
                                    st.info(f"📝 注記: {result['notes']}")
                                st.json({k: v for k, v in result.items() if k != "notes"})
                                st.rerun()
                            else:
                                st.error("パラメータを抽出できませんでした。チャートを確認してください。")
                        except Exception as e:
                            st.error(f"エラー: {e}")

            if ocr_defaults:
                if st.button("🗑 読み取り結果をクリア"):
                    st.session_state.pop("ocr_defaults", None)
                    st.rerun()

    # ── サイドバー ─────────────────────────────────────────────────────────
    with st.sidebar:
        st.header("⚙ アプローチ設定")

        if ocr_defaults:
            st.success("📷 チャートOCR値反映済み")

        # ── ① アプローチ種別 ─────────────────────────────────────────────
        st.subheader("① アプローチ種別")
        approach_type = st.radio(
            "種別",
            ["Circling", "Visual Circuit", "LDA (BT→Final)"],
            horizontal=True,
            help="Circling: DW幅 1.5nm / Visual Circuit: DW幅 2.5nm / LDA: DWなし",
        )
        is_lda = approach_type == "LDA (BT→Final)"
        # 種別ごとの既定 DW幅（LDA は不使用）
        default_dw = 1.5 if approach_type == "Circling" else 2.5

        # ── ② VOR / 滑走路 ──────────────────────────────────────────────
        with st.expander("② VOR / 滑走路", expanded=True):
            vor_ident = st.text_input("VOR 識別符号",
                                      value=ocr_defaults.get("vor_ident", "SWE"))
            thr_brg   = st.number_input("VOR → Threshold 方位 (°)",
                                        0.0, 360.0,
                                        float(ocr_defaults.get("thr_brg", 90.0)), 1.0,
                                        help="VORから着陸滑走路スレッショルドへの方位")
            thr_dist  = st.number_input("VOR → Threshold 距離 (nm)",
                                        0.0, 30.0,
                                        float(ocr_defaults.get("thr_dist", 1.0)), 0.1,
                                        format="%.1f")
            fac       = st.number_input("Final Approach Course — FAC (°)",
                                        0.0, 360.0,
                                        float(ocr_defaults.get("fac", 274.0)), 1.0,
                                        help="最終進入コース（inbound heading）")
            rwy_hdg   = st.number_input("着陸滑走路方位 (°)",
                                        0.0, 360.0,
                                        float(ocr_defaults.get("rwy_hdg", 360.0)), 1.0,
                                        help="Landing RW 方位 (例: RWY36→360°)")
            rwy_length_ft = st.number_input(
                "滑走路長 (ft)",
                min_value=1000, max_value=20000,
                value=int(ocr_defaults.get("rwy_length_ft", 9843)),
                step=100,
                help="滑走路全長 (ft)。9843ft ≈ 3000m",
            )
            rwy_length_nm = rwy_length_ft / FT_PER_NM
            field_elev = st.number_input(
                "Field Elevation (ft MSL)",
                min_value=0, max_value=15000,
                value=int(ocr_defaults.get("field_elev", 20)),
                step=10,
                help="空港標高（MSL）",
            )
            pattern_alt = st.number_input(
                "Pattern Altitude (ft MSL)",
                min_value=100, max_value=15000,
                value=int(ocr_defaults.get("pattern_alt", 1500)),
                step=100,
                help="サークリング中の維持高度（MSL）",
            )

        # ── ③ Break / 回路設定 ──────────────────────────────────────────
        with st.expander("③ Break / 回路設定", expanded=True):
            # Break 方向（FAC から Left Break か Right Break か）
            break_dir = st.radio(
                "Break / Turn 方向",
                ["Right Break", "Left Break"],
                horizontal=True,
                help="FAC から右旋回 or 左旋回でファイナルへ",
            )
            turn_dir = "right" if break_dir == "Right Break" else "left"
            st.info(f"旋回方向: {'右 (Right)' if turn_dir == 'right' else '左 (Left)'}")

            if is_lda:
                # LDA: MAP DME 距離 + Base Leg + ファイナル距離
                map_dist_lda = st.number_input(
                    "MAP VOR DME 距離 (nm)",
                    -30.0, 30.0,
                    float(ocr_defaults.get("thr_dist", 1.1)), 0.1,
                    format="%.1f",
                    help="正値: FAC方向（VOR手前）/ 負値: FAC反対側（VOR奥）",
                )
                if map_dist_lda < 0:
                    st.caption(f"MAP は VOR の逆サイド（{(fac+180)%360:.0f}° 方向 {abs(map_dist_lda):.1f}nm）")
                base_leg_lda = st.number_input(
                    "Base Leg 距離 (nm)",
                    0.0, 20.0, 1.8, 0.1, format="%.1f",
                    help="MAP から outbound に飛ぶ距離。0 = MAP で即 Base Turn（Direct Turn）",
                )
                if base_leg_lda < 0.01:
                    st.info(f"✈ **Direct Turn at MAP**\n\nFAC {fac:.0f}° inbound のまま MAP で即旋回 → Final ({rwy_hdg:.0f}°)")
                else:
                    _bl_brg = (fac + 180) % 360
                    st.info(f"Base Leg Bearing: **{_bl_brg:.0f}°**  (FAC {fac:.0f}° の反方位)")
                final_dist = st.number_input("ファイナル開始距離 (nm, from THR)",
                                             0.1, 10.0, 1.8, 0.1, format="%.1f")
                dw_width = 0.0  # LDA: DW なし
            else:
                # Circling / Visual Circuit: DW 幅固定
                map_dist_lda = 0.0
                base_leg_lda = 0.0
                dw_width = default_dw
                st.metric("ダウンウインド幅（固定）", f"{dw_width} nm",
                          f"{'Circling: 1.5nm' if approach_type == 'Circling' else 'Visual Circuit: 2.5nm'}")
                final_dist = st.number_input("ファイナル開始距離 (nm, from THR)",
                                             0.5, 10.0, 3.0, 0.5, format="%.1f")

        # ── ④ 重量 / VREF ────────────────────────────────────────────────
        with st.expander("④ 重量 / VREF", expanded=True):
            weight_klb = st.slider(
                "着陸重量 (1,000 LB)",
                min_value=450, max_value=1000, value=680, step=10,
                help="着陸重量を選択するとVREFが自動計算されます",
            )
            weight_lb_str = f"{weight_klb * 1000:,} LB"

            # VREF 自動計算
            vref_flap = st.radio(
                "VREF フラップ設定",
                ["F25", "F30"],
                horizontal=True,
                help="サークリングはF25が一般的",
            )
            vref_auto = interpolate_speed(VREF_TABLE, weight_klb, vref_flap)
            st.metric(f"VREF({vref_flap})  @{weight_lb_str}", f"{vref_auto} kt")

            # VREF 手動上書き
            vref_override = st.checkbox("VREFを手動上書き", value=False)
            if vref_override:
                vref25 = st.number_input("VREF (kt)", 100, 220, vref_auto, 1)
            else:
                vref25 = vref_auto

        # ── ⑤ 各フェーズ速度 ─────────────────────────────────────────────
        with st.expander("⑤ 各フェーズ速度", expanded=True):
            st.caption(f"重量 {weight_lb_str} のフラップマニューバー速度 (Sea Level)")

            # フラップマニューバー速度テーブル（参照用）
            fms = {k: interpolate_speed(FLAP_MAN_TABLE, weight_klb, k)
                   for k in FLAP_KEYS}
            fms_df = pd.DataFrame(
                [{"Flap": k, "Maneuver Speed (kt)": v} for k, v in fms.items()]
            ).set_index("Flap").T
            st.dataframe(fms_df, use_container_width=True)

            st.markdown("---")
            st.markdown("**Break〜Downwind** (クリーン〜フラップ展開)")

            def phase_spd_ref(flap_key: str) -> int:
                """F25/F30 → VREF+5（Final Approach Speed）、他 → Flap Maneuver Speed"""
                if flap_key in VREF_FLAP_KEYS:
                    return interpolate_speed(VREF_TABLE, weight_klb, flap_key) + 5
                return fms[flap_key]

            # Break 速度 — フラップ選択 or 手動
            c1, c2 = st.columns([2, 1])
            with c1:
                brk_flap = st.selectbox("Break フラップ", FLAP_KEYS,
                                        index=0, key="brk_flap",
                                        help="Break旋回時のフラップ設定")
            with c2:
                brk_spd_ref = phase_spd_ref(brk_flap)
                _help = (f"VREF({brk_flap})+5={brk_spd_ref}kt" if brk_flap in VREF_FLAP_KEYS
                         else f"参照: {brk_spd_ref}kt")
                brk_speed = st.number_input("Speed (kt)", 50, 400,
                                            brk_spd_ref, 5, key="brk_spd",
                                            help=_help)

            st.markdown("**Downwind**")
            c1, c2 = st.columns([2, 1])
            with c1:
                dw_flap = st.selectbox("DW フラップ", FLAP_KEYS,
                                       index=FLAP_KEYS.index("F10"), key="dw_flap")
            with c2:
                dw_spd_ref = phase_spd_ref(dw_flap)
                _help = (f"VREF({dw_flap})+5={dw_spd_ref}kt" if dw_flap in VREF_FLAP_KEYS
                         else f"参照: {dw_spd_ref}kt")
                dw_speed = st.number_input("Speed (kt)", 50, 400,
                                           dw_spd_ref, 5, key="dw_spd",
                                           help=_help)

            st.markdown("**Base Turn**")
            c1, c2 = st.columns([2, 1])
            with c1:
                bt_flap = st.selectbox("BT フラップ", FLAP_KEYS,
                                       index=FLAP_KEYS.index("F20"), key="bt_flap")
            with c2:
                bt_spd_ref = phase_spd_ref(bt_flap)
                _help = (f"VREF({bt_flap})+5={bt_spd_ref}kt" if bt_flap in VREF_FLAP_KEYS
                         else f"参照: {bt_spd_ref}kt")
                bt_speed = st.number_input("Speed (kt)", 50, 400,
                                           bt_spd_ref, 5, key="bt_spd",
                                           help=_help)

            st.markdown("**Final Turn**")
            c1, c2 = st.columns([2, 1])
            with c1:
                ft_flap = st.selectbox("FT フラップ", FLAP_KEYS,
                                       index=FLAP_KEYS.index("F25"), key="ft_flap")
            with c2:
                ft_spd_ref = phase_spd_ref(ft_flap)
                _help = (f"VREF({ft_flap})+5={ft_spd_ref}kt" if ft_flap in VREF_FLAP_KEYS
                         else f"参照: {ft_spd_ref}kt")
                ft_speed = st.number_input("Speed (kt)", 50, 400,
                                           ft_spd_ref, 5, key="ft_spd",
                                           help=_help)

            st.markdown("**Final (FAP〜THR)**")
            st.info(f"VREF({vref_flap}) = **{vref25} kt**"
                    f"　Final Approach Speed = **{vref25 + 5} kt**")

            bank_deg = st.slider("バンク角 (°)", 10, 40, 25)

        show_grid = st.checkbox("グリッド表示", True)

    # ── 計算 ──────────────────────────────────────────────────────────────
    R_break = turn_radius_nm(brk_speed, bank_deg)
    R_bt    = turn_radius_nm(bt_speed,  bank_deg)
    R_ft    = turn_radius_nm(ft_speed,  bank_deg)

    if is_lda:
        try:
            r = compute_lda(
                thr_brg, thr_dist, fac, rwy_hdg, turn_dir,
                map_dist_lda, R_bt, final_dist, base_leg_lda,
            )
        except Exception as e:
            st.error(f"LDA 計算エラー: {e}")
            st.stop()

        # ── LDA 表示 ──────────────────────────────────────────────────────
        TAN3 = math.tan(math.radians(3.0))
        TDP_OFFSET_NM = 0.2
        _thr_e, _thr_n = r["thr"]
        _rwy_r = math.radians(rwy_hdg)
        tdp_e = _thr_e + math.sin(_rwy_r) * TDP_OFFSET_NM
        tdp_n = _thr_n + math.cos(_rwy_r) * TDP_OFFSET_NM

        badge_color = "#7b3fa0"
        st.markdown(
            f'<span style="background:{badge_color};color:white;padding:4px 12px;'
            f'border-radius:8px;font-weight:bold;font-size:1em;">'
            f'LDA (Base Turn → Final) — {break_dir} — Landing RWY {int(rwy_hdg/10):02d}'
            f'</span>', unsafe_allow_html=True,
        )
        d_ftx_lda  = final_dist + TDP_OFFSET_NM
        d_fte_lda  = d_ftx_lda + R_bt * math.pi / 2.0
        alt_ftx_lda = int(round((field_elev + d_ftx_lda * TAN3 * FT_PER_NM) / 10) * 10)
        alt_fte_lda = int(round((field_elev + d_fte_lda * TAN3 * FT_PER_NM) / 10) * 10)

        c1, c2, c3 = st.columns(3)
        map_brg_l, map_dist_l = en_to_brg_dist(*r["map_pt"])
        map_rad_l = (map_brg_l + 180) % 360
        with c1:
            st.metric("MAP / Break", f"DME {map_dist_l:.1f} nm", f"R-{map_rad_l:.0f}°  {vor_ident}")
        with c2:
            fs_brg_l, fs_dist_l = en_to_brg_dist(*r["ft_exit"])
            st.metric("Final Start", f"DME {fs_dist_l:.1f} nm", f"3°ref: {alt_ftx_lda:,}ft")
        with c3:
            st.metric("Base Turn 旋回半径", f"{R_bt:.3f} nm", f"{R_bt*1852:.0f} m  ({bt_speed}kt, {bank_deg}°)")

        fig_lda = make_figure_lda(r, show_grid, vor_ident, rwy_length_nm)

        # TDP
        fig_lda.add_trace(go.Scatter(
            x=[tdp_e], y=[tdp_n],
            mode="markers+text",
            marker=dict(symbol="star", size=14, color="gold",
                        line=dict(color="orange", width=1.5)),
            text=["TDP"], textposition="top right",
            showlegend=False, textfont=dict(size=10, color="gold"),
        ))

        st.plotly_chart(fig_lda, use_container_width=True)

        # LDA 手順テーブル
        st.subheader("📋 パイロット手順サマリー")
        bt_entry_brg, bt_entry_dist = en_to_brg_dist(*r["bt_entry"])

        # Base Leg 高度 (pattern_alt maintain)
        # Base Turn Entry の3°参照高度
        d_bte_lda = d_ftx_lda + R_bt * math.pi / 2.0 + base_leg_lda
        alt_bte_lda = int(round((field_elev + d_bte_lda * TAN3 * FT_PER_NM) / 10) * 10)

        is_direct_turn = r.get("direct_turn", False)
        lda_rows = [
            {
                "フェーズ": "① MAP / Break（旋回開始）",
                "VOR DME / Radial": f"D {map_dist_l:.1f} / R-{map_rad_l:.0f}°",
                "Bearing": (f"{r['fac']:.0f}°  inbound → Turn" if is_direct_turn
                            else f"{r['fac_out']:.0f}°  outbound"),
                "フラップ": bt_flap,
                "速度": f"{bt_speed}kt",
                "目標高度": f"{pattern_alt:,}ft  (Pattern maintain)",
                "アクション": f"{break_dir}" + (" (Direct Turn)" if is_direct_turn else ""),
                "備考": "Pattern Alt 維持",
            },
        ]
        if base_leg_lda > 0:
            bl_t = r["base_leg"] / bt_speed * 3600 if bt_speed > 0 else 0
            lda_rows.append({
                "フェーズ": "② Base Leg（直線飛行）",
                "VOR DME / Radial": f"D {map_dist_l:.1f} → {bt_entry_dist:.1f} nm",
                "Bearing": f"{r['fac_out']:.0f}°",
                "フラップ": bt_flap,
                "速度": f"{bt_speed}kt",
                "目標高度": f"{pattern_alt:,}ft  (Pattern maintain)",
                "アクション": f"{r['base_leg']:.1f}nm / {bl_t:.0f}秒",
                "備考": "降下開始準備",
            })
        bt_num  = "③" if base_leg_lda > 0 else "②"
        fin_num = "④" if base_leg_lda > 0 else "③"
        # Direct Turn モードでは BT Entry = MAP なので Pattern Alt maintain
        bt_entry_alt_str = (f"{pattern_alt:,}ft  (Pattern maintain)"
                            if is_direct_turn else f"{alt_bte_lda:,}ft  (3°ref)")
        bt_entry_label   = ("MAP で即旋回" if is_direct_turn
                            else f"旋回半径 {R_bt:.2f}nm ({R_bt*1852:.0f}m)")
        lda_rows.append({
            "フェーズ": f"{bt_num} Base Turn Entry [CP①]",
            "VOR DME / Radial": f"D {bt_entry_dist:.1f} nm",
            "Bearing": f"→ {rwy_hdg:.0f}°",
            "フラップ": bt_flap,
            "速度": f"{bt_speed}kt",
            "目標高度": bt_entry_alt_str,
            "アクション": bt_entry_label,
            "備考": "降下開始",
        })
        # Final Start の "THR からの距離" — Direct Turn では幾何計算から得る
        if is_direct_turn:
            fs_thr_dist = math.hypot(r["ft_exit"][0] - r["thr"][0],
                                     r["ft_exit"][1] - r["thr"][1])
            final_dist_note = f"THR から {fs_thr_dist:.1f} nm（幾何計算）"
        else:
            final_dist_note = f"THR から {final_dist:.1f} nm"
        lda_rows.append({
            "フェーズ": f"{fin_num} Final Start [CP②]",
            "VOR DME / Radial": f"D {fs_dist_l:.1f} nm",
            "Bearing": f"{rwy_hdg:.0f}°",
            "フラップ": ft_flap,
            "速度": f"{ft_speed}kt",
            "目標高度": f"{alt_ftx_lda:,}ft  (3°ref)",
            "アクション": "LDG Checklist / MDA確認",
            "備考": final_dist_note,
        })
        st.dataframe(pd.DataFrame(lda_rows), use_container_width=True, hide_index=True)

        with st.expander("🔢 全ウェイポイント（VOR DME / Radial）"):
            st.dataframe(pd.DataFrame(r["wps"]), use_container_width=True, hide_index=True)

        st.stop()   # LDA はここで終了（以降の Circling 処理をスキップ）

    try:
        r = compute(
            thr_brg, thr_dist, fac, rwy_hdg, turn_dir,
            dw_width, R_break, R_bt, R_ft, dw_speed, final_dist,
        )
    except ZeroDivisionError:
        st.error("計算エラー: アプローチトラックとダウンウインドが平行です。FAC または着陸方位を確認してください。")
        st.stop()

    # ── 高度計算（3° グライドパス） ─────────────────────────────────────────
    base_leg_len = r.get("base_leg_length", 0.0)   # ここで定義（後続すべてで使用）
    TAN3 = math.tan(math.radians(3.0))
    TDP_OFFSET_NM = 0.2   # THR から滑走路内側 0.2nm = Touchdown Point

    _thr_e, _thr_n = r["thr"]
    _rwy_r = math.radians(rwy_hdg)
    tdp_e = _thr_e + math.sin(_rwy_r) * TDP_OFFSET_NM
    tdp_n = _thr_n + math.cos(_rwy_r) * TDP_OFFSET_NM

    def alt_3deg_path(d_nm):
        """TDPからの経路距離 d_nm に対する3°パス高度 (ft MSL, 10ft丸め)"""
        return int(round((field_elev + d_nm * TAN3 * FT_PER_NM) / 10.0) * 10)

    # BT Exit 以降は経路距離（弧長 + 直線）で3°高度を計算
    # Final Turn 弧長
    _ft_arc_angle = abs(math.radians(rwy_hdg) - math.radians(r["base_hdg"]))
    _ft_arc_angle = min(_ft_arc_angle, 2 * math.pi - _ft_arc_angle)   # 短い方
    ft_arc_len = R_ft * _ft_arc_angle

    # BT 弧長 (90°)
    bt_arc_len = R_bt * math.pi / 2.0

    # 各ポイントの TDP からの経路距離
    # TDP ← THR(0.2nm) ← Final Start(final_dist) ← Final Turn arc(ft_arc_len) ← FT Entry
    d_ftx  = final_dist + TDP_OFFSET_NM                         # Final Start → TDP
    d_fte  = d_ftx + ft_arc_len                                  # FT Entry → TDP
    d_btx  = d_fte + base_leg_len if base_leg_len > 0.02 else d_fte  # BT Exit → TDP
    d_bte  = d_btx + bt_arc_len                                  # BT Start → TDP (through arc)

    alt_btx = alt_3deg_path(d_btx)
    alt_fte = alt_3deg_path(d_fte)
    alt_ftx = alt_3deg_path(d_ftx)

    # Break〜BT Start は Pattern Alt 維持
    alt_brk = pattern_alt
    alt_dwe = pattern_alt
    alt_abm = pattern_alt
    alt_bte = pattern_alt

    # 降下開始点: Pattern Alt から 3°パスへの降下開始は Final approach 前（BT turn中〜BT Exit付近）
    # BT Exit で on-path になるために必要な降下率の参考として
    # 降下開始はBT Startで Pattern Alt → BT Exit で 3°パス高度になるように
    # BT 旋回中の水平距離 ≒ bt_arc_len
    # 必要降下量 = pattern_alt - alt_btx
    descent_needed = max(0, pattern_alt - alt_btx)

    # アプローチトラック上の降下開始点（Pattern Alt = 3°交差 → BREAKより手前の参考点）
    descent_dist_nm = (pattern_alt - field_elev) / (TAN3 * FT_PER_NM)
    _brk_e, _brk_n = r["break_pt"]
    _sf = math.sin(math.radians(fac))
    _cf = math.cos(math.radians(fac))
    _dx = _brk_e - tdp_e
    _dy = _brk_n - tdp_n
    _b = -2.0 * (_dx * _sf + _dy * _cf)
    _c = _dx**2 + _dy**2 - descent_dist_nm**2
    _disc = _b**2 - 4.0 * _c
    has_desc_pt = _disc >= 0
    desc_pt_e = desc_pt_n = 0.0
    desc_on_track = False
    if has_desc_pt:
        _s1 = (-_b + math.sqrt(_disc)) / 2.0
        _s2 = (-_b - math.sqrt(_disc)) / 2.0
        _s = max(_s1, _s2)
        if _s > 0:
            desc_pt_e = _brk_e - _s * _sf
            desc_pt_n = _brk_n - _s * _cf
            desc_on_track = True

    # ── KPI カード ────────────────────────────────────────────────────────
    # 種別バッジ
    badge_color = "#1f6aa5" if approach_type == "Circling" else "#2a7a4b"
    st.markdown(
        f'<span style="background:{badge_color};color:white;padding:4px 12px;'
        f'border-radius:8px;font-weight:bold;font-size:1em;">'
        f'{approach_type} — {break_dir} — Landing RWY {int(rwy_hdg/10):02d}'
        f'</span>',
        unsafe_allow_html=True,
    )
    base_leg_str = f"Base Leg: **{base_leg_len:.2f}nm**" if base_leg_len > 0.02 else "Base Leg: **なし**（BT→FT 直結）"
    st.markdown(
        f"VREF({vref_flap}): **{vref25}kt**　DW速度: **{dw_speed}kt**"
        f"　DW幅: **{dw_width}nm**（固定）　{base_leg_str}",
    )
    st.divider()

    st.subheader("📌 キーポイント")
    brk_brg, brk_dist = en_to_brg_dist(*r["break_pt"])
    brk_radial = (brk_brg + 180) % 360

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("Break 旋回開始",
                  f"DME {brk_dist:.1f} nm",
                  f"R-{brk_radial:.0f}°  {vor_ident}")
    with c2:
        dw_len = r["dw_length"]
        abm_len = r["abeam_to_bt"]
        st.metric("Abeam THR → BT Start",
                  f"{abm_len:.2f} nm",
                  f"DW 全長: {dw_len:.2f} nm")
    with c3:
        abm_t = r["abeam_time"]
        st.metric("Abeam タイマー（目安）",
                  f"NoWind: {abm_t:.0f}s",
                  f"Tail 10kt: {abm_t * dw_speed / (dw_speed + 10):.0f}s  ({dw_speed}kt基準)")
    with c4:
        st.metric("ファイナル開始", f"THR −{final_dist:.1f} nm",
                  f"DME {en_to_brg_dist(*r['ft_exit'])[1]:.1f} nm")

    # ── 平面図 ──────────────────────────────────────────────────────────────
    fig = make_figure(r, show_grid, vor_ident, rwy_length_nm)

    # Touchdown Point (TDP) — THR から 0.2nm 滑走路内側
    fig.add_trace(go.Scatter(
        x=[tdp_e], y=[tdp_n],
        mode="markers+text",
        marker=dict(symbol="star", size=14, color="gold",
                    line=dict(color="orange", width=1.5)),
        text=["TDP"], textposition="top right",
        name="Touchdown Point", showlegend=False,
        textfont=dict(size=10, color="gold"),
    ))

    # 降下開始点（Pattern Alt が 3°パスと交差する点）
    if desc_on_track:
        fig.add_trace(go.Scatter(
            x=[desc_pt_e], y=[desc_pt_n],
            mode="markers+text",
            marker=dict(symbol="triangle-down", size=14, color="cyan",
                        line=dict(color="deepskyblue", width=1.5)),
            text=[f"START DESCENT<br>{pattern_alt:,}ft → 3° path"],
            textposition="bottom right",
            name="Descent Point", showlegend=False,
            textfont=dict(size=9, color="cyan"),
        ))

    # ターン後チェックポイント（DW Entry / BT Exit / FT Exit）に高度注記
    check_pts = [
        (r["dw_entry"], f"DW Entry<br>★ {alt_dwe:,}ft", "lime"),
        (r["bt_exit"],  f"BT Exit<br>★ {alt_btx:,}ft",  "cyan"),
        (r["ft_exit"],  f"Final Start<br>★ {alt_ftx:,}ft", "violet"),
    ]
    if base_leg_len > 0.02:
        check_pts.insert(2, (r["bt_exit"], f"Base Leg End<br>★ {alt_btx:,}ft", "cyan"))

    for (pe, pn), label, col in check_pts:
        fig.add_trace(go.Scatter(
            x=[pe], y=[pn],
            mode="markers+text",
            marker=dict(symbol="square", size=9, color=col,
                        line=dict(color="white", width=1)),
            text=[label], textposition="bottom left",
            name=label, showlegend=False,
            textfont=dict(size=9, color=col),
        ))

    st.plotly_chart(fig, use_container_width=True)

    # ── 手順テーブル ─────────────────────────────────────────────────────
    st.subheader("📋 パイロット手順サマリー")

    brk_radial_str = f"R-{brk_radial:.0f}°"
    dw_brg, dw_dist = en_to_brg_dist(*r["dw_entry"])
    dw_radial = (dw_brg + 180) % 360
    bt_brg, bt_dist = en_to_brg_dist(*r["bt_entry"])
    bt_radial = (bt_brg + 180) % 360

    base_leg_time = (base_leg_len / bt_speed * 3600) if bt_speed > 0 and base_leg_len > 0.02 else 0

    def _alt_str(alt_ft):
        """3°パス目標高度の文字列。"""
        return f"{alt_ft:,} ft"

    _pat = f"{pattern_alt:,}ft  (Pattern maintain)"

    rows = [
        {
            "フェーズ": "① Break（旋回開始）",
            "VOR DME / Radial": f"D {brk_dist:.1f} / {brk_radial_str}",
            "フラップ": brk_flap,
            "速度": f"{brk_speed}kt",
            "目標高度": _pat,
            "アクション": f"{break_dir} → HDG {r['dw_hdg']:.0f}°",
            "備考": "Pattern Alt 維持",
        },
        {
            "フェーズ": "② DW Roll-out",
            "VOR DME / Radial": f"D {dw_dist:.1f} / R-{dw_radial:.0f}°",
            "フラップ": dw_flap,
            "速度": f"{dw_speed}kt  (VREF+5)",
            "目標高度 (3°ref)": _alt_str(alt_dwe),
            "アクション": "TIME IN / Gear Down / Flap設定",
            "備考": f"DW {dw_len:.2f} nm  (幅 {dw_width}nm 固定)",
        },
        {
            "フェーズ": "③ Base Turn（ベースターン開始）",
            "VOR DME / Radial": f"D {bt_dist:.1f} / R-{bt_radial:.0f}°",
            "フラップ": bt_flap,
            "速度": f"{bt_speed}kt",
            "目標高度": _pat,
            "アクション": f"TIME OUT（{r['dw_time']:.0f}秒） / 旋回開始 → 降下開始",
            "備考": f"旋回半径 {R_bt:.3f} nm ({R_bt*1852:.0f} m)",
        },
    ]
    if base_leg_len > 0.02:
        bt_exit_brg, bt_exit_dist = en_to_brg_dist(*r["bt_exit"])
        bt_exit_radial = (bt_exit_brg + 180) % 360
        rows.append({
            "フェーズ": "④ Base Leg [CP①]",
            "VOR DME / Radial": f"D {bt_exit_dist:.1f} / R-{bt_exit_radial:.0f}°",
            "フラップ": bt_flap,
            "速度": f"{bt_speed}kt",
            "目標高度": _alt_str(alt_btx),
            "アクション": f"HDG {r['base_hdg']:.0f}° 維持",
            "備考": f"{base_leg_len:.2f} nm / {base_leg_time:.0f}秒",
        })
    ft_num  = "⑤" if base_leg_len > 0.02 else "④"
    fin_num = "⑥" if base_leg_len > 0.02 else "⑤"
    cp_ft  = "②" if base_leg_len > 0.02 else "①"
    cp_fin = "③" if base_leg_len > 0.02 else "②"
    rows.append({
        "フェーズ": f"{ft_num} Final Turn [CP{cp_ft}]",
        "VOR DME / Radial": f"D {en_to_brg_dist(*r['ft_entry'])[1]:.1f} nm",
        "フラップ": ft_flap,
        "速度": f"{ft_speed}kt",
        "目標高度": _alt_str(alt_fte),
        "アクション": "LDG Checklist",
        "備考": f"ファイナルコース {r['rwy_hdg']:.0f}° に合わせる",
    })
    rows.append({
        "フェーズ": f"{fin_num} Final Start [CP{cp_fin}]",
        "VOR DME / Radial": f"D {en_to_brg_dist(*r['ft_exit'])[1]:.1f} nm",
        "フラップ": vref_flap,
        "速度": f"{vref25}kt  (VREF)",
        "目標高度": _alt_str(alt_ftx),
        "アクション": "FAP / MDA確認",
        "備考": f"THR から {final_dist:.1f} nm、MDA 以上を確認",
    })
    procedure = pd.DataFrame(rows)
    st.dataframe(procedure, use_container_width=True, hide_index=True)

    # ── 降下プロファイル サマリー ────────────────────────────────────────
    with st.expander("📉 高度プロファイル（3°パス参照）"):
        st.caption(
            f"TDP = THR + {TDP_OFFSET_NM}nm  ｜  Field Elev: {field_elev}ft  "
            f"｜  Pattern Alt: {pattern_alt:,}ft  ｜  "
            f"必要降下量 (BT Turn中): {descent_needed:.0f}ft  "
            f"({descent_needed / (bt_arc_len * FT_PER_NM) * 100:.0f}ft/nm)"
        )
        if desc_on_track:
            desc_dme = en_to_brg_dist(desc_pt_e, desc_pt_n)[1]
            st.info(
                f"ℹ️  3°パスが {pattern_alt:,}ft を通過するアプローチトラック上の点: "
                f"VOR DME **{desc_dme:.1f} nm** (BREAK より約 "
                f"{math.hypot(desc_pt_e - _brk_e, desc_pt_n - _brk_n):.1f} nm 手前)\n\n"
                f"サーキット中は **Pattern Alt 維持**。Base Turn 開始後に降下を始め、"
                f"BT Exit で **{alt_btx:,}ft** を目標とする。"
            )

        alt_df = pd.DataFrame([
            {"地点": "Break Point",         "高度": f"{pattern_alt:,}ft  (Pattern maintain)", "備考": "Pattern Alt 維持"},
            {"地点": "DW Entry",            "高度": f"{pattern_alt:,}ft  (Pattern maintain)", "備考": "Pattern Alt 維持"},
            {"地点": "Abeam THR (TIME IN)", "高度": f"{pattern_alt:,}ft  (Pattern maintain)", "備考": "タイマー開始"},
            {"地点": "BT Start",            "高度": f"{pattern_alt:,}ft  → 降下開始",        "備考": "Base Turn 中から降下"},
            {"地点": "BT Exit [CP①]",      "高度": f"{alt_btx:,}ft  (3°ref)",               "備考": "Base Turn 終了後確認"},
            {"地点": f"FT Entry [CP{cp_ft}]", "高度": f"{alt_fte:,}ft  (3°ref)",             "備考": "Final Turn 開始"},
            {"地点": f"Final Start [CP{cp_fin}]","高度": f"{alt_ftx:,}ft  (3°ref)",          "備考": "Final Turn 終了後確認"},
        ])
        st.dataframe(alt_df, use_container_width=True, hide_index=True)

    # ── 詳細テーブル ──────────────────────────────────────────────────────
    with st.expander("🔢 全ウェイポイント（VOR DME / Radial）"):
        df = pd.DataFrame(r["wps"])
        st.dataframe(df, use_container_width=True, hide_index=True)

    # ── 旋回半径カード ────────────────────────────────────────────────────
    with st.expander("📐 旋回半径"):
        cc1, cc2, cc3 = st.columns(3)
        with cc1:
            st.metric("Break 旋回半径",
                      f"{R_break:.3f} nm", f"{R_break*1852:.0f} m  ({brk_speed} kt, {bank_deg}°)")
        with cc2:
            st.metric("Base Turn 旋回半径",
                      f"{R_bt:.3f} nm", f"{R_bt*1852:.0f} m  ({bt_speed} kt, {bank_deg}°)")
        with cc3:
            st.metric("Final Turn 旋回半径",
                      f"{R_ft:.3f} nm", f"{R_ft*1852:.0f} m  ({ft_speed} kt, {bank_deg}°)")

    # ── CSV ダウンロード ──────────────────────────────────────────────────
    buf = io.StringIO()
    procedure.to_csv(buf, index=False, encoding="utf-8-sig")
    st.download_button(
        "📥 手順サマリー CSV ダウンロード",
        buf.getvalue().encode("utf-8-sig"),
        "circling_procedure.csv",
        "text/csv",
    )


if __name__ == "__main__":
    main()
