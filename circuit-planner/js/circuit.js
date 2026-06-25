// サーキットパターンの座標を計算して返す
// モデル: 滑走路を基準とした along(進入方向逆=ダウンウィンド方向)/cross(パターン側) 平面で
//        ダウンウィンド → ベースターン(90°) → ベースレグ → ファイナルターン(90°) → ファイナル
//        を旋回半径(バンク+速度)と秒数で前進的に構築する。
function calculateCircuit(params) {
  const {
    threshold,        // [lat, lon] 接地点
    trueHeading,      // 着陸方向の真方位
    isLeftTraffic,    // true=左旋回, false=右旋回
    downwindWidthNM,  // ダウンウィンド幅 (NM)
    downwindSpeedKt,
    baseTurnSpeedKt,
    finalTurnSpeedKt,
    finalSpeedKt,
    upwindSpeedKt,
    crosswindSpeedKt,
    baseTurnBankDeg,
    finalTurnBankDeg,
    crosswindTurnBankDeg,
    downwindTurnBankDeg,
    timeCheckSec,     // ダウンウィンド延長(Abeam→ベースターン)の秒数
    upwindSec,        // Upwind延長(滑走路末端から)の秒数
    baseTimeSec,      // ベースレグの秒数
    windDir,          // 風向(磁方位, 風が吹いてくる方向)
    magVar,           // 磁気偏差(E正/W負): 真方位 = 磁方位 + magVar
    windSpeedKt,      // 風速
    entryType,        // 'downwind' | 'directBase' | 'vorB'
    directBaseDistNM, // ダイレクトベース時のベース位置(接地点から)
    directBaseLegNM,  // ダイレクトベース時のベースレグ長(選択)
    vorBCourseMag,    // VOR B 進入コース(磁方位)
    vorBLegNM,        // VOR B ラジアル進入レグ長(NM)
    vorBPattern,      // VOR B パターン幅(1.5 or 2.5 NM)
    vorBTurnBankDeg,  // VOR B 会合旋回バンク角(専用)
    vorLat, vorLon,   // VOR座標(ラジアル起点)
    runwayLengthNM,   // 滑走路長(NM) ※Upwindは離陸側(遠端)を基準に延長
    mda,              // MDA (ft MSL)
    thr_elev,         // 接地点標高 (ft)
  } = params;

  const reciprocal  = normalizeBearing(trueHeading + 180);              // ダウンウィンド方向(+along)
  const crossBearing = normalizeBearing(trueHeading + (isLeftTraffic ? -90 : 90)); // パターン側(+cross)

  // windDir = 磁方位の風向 → 真方位に変換 (真 = 磁 + magVar)。風が吹いていく方向 = +180
  const windDirTrue = normalizeBearing(windDir + (magVar || 0));
  const windToward = normalizeBearing(windDirTrue + 180);
  const wKt = windSpeedKt || 0;
  // あるグラウンドトラック方位(deg)に沿った風成分(kt, +は追い風/後押し)
  function windAlong(trackBearingDeg) {
    return wKt * Math.cos(toRad(windToward - trackBearingDeg));
  }
  // 横風成分(kt)
  function windCross(trackBearingDeg) {
    return wKt * Math.sin(toRad(windToward - trackBearingDeg));
  }
  // 対地トラックを保つための機首方位(HDG) = TRK + WCA(風上へクラブ)
  function flightHeading(trkTrue, tasKt) {
    const xFromRight = -windCross(trkTrue);   // +は右からの横風
    const s = Math.max(-1, Math.min(1, xFromRight / Math.max(1, tasKt)));
    return normalizeBearing(trkTrue + toDeg(Math.asin(s)));
  }

  // along/cross(NM) → 緯度経度
  function toLatLon(along, cross) {
    let p = destinationPoint(threshold[0], threshold[1], reciprocal, along);
    if (Math.abs(cross) > 1e-9) p = destinationPoint(p[0], p[1], crossBearing, cross);
    return p;
  }
  // 緯度経度 → along/cross(NM) (平面近似, 接地点基準)
  function toAlongCross(p) {
    const d = distanceNM(threshold[0], threshold[1], p[0], p[1]);
    const b = bearingDeg(threshold[0], threshold[1], p[0], p[1]);
    return [d * Math.cos(toRad(b - reciprocal)), d * Math.cos(toRad(b - crossBearing))];
  }
  // 旋回円弧 (along=x=cos, cross=y=sin)
  function turnArc(cx, cy, R, a0deg, a1deg, steps = 18) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = toRad(a0deg + (a1deg - a0deg) * (i / steps));
      pts.push(toLatLon(cx + R * Math.cos(a), cy + R * Math.sin(a)));
    }
    return pts;
  }

  // --- 各種寸法 ---
  // VOR B のときはパターン幅をプリセット(1.5/2.5)で上書き
  const W = ((entryType === 'vorB' || entryType === 'vorA') && vorBPattern) ? vorBPattern : downwindWidthNM;
  // 各レグの進行方位(真方位)
  const finalHeading = trueHeading;                                // ファイナル(=滑走路方位)
  const upwindHeading = trueHeading;                               // Upwind(=滑走路方位, 着陸方向)
  const crosswindHeading = crossBearing;                           // クロスウィンド(パターン側へ)
  const dwHeading    = reciprocal;                                 // ダウンウィンド
  const baseTrackBearing = normalizeBearing(crossBearing + 180);  // ベース(中心線へ向かう)
  // 各レグの対地速度 GS = TAS + 風の後押し成分
  const gsDownwind  = downwindSpeedKt   + windAlong(dwHeading);
  const gsBase      = baseTurnSpeedKt   + windAlong(baseTrackBearing);
  const gsFinal     = finalSpeedKt      + windAlong(finalHeading);
  const gsCrosswind = crosswindSpeedKt  + windAlong(crosswindHeading);
  const gsUpwind    = upwindSpeedKt      + windAlong(upwindHeading);  // Upwindは着陸方位
  // 旋回半径は GS（風考慮）で計算。各ターンは隣接レグGSの平均で評価
  const gsBaseTurn  = (gsDownwind + gsBase) / 2;
  const gsFinalTurn = (gsBase + gsFinal) / 2;
  const R_base  = turnRadiusNM(gsBaseTurn,  baseTurnBankDeg);
  const R_final = turnRadiusNM(gsFinalTurn, finalTurnBankDeg);
  // 下端180°ターン = クロスウィンドターン(前半90°) + ダウンウィンドターン(後半90°)
  // どちらも半径=W/2(幅優先)。各ターンの平均GSで必要バンク角を計算
  const gsCwTurn = (gsUpwind + gsCrosswind) / 2;     // Upwind→Crosswind
  const gsDwTurn = (gsCrosswind + gsDownwind) / 2;   // Crosswind→Downwind
  const proposedCrosswindTurnBank = bankForRadiusDeg(gsCwTurn, W / 2);
  const proposedDownwindTurnBank  = bankForRadiusDeg(gsDwTurn, W / 2);
  // 下端2ターンの半径(バンク角ベース)。クロスウィンドレグで幅Wを保つ
  const R_cw = turnRadiusNM(gsCwTurn, crosswindTurnBankDeg || proposedCrosswindTurnBank);
  const R_dw = turnRadiusNM(gsDwTurn, downwindTurnBankDeg || proposedDownwindTurnBank);
  const L_cross = Math.max(0, W - R_cw - R_dw);      // クロスウィンドレグ長(幅優先で残りを充当)
  // タイムベースのレグは対地速度で地上距離が変化する
  const L_dwext  = (gsDownwind * timeCheckSec) / 3600;  // ダウンウィンド延長(対地)
  const L_base   = (gsBase * baseTimeSec) / 3600;       // ベースレグ長(対地)
  const L_upwind = (gsUpwind * (upwindSec || 0)) / 3600; // Upwind長(滑走路末端から, 対地)

  // Base/Final Turn を中心線に整列させる最適バンク角
  // ベース・ファイナルの2つの90°ターンで横方向 (W - ベースレグ) を等分 → 各半径 = (W-L_base)/2
  const targetRbf = Math.max(0.05, (W - L_base) / 2);
  const proposedBaseBank  = bankForRadiusDeg(gsBaseTurn,  targetRbf);
  const proposedFinalBank = bankForRadiusDeg(gsFinalTurn, targetRbf);

  // --- 主要点 (along, cross) とパス生成 ---
  let downwindPath, baseTurnArc, baseLegPath, upwindPath, downwindTurnArc, crosswindTurnArc, crosswindLegPath;
  let baseTurnStart, baseLegEnd, finalTurnCtr, finalRollout, crossResidual, abeamPos;
  let downwindTurnStartPos = null;
  let radialLegPath = null, entryTurnArc = null, vorBTeardropSec = null;   // VOR B 用
  let vorBTurnStartPos = null, vorBTurnDME = null, vorBTurnBank = null, vorBTurnRadius = null, vorBRadialNum = null;
  upwindPath = [];
  downwindTurnArc = [];

  if (entryType === 'directBase') {
    // ダイレクトベース: ダウンウィンド/ベースターン無し。外側からベースレグへ直接進入
    // ベースレグ長は選択可能。ファイナルターンで中心線に整列(進入開始点を外側へ伸ばす)
    const baseAlong = directBaseDistNM;
    const L_base_db = Math.max(0.05, directBaseLegNM || 1.0); // ベースレグ長(選択)
    const entryCross = R_final + L_base_db;               // 進入開始のcross(外側ほど長い)
    baseTurnStart = [baseAlong, entryCross];              // ベース進入開始点
    baseLegEnd    = [baseAlong, R_final];                 // ファイナルターン開始
    finalTurnCtr  = [baseAlong - R_final, R_final];
    finalRollout  = [baseAlong - R_final, 0];             // 中心線(crossResidual=0)
    crossResidual = 0;
    downwindPath  = [];
    baseTurnArc   = [];
    baseLegPath   = [toLatLon(baseAlong, entryCross + 0.4), // 外側からの進入を表示
                     toLatLon(baseTurnStart[0], baseTurnStart[1]),
                     toLatLon(baseLegEnd[0],    baseLegEnd[1])];
    abeamPos = null;
  } else if (entryType === 'vorB' || entryType === 'vorA') {
    // VOR A/B: VORラジアル(進入コース)に乗り、接線旋回でダウンウィンド(W)へ会合
    const crsTrue = normalizeBearing(vorBCourseMag + (magVar || 0));  // 進入コース(磁→真)
    const vbBank = vorBTurnBankDeg || 23;                             // VOR B 会合旋回バンク角(専用)
    const R_intc = turnRadiusNM(gsDownwind, vbBank);                  // 会合旋回半径(GS考慮)
    const swe = (vorLat != null && vorLon != null && !isNaN(vorLat) && !isNaN(vorLon)) ? [vorLat, vorLon] : null;

    // ダウンウィンド始点 along は会合幾何で決定(無ければ離陸側末端で代替)
    let dwEntryAlong = -((runwayLengthNM || 0));
    if (swe) {
      const sweAC = toAlongCross(swe);
      const swe2AC = toAlongCross(destinationPoint(swe[0], swe[1], crsTrue, 1));
      let dx = swe2AC[0] - sweAC[0], dy = swe2AC[1] - sweAC[1];
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;  // ラジアル方向単位ベクトル
      const sx = sweAC[0], sy = sweAC[1];
      // ダウンウィンド線(cross=W) とラジアル線の両方に接する円。中心 cross = W±R の2通り。
      // 旋回弧の「開始方位=進入コース」「終了方位=ダウンウィンド方位」の両立解を選ぶ
      const dwHeadingTrue = reciprocal;                         // ダウンウィンド真方位
      const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
      const build = (cy, s, dir) => {
        if (Math.abs(dy) < 1e-6) return null;
        const xc = (dy * sx + dx * (cy - sy) - s * R_intc) / dy;
        const C = [xc, cy];
        const sd = (xc - sx) * (-dy) + (cy - sy) * dx;
        const S = [xc + sd * dy, cy - sd * dx];                 // ラジアル上の接点(旋回開始)
        const angS = Math.atan2(S[1] - C[1], S[0] - C[0]);
        const angE = (cy > W) ? -Math.PI / 2 : Math.PI / 2;     // E(cross=W)は中心の南/北
        let d = angE - angS;
        d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (dir < 0) d -= 2 * Math.PI;
        const arc = [];
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
          const a = angS + d * (i / steps);
          arc.push(toLatLon(C[0] + R_intc * Math.cos(a), C[1] + R_intc * Math.sin(a)));
        }
        return { xc, S, arc, sweep: Math.abs(d) };
      };
      const cands = [];
      [W + R_intc, W - R_intc].forEach(cy =>
        [1, -1].forEach(s => [1, -1].forEach(dir => {
          const c = build(cy, s, dir);
          if (c && c.arc.length >= 2) cands.push(c);
        })));
      // 採点: 開始方位≈進入コース, 終了方位≈ダウンウィンド方位, 旋回量が小さい, xc<基準
      let best = null, bestScore = 1e9;
      cands.forEach(c => {
        const sHdg = bearingDeg(c.arc[0][0], c.arc[0][1], c.arc[1][0], c.arc[1][1]);
        const eHdg = bearingDeg(c.arc[c.arc.length - 2][0], c.arc[c.arc.length - 2][1],
                                c.arc[c.arc.length - 1][0], c.arc[c.arc.length - 1][1]);
        const score = angDiff(sHdg, crsTrue) + angDiff(eHdg, dwHeadingTrue)
                    + c.sweep * 30 / Math.PI                         // 旋回量ペナルティ(小)
                    + (c.xc >= L_dwext ? 500 : 0);                   // ベースターン手前であること
        if (score < bestScore) { bestScore = score; best = c; }
      });
      if (best) {
        dwEntryAlong = best.xc;
        entryTurnArc = best.arc;
        const Spos = toLatLon(best.S[0], best.S[1]);
        vorBTurnStartPos = Spos;
        vorBTurnDME = distanceNM(swe[0], swe[1], Spos[0], Spos[1]);
        vorBTurnBank = Math.round(vbBank * 10) / 10;
        // ラジアル番号(磁方位) = SWE→S の真方位 - 偏差
        const radialMag = normalizeBearing(bearingDeg(swe[0], swe[1], Spos[0], Spos[1]) - (magVar || 0));
        vorBTurnRadius = R_intc;
        vorBRadialNum = Math.round(radialMag);
        // SWEラジアル線(SWEから R-094側=機の居る東側 へ描画)
        radialLegPath = [
          swe,
          destinationPoint(swe[0], swe[1], normalizeBearing(crsTrue + 180), vorBLegNM || 6)
        ];
        downwindTurnStartPos = Spos;
      }
    }

    // ダウンウィンド/ベース/ファイナル
    baseTurnStart      = [L_dwext, W];
    const baseTurnCtr  = [L_dwext, W - R_base];
    const baseLegStart = [L_dwext + R_base, W - R_base];
    baseLegEnd         = [L_dwext + R_base, W - R_base - L_base];
    finalTurnCtr       = [L_dwext + R_base - R_final, W - R_base - L_base];
    finalRollout       = [L_dwext + R_base - R_final, W - R_base - L_base - R_final];
    crossResidual      = W - R_base - L_base - R_final;
    downwindPath = [toLatLon(dwEntryAlong, W), toLatLon(0, W), toLatLon(L_dwext, W)];
    baseTurnArc = turnArc(baseTurnCtr[0], baseTurnCtr[1], R_base, 90, 0);
    baseLegPath = [toLatLon(baseLegStart[0], baseLegStart[1]),
                   toLatLon(baseLegEnd[0],   baseLegEnd[1])];
    abeamPos = toLatLon(0, W);
    upwindPath = [];
  } else if (entryType === 'ldaW22' || entryType === 'ldaW23') {
    // LDA W22: IKL進入コース → 直接ファイナル(cross=0)へ会合
    // ダウンウィンド/ベースは描画しない
    const crsTrue = normalizeBearing(vorBCourseMag + (magVar || 0));
    const vbBank = vorBTurnBankDeg || finalTurnBankDeg || 25;
    const R_intc = turnRadiusNM(gsFinal, vbBank);
    const swe = (vorLat != null && vorLon != null && !isNaN(vorLat) && !isNaN(vorLon)) ? [vorLat, vorLon] : null;

    baseTurnStart = [L_dwext, 0];
    baseLegEnd    = [L_dwext + R_base, 0];
    finalTurnCtr  = [L_dwext + R_base, 0];
    finalRollout  = [L_dwext + R_base, 0];
    crossResidual = 0;
    downwindPath  = [];
    baseTurnArc   = [];
    baseLegPath   = [];
    abeamPos      = null;
    upwindPath    = [];

    if (swe) {
      const sweAC = toAlongCross(swe);
      const swe2AC = toAlongCross(destinationPoint(swe[0], swe[1], crsTrue, 1));
      let dx = swe2AC[0] - sweAC[0], dy = swe2AC[1] - sweAC[1];
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const sx = sweAC[0], sy = sweAC[1];
      const angDiffFn = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

      // exit at cross=0(centerline) → center at cy=±R_intc
      const buildLDA = (cy, s, dir) => {
        if (Math.abs(dy) < 1e-6) return null;
        const xc = (dy * sx + dx * (cy - sy) - s * R_intc) / dy;
        const C = [xc, cy];
        const sd = (xc - sx) * (-dy) + (cy - sy) * dx;
        const S = [xc + sd * dy, cy - sd * dx];
        const angS = Math.atan2(S[1] - C[1], S[0] - C[0]);
        const angE = (cy > 0) ? -Math.PI / 2 : Math.PI / 2;
        let d = angE - angS;
        d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (dir < 0) d -= 2 * Math.PI;
        const arc = [];
        for (let i = 0; i <= 24; i++) {
          const a = angS + d * (i / 24);
          arc.push(toLatLon(C[0] + R_intc * Math.cos(a), C[1] + R_intc * Math.sin(a)));
        }
        return { xc, S, arc, sweep: Math.abs(d) };
      };

      const cands = [];
      [R_intc, -R_intc].forEach(cy =>
        [1, -1].forEach(s => [1, -1].forEach(dir => {
          const c = buildLDA(cy, s, dir);
          if (c && c.arc.length >= 2) cands.push(c);
        })));

      let best = null, bestScore = 1e9;
      cands.forEach(c => {
        const sHdg = bearingDeg(c.arc[0][0], c.arc[0][1], c.arc[1][0], c.arc[1][1]);
        const eHdg = bearingDeg(c.arc[c.arc.length - 2][0], c.arc[c.arc.length - 2][1],
                                c.arc[c.arc.length - 1][0], c.arc[c.arc.length - 1][1]);
        const score = angDiffFn(sHdg, crsTrue) + angDiffFn(eHdg, trueHeading)
                    + c.sweep * 30 / Math.PI
                    + (c.xc <= 0 ? 500 : 0);
        if (score < bestScore) { bestScore = score; best = c; }
      });

      if (best) {
        finalRollout = [best.xc, 0];
        finalTurnCtr = [best.xc, 0];
        crossResidual = 0;
        entryTurnArc = best.arc;
        const Spos = toLatLon(best.S[0], best.S[1]);
        vorBTurnStartPos = Spos;
        vorBTurnDME    = distanceNM(swe[0], swe[1], Spos[0], Spos[1]);
        vorBTurnBank   = Math.round(vbBank * 10) / 10;
        vorBTurnRadius = R_intc;
        vorBRadialNum  = Math.round(normalizeBearing(bearingDeg(swe[0], swe[1], Spos[0], Spos[1]) - (magVar || 0)));
        // IKL東方向 → IKL → 旋回開始点
        radialLegPath = [
          destinationPoint(swe[0], swe[1], normalizeBearing(crsTrue + 180), vorBLegNM || 8),
          swe,
          Spos
        ];
        downwindTurnStartPos = Spos;
      }
    }
  } else {
    // 標準: (Upwind →) ダウンウィンド → ベースターン → ベースレグ
    // Upwind末端(=クロスウィンドターン開始) = 離陸側末端(-滑走路長)から更にUpwind長ぶん先
    const cwTurnEntryAlong = -((runwayLengthNM || 0) + L_upwind);
    // ダウンウィンド始点 along = クロスウィンドターン(-R_cw) + ダウンウィンドターン(+R_dw)
    const dwEntryAlong = cwTurnEntryAlong - R_cw + R_dw;
    baseTurnStart      = [L_dwext, W];                    // ベースターン開始(=ダウンウィンド終端)
    const baseTurnCtr  = [L_dwext, W - R_base];
    const baseLegStart = [L_dwext + R_base, W - R_base];
    baseLegEnd         = [L_dwext + R_base, W - R_base - L_base];
    finalTurnCtr       = [L_dwext + R_base - R_final, W - R_base - L_base];
    finalRollout       = [L_dwext + R_base - R_final, W - R_base - L_base - R_final];
    crossResidual      = W - R_base - L_base - R_final;   // ファイナルの中心線からの横ずれ
    downwindPath = [
      toLatLon(dwEntryAlong, W),
      toLatLon(0, W),          // Abeam THR
      toLatLon(L_dwext, W)     // ベースターン開始
    ];
    baseTurnArc = turnArc(baseTurnCtr[0], baseTurnCtr[1], R_base, 90, 0);
    baseLegPath = [toLatLon(baseLegStart[0], baseLegStart[1]),
                   toLatLon(baseLegEnd[0],   baseLegEnd[1])];
    abeamPos = toLatLon(0, W);

    // Upwind → クロスウィンドターン(90°) → クロスウィンドレグ → ダウンウィンドターン(90°) → ダウンウィンド
    const depEndAlong = -(runwayLengthNM || 0);   // 離陸側末端(例:16R運用→34L末端)
    upwindPath = [
      toLatLon(0, 0),                   // 着陸末端(滑走路上を上昇)
      toLatLon(depEndAlong, 0),         // 離陸側末端(基準)
      toLatLon(cwTurnEntryAlong, 0)     // Upwind末端 = クロスウィンドターン開始
    ];
    // クロスウィンドターン(90°): 中心線(heading 着陸方向) → クロスウィンド(+cross)
    crosswindTurnArc = turnArc(cwTurnEntryAlong, R_cw, R_cw, 270, 180);
    // クロスウィンドレグ
    crosswindLegPath = [
      toLatLon(cwTurnEntryAlong - R_cw, R_cw),
      toLatLon(cwTurnEntryAlong - R_cw, R_cw + L_cross)
    ];
    // ダウンウィンドターン(90°): クロスウィンド(+cross) → ダウンウィンド(+along, cross=W)
    downwindTurnArc = turnArc(cwTurnEntryAlong - R_cw + R_dw, R_cw + L_cross, R_dw, 180, 90);
    downwindTurnStartPos = toLatLon(cwTurnEntryAlong, 0);  // クロスウィンドターン開始(Upwind終端)
  }
  const finalTurnArc = (entryType === 'ldaW22' || entryType === 'ldaW23') ? [] : turnArc(finalTurnCtr[0], finalTurnCtr[1], R_final, 0, -90);

  // --- 3° グライドパス (真の中心線上, MDAから接地点) ---
  const heightAboveThr = Math.max(0, mda - thr_elev);
  const fafDistNM = altToDistNM(heightAboveThr);
  const fafPos = toLatLon(fafDistNM, 0);                       // VDP(中心線上)
  const vdpOnFinal = toLatLon(fafDistNM, crossResidual);      // VDP(ファイナルトラック上)
  const vdpBeyondRollout = fafDistNM > finalRollout[0];       // VDPがパターン外側か

  // ファイナル(実飛行): ロールアウト点 → 接地点手前
  const finalPath = [
    toLatLon(finalRollout[0], crossResidual),
    toLatLon(-0.3, crossResidual)
  ];
  // 延長ファイナル: VDPがパターン外側のとき、VDP → ロールアウト点(点線で区別表示)
  const extendedFinalPath = vdpBeyondRollout
    ? [toLatLon(fafDistNM, crossResidual), toLatLon(finalRollout[0], crossResidual)]
    : null;
  const glidepathPoints = [];
  for (let d = 0; d <= fafDistNM + 0.05; d += 0.1) {
    glidepathPoints.push({
      pos: toLatLon(d, 0),
      alt: thr_elev + distToAltFt(d),
      dist: d
    });
  }

  // --- VDP をトラック(サーキット)沿いに配置 ---
  // 接地点から飛行経路を逆走(外側へ)し、累積トラック距離 = fafDistNM の点を求める
  // = ファイナル直線距離 + 旋回の曲線距離 + ... の合計が VDP距離 に達する点
  const rev = a => (a && a.length ? a.slice().reverse() : []);
  const outboundTrack = [
    toLatLon(0, crossResidual),                       // 接地点(ファイナル上)
    toLatLon(finalRollout[0], crossResidual),         // ファイナルロールアウト(サーキット会合点)
    ...rev(finalTurnArc),                             // ロールアウト → ベースレグ端(曲線)
    ...rev(baseLegPath),                              // ベースレグ
    ...rev(baseTurnArc),                             // ベースターン(曲線)
    ...rev(downwindPath),                            // ダウンウィンド
    ...rev(downwindTurnArc),                         // ダウンウィンドターン(曲線)
    ...rev(crosswindLegPath),                        // クロスウィンドレグ
    ...rev(crosswindTurnArc),                        // クロスウィンドターン(曲線)
    ...rev(upwindPath),                              // Upwind
    ...rev(entryTurnArc),                            // VOR B 進入ターン
    ...rev(radialLegPath)                            // VOR B ラジアル
  ];
  function pointAlongPolyline(pts, targetNM) {
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = distanceNM(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]);
      if (acc + seg >= targetNM && seg > 1e-9) {
        const f = (targetNM - acc) / seg;
        const pos = [pts[i][0] + (pts[i+1][0]-pts[i][0])*f,
                     pts[i][1] + (pts[i+1][1]-pts[i][1])*f];
        // 飛行方位(接地点方向＝outboundの逆): pts[i+1]→pts[i]
        const hdgTrue = bearingDeg(pts[i+1][0], pts[i+1][1], pts[i][0], pts[i][1]);
        return { pos, total: acc + seg, reached: true, hdgTrue };
      }
      acc += seg;
    }
    return { pos: pts.length ? pts[pts.length-1] : null, total: acc, reached: false, hdgTrue: null };
  }
  const vdpTrack = pointAlongPolyline(outboundTrack, fafDistNM);
  const vdpOnCircuit = vdpTrack.pos;          // トラック沿いVDP(サーキット上)
  const vdpTrackReached = vdpTrack.reached;   // パターン内に収まったか
  const vdpHeadingTrue = vdpTrack.hdgTrue;    // VDP点の飛行方位(真)

  return {
    upwindPath,
    crosswindTurnArc,
    crosswindLegPath,
    downwindTurnArc,
    downwindTurnStartPos,
    radialLegPath,
    entryTurnArc,
    vorBTeardropSec,
    vorBTurnStartPos,
    vorBTurnDME,
    vorBTurnBank,
    vorBTurnRadius,
    vorBRadialNum,
    downwindPath,
    baseTurnArc,
    baseLegPath,
    finalTurnArc,
    finalPath,
    extendedFinalPath,
    abeamPos,
    fafPos,
    vdpOnFinal,
    vdpOnCircuit,
    vdpTrackReached,
    vdpHeadingTrue,
    vdpBeyondRollout,
    // 基準点(VORリファレンス用)
    ldaRolloutDistNM: finalRollout[0],   // LDA: Final会合点のTHRからの距離(NM)
    baseTurnStartPos: toLatLon(baseTurnStart[0], baseTurnStart[1]),
    finalTurnStartPos: toLatLon(baseLegEnd[0], baseLegEnd[1]),
    fafDistNM,
    heightAboveThr,
    glidepathPoints,
    // 風・GS情報（滑走路/Base/DW方位ごと）
    windInfo: {
      windSpeedKt: wKt,
      windDirMag: Math.round(normalizeBearing(windDir || 0)),
      windDirTrue: Math.round(windDirTrue),
      legs: {
        upwind:    { hdg: Math.round(upwindHeading),    fhdg: Math.round(flightHeading(upwindHeading, upwindSpeedKt)),       gs: Math.round(gsUpwind),    head: Math.round(-windAlong(upwindHeading)),    cross: Math.round(windCross(upwindHeading)) },
        crosswind: { hdg: Math.round(crosswindHeading), fhdg: Math.round(flightHeading(crosswindHeading, crosswindSpeedKt)), gs: Math.round(gsCrosswind), head: Math.round(-windAlong(crosswindHeading)), cross: Math.round(windCross(crosswindHeading)) },
        downwind:  { hdg: Math.round(dwHeading),        fhdg: Math.round(flightHeading(dwHeading, downwindSpeedKt)),         gs: Math.round(gsDownwind),  head: Math.round(-windAlong(dwHeading)),        cross: Math.round(windCross(dwHeading)) },
        base:      { hdg: Math.round(baseTrackBearing), fhdg: Math.round(flightHeading(baseTrackBearing, baseTurnSpeedKt)),  gs: Math.round(gsBase),      head: Math.round(-windAlong(baseTrackBearing)), cross: Math.round(windCross(baseTrackBearing)) },
        final:     { hdg: Math.round(finalHeading),     fhdg: Math.round(flightHeading(finalHeading, finalSpeedKt)),         gs: Math.round(gsFinal),     head: Math.round(-windAlong(finalHeading)),     cross: Math.round(windCross(finalHeading)) },
      },
      R_base, R_final, gsBaseTurn: Math.round(gsBaseTurn), gsFinalTurn: Math.round(gsFinalTurn),
      proposedCrosswindTurnBank: Math.round(proposedCrosswindTurnBank * 10) / 10,
      proposedDownwindTurnBank: Math.round(proposedDownwindTurnBank * 10) / 10,
      gsCwTurn: Math.round(gsCwTurn),
      gsDwTurn: Math.round(gsDwTurn),
      proposedBaseBank: Math.round(proposedBaseBank * 10) / 10,
      proposedFinalBank: Math.round(proposedFinalBank * 10) / 10,
      targetRbf: Math.round(targetRbf * 100) / 100
    },
    // 参考情報
    R_base, R_final, L_dwext, L_base, crossResidual
  };
}
