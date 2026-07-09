// ===== Aiming Point Tab =====
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  const AC = {
    'B747-8F':  { eyeHt: 20.9 },
    'B747-400': { eyeHt: 15.3 },
    'B767-300': { eyeHt: 6.9  },
    'B737-900': { eyeHt: 1.1  },
  };

  // Aiming Point 標準値（B747-8F用）
  const AIM_STANDARDS = {
    japan: { aimFt: 1312, stripeFt: 197, label: '日本標準（PAPI有無不問）' },
    icao:  { aimFt: 1312, stripeFt: 148, label: 'ICAO標準' },
    faa:   { aimFt: 1000, stripeFt: 150, label: 'FAA標準' },
    china: {
      aimFt: 1505,
      stripeFt: 197,
      label: 'CHINA標準',
      supplementaryLinesM: [144.3, 293.5, 593.66, 893.18],
      supplementaryStripes: [3, 3, 2, 1]
    },
  };

  // Landing Threshold 座標（displaced threshold 考慮）
  function landingTH(rwy) {
    const thLat  = rwy.threshold[0];
    const thLon  = rwy.threshold[1];
    const hdgRad = (rwy.trueHeading || 0) * Math.PI / 180;
    const cosLat = Math.cos(thLat * Math.PI / 180);
    const dispM  = (rwy.displaced_ft || 0) * 0.3048;
    return {
      lat: thLat + dispM * Math.cos(hdgRad) / 111000,
      lon: thLon + dispM * Math.sin(hdgRad) / (111000 * cosLat),
      hdgRad, cosLat,
    };
  }

  function currentAimApRw() {
    const apSel = el('aim-airport-sel');
    const rwSel = el('aim-runway-sel');
    return {
      apCode: apSel ? apSel.value : 'RJAA',
      rwCode: rwSel ? rwSel.value : '16R',
    };
  }

  function currentAimRwy() {
    if (typeof AIRPORTS === 'undefined') return null;
    const { apCode, rwCode } = currentAimApRw();
    const ap = AIRPORTS[apCode];
    return ap ? ap.runways[rwCode] : null;
  }

  function updateAimRunwayOptions() {
    const apSel = el('aim-airport-sel');
    const rwSel = el('aim-runway-sel');

    console.log('updateAimRunwayOptions called');
    console.log('  apSel:', apSel?.value, 'rwSel:', rwSel?.value);
    console.log('  AIRPORTS defined:', typeof AIRPORTS !== 'undefined');

    if (!apSel || !rwSel || typeof AIRPORTS === 'undefined') {
      console.log('updateAimRunwayOptions: ❌ missing elements or AIRPORTS');
      return;
    }

    const ap = AIRPORTS[apSel.value];
    console.log('  AIRPORTS[' + apSel.value + ']:', ap);

    if (!ap) {
      console.log('updateAimRunwayOptions: ❌ airport not found', apSel.value);
      return;
    }

    if (!ap.runways) {
      console.log('updateAimRunwayOptions: ❌ no runways property', ap);
      return;
    }

    const cur = rwSel.value;
    const rwKeys = Object.keys(ap.runways);
    console.log('  ✅ Updating runways. Current:', cur, 'Available:', rwKeys);

    rwSel.innerHTML = rwKeys
      .map(r => {
        const rwy = ap.runways[r];
        const isDisabled = rwy?.disabled ? ' disabled' : '';
        const displayText = rwy?.disabled ? r + ' (B747-8F 使用不可)' : r;
        return `<option value="${r}"${r === cur ? ' selected' : ''}${isDisabled}>${displayText}</option>`;
      })
      .join('');

    if (rwKeys.length > 0 && !rwKeys.includes(cur)) {
      rwSel.value = rwKeys[0];
      console.log('  ✅ Set default runway to', rwKeys[0]);
    }
  }

  // ICAOコードのprefixでICAO/FAA標準を判別
  function defaultAimFt(apCode) {
    const p = (apCode || '')[0].toUpperCase();
    return (p === 'K' || p === 'P') ? 1000 : 1312;  // FAA: 1000ft / ICAO: 1312ft(400m)
  }

  function loadAimIlsDefaults() {
    const rwy = currentAimRwy();
    if (!rwy) return;

    // ILS データ入力フィールドの有効/無効を切り替え
    const ilsInputs = [el('aim-angle'), el('aim-gsant'), el('aim-papi')];
    if (!rwy.ils) {
      ilsInputs.forEach(inp => {
        if (inp) {
          inp.disabled = true;
          inp.style.opacity = '0.5';
          inp.style.backgroundColor = '#e0e0e0';
          inp.style.cursor = 'not-allowed';
        }
      });
      return;
    } else {
      ilsInputs.forEach(inp => {
        if (inp) {
          inp.disabled = false;
          inp.style.opacity = '1';
          inp.style.backgroundColor = '';
          inp.style.cursor = 'auto';
        }
      });
    }
    const ils = rwy.ils;
    const angle = ils.gpAngle || 3.0;
    const { apCode } = currentAimApRw();
    const aimFtDefault = ils.aimFt || defaultAimFt(apCode);
    const setN = (id, v) => {
      const e = el(id); if (!e || v === undefined) return;
      e.value = v;
      const badge = document.getElementById(id + '-val');
      if (badge) badge.textContent = Math.round(v) + 'ft';
    };
    setN('aim-angle', angle.toFixed(2));
    // PAPI基準角度（設置角）: データにあれば使用、なければ3.0°
    {
      const pa = el('aim-papi-angle');
      const paVal = ils.papiAngle || 3.0;
      if (pa) {
        pa.value = paVal;
        const b = document.getElementById('aim-papi-angle-val');
        if (b) b.textContent = paVal.toFixed(2) + '°';
      }
    }
    setN('aim-gsant', ils.gsAntFt);
    setN('aim-papi',  ils.papiFt);
    setN('aim-aim',   aimFtDefault);
    updateAimInfo();

    // 空港ごとのAiming Point標準値をデフォルト選択
    let stdBtn = null;
    const japanAps = ['RJAA', 'RJTT', 'RJGG', 'RJFR']; // 日本空港
    const faaAps = ['PANC', 'KLAX', 'KORD']; // FAA空港

    if (japanAps.includes(apCode)) {
      stdBtn = document.querySelector('.aim-std-btn[data-std="japan"]');
    } else if (faaAps.includes(apCode)) {
      stdBtn = document.querySelector('.aim-std-btn[data-std="faa"]');
    } else {
      stdBtn = document.querySelector('.aim-std-btn[data-std="icao"]');
    }

    if (stdBtn) stdBtn.click();
  }

  function updateAimInfo() {
    const info = el('aim-info');
    if (!info) return;
    const rwy      = currentAimRwy();
    const angle    = parseFloat(el('aim-angle').value) || 3.0;
    const gsAntFt  = parseFloat(el('aim-gsant').value) || 1115;
    const papiFt   = parseFloat(el('aim-papi').value)  || 1414;
    const aimFt    = parseFloat(el('aim-aim').value)   || 1312;
    const acType   = el('aim-aircraft') ? el('aim-aircraft').value : 'B747-8F';
    const eyeHt    = (AC[acType] || AC['B747-8F']).eyeHt;
    const vAimFt   = aimFt + eyeHt / Math.tan(angle * Math.PI / 180);
    const gsfEyeFt = (rwy && rwy.ils) ? (gsAntFt + 400) : papiFt;
    const tdze     = rwy ? (rwy.tdze || 0) : 0;
    info.innerHTML =
      `GP: ${angle}°&nbsp; TH: ${tdze}ft<br>` +
      `GS Ant: ${gsAntFt}ft (${Math.round(gsAntFt*0.3048)}m)<br>` +
      `PAPI: ${papiFt}ft (${Math.round(papiFt*0.3048)}m)<br>` +
      (rwy && rwy.ils ? `<span style="color:#ffe082">G/S Follow Eye Aim: ${gsfEyeFt}ft (${Math.round(gsfEyeFt*0.3048)}m)</span>` : '');
  }

  // ===== パイロット視点 描画 =====
  function drawAimingPoint() {
    if (animRunning) return;  // アニメーション中は静止画を描かない
    const canvas = el('aim-canvas');
    const view   = el('aim-view');
    if (!canvas || !view || view.style.display === 'none') return;

    const rwy = currentAimRwy();
    const W = canvas.clientWidth  || 800;
    const H = canvas.clientHeight || 540;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!rwy) {
      ctx.fillStyle = '#0d1b2a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#546e7a'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('滑走路データなし', W/2, H/2);
      return;
    }

    const gsAntFt  = parseFloat(el('aim-gsant').value) || 1115;
    const papiFt   = parseFloat(el('aim-papi').value)  || 1414;
    const aimFt    = parseFloat(el('aim-aim').value)   || 1312;
    const stripeFt = parseFloat(el('aim-stripe').value)|| 197;
    const angle    = parseFloat(el('aim-angle').value) || 3.0;
    const acType   = el('aim-aircraft') ? el('aim-aircraft').value : 'B747-8F';

    const { apCode } = currentAimApRw();
    drawPilotView(ctx, W, H, gsAntFt, papiFt, aimFt, stripeFt, angle, acType, rwy, apCode);
    drawRunwayDiagram();
  }

  // ===== パイロット進入視点 パース描画 =====
  function drawPilotView(ctx, W, H, gsAntFt, papiFt, aimFt, stripeFt, angle, acType, rwy, apCode) {
    const { rwCode } = currentAimApRw();
    const eyeHt     = (AC[acType] || AC['B747-8F']).eyeHt;
    const tdze      = rwy ? (rwy.tdze || 0) : 0;

    // ---- 距離（m換算） ----
    const gsAntM    = gsAntFt  * 0.3048;
    const papiM     = papiFt   * 0.3048;
    const aimM      = aimFt    * 0.3048;
    const stripeM   = stripeFt * 0.3048;

    // Pilot Eye Aim（標準: Aiming Point基準）
    const vAimFt  = aimFt + eyeHt / Math.tan(angle * Math.PI / 180);
    const vAimM   = vAimFt * 0.3048;

    // G/S Follow Eye（GS Ant + 400ft、ILSある場合）
    // ILSなし場合は papiFt に収束
    const gsfEyeFt = (rwy && rwy.ils) ? (gsAntFt + 400) : papiFt;
    const gsfEyeM  = gsfEyeFt * 0.3048;

    // ---- パース変換パラメータ ----
    const D_ref  = 800;          // パイロット目からTHまでの参照距離(m)
    const H_hor  = H * 0.38;     // 水平線 y 位置
    const H_th   = H * 0.82;     // TH の y 位置（進入手前から末端全体が見える高さ）
    const xCen   = W / 2;

    // 距離 xM (THから)→ y座標
    function yAt(xM) {
      return H_hor + (H_th - H_hor) * D_ref / (D_ref + Math.max(xM, 0));
    }
    // 距離 xM → 滑走路半幅(px)
    function hwAt(xM) {
      return W * 0.31 * D_ref / (D_ref + Math.max(xM, 0));
    }

    // ---- 背景: 空 ----
    const skyG = ctx.createLinearGradient(0, 0, 0, H_hor + 50);
    skyG.addColorStop(0,   '#060d16');
    skyG.addColorStop(0.6, '#0d1e30');
    skyG.addColorStop(1,   '#1a3555');
    ctx.fillStyle = skyG;
    ctx.fillRect(0, 0, W, H_hor + 50);

    // ---- 背景: 地面（草） ----
    const gndG = ctx.createLinearGradient(0, H_hor + 20, 0, H);
    gndG.addColorStop(0, '#0a1208');
    gndG.addColorStop(1, '#111a0c');
    ctx.fillStyle = gndG;
    ctx.fillRect(0, H_hor + 20, W, H - H_hor - 20);

    // 水平線のぼかし
    ctx.fillStyle = 'rgba(80,140,200,0.07)';
    ctx.fillRect(0, H_hor - 4, W, 18);

    // ---- 滑走路アスファルト ----
    const FAR = 2200;
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath();
    ctx.moveTo(xCen - hwAt(FAR), yAt(FAR));
    ctx.lineTo(xCen + hwAt(FAR), yAt(FAR));
    ctx.lineTo(xCen + hwAt(0),   yAt(0));
    ctx.lineTo(xCen - hwAt(0),   yAt(0));
    ctx.closePath();
    ctx.fill();

    // 滑走路エッジライン（黄色）
    ctx.strokeStyle = '#b89000'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(xCen - hwAt(0), yAt(0));
    ctx.lineTo(xCen - hwAt(FAR), yAt(FAR));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xCen + hwAt(0), yAt(0));
    ctx.lineTo(xCen + hwAt(FAR), yAt(FAR));
    ctx.stroke();

    // ---- 台形 quad ヘルパー（白い滑走路標識用） ----
    function quad(x0M, x1M, lFrac, rFrac, color) {
      const y0 = yAt(x0M), y1 = yAt(x1M);
      const hw0 = hwAt(x0M), hw1 = hwAt(x1M);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(xCen + hw0 * lFrac, y0);
      ctx.lineTo(xCen + hw0 * rFrac, y0);
      ctx.lineTo(xCen + hw1 * rFrac, y1);
      ctx.lineTo(xCen + hw1 * lFrac, y1);
      ctx.closePath();
      ctx.fill();
    }

    // ---- センターライン（白破線） ----
    ctx.setLineDash([]);
    for (let xM = 12; xM < FAR; xM += 50) {
      const lw = Math.max(1, hwAt(xM) * 0.045);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(xCen, yAt(xM)); ctx.lineTo(xCen, yAt(xM + 24)); ctx.stroke();
    }

    // ---- 標識: TH バー（12本: 6本ずつ両側, ICAO 30m長, 中央ギャップあり） ----
    for (const [lf, rf] of [
      [-0.21,-0.15],[-0.33,-0.27],[-0.45,-0.39],[-0.57,-0.51],[-0.69,-0.63],[-0.81,-0.75],
      [ 0.15, 0.21],[ 0.27, 0.33],[ 0.39, 0.45],[ 0.51, 0.57],[ 0.63, 0.69],[ 0.75, 0.81],
    ]) {
      quad(0, 30, lf, rf, 'rgba(255,255,255,0.93)');
    }

    // ---- FAA vs ICAO vs CHINA判定（KLAX=K、PANC=P → FAA方式）----
    const isFAA = ((apCode || '')[0] === 'K' || (apCode || '')[0] === 'P');
    const isCHINA = apCode === 'ZSPD';

    // ---- 標識: Aiming Pointマーキング ----
    // FAA: 1000ft(304.8m)固定 / ICAO: aimFt位置（既存動作を維持）
    const apMarkNear = isFAA ? 304.8 : (aimM - 60);   // FAA: 1000ft near edge
    const apMarkFar  = isFAA ? 350.5 : aimM;           // FAA: 1150ft far edge (150ft長)
    quad(apMarkNear, apMarkFar, -0.60, -0.20, 'rgba(255,255,255,0.90)');
    quad(apMarkNear, apMarkFar,  0.20,  0.60, 'rgba(255,255,255,0.90)');

    // ---- 標識: TDZストライプ（Aiming Pointゾーンと重複する位置はスキップ）----
    function inAimZone(xM) {
      return xM + 22 > apMarkNear && xM < apMarkFar;
    }

    if (isCHINA) {
      // CHINA方式: 144.3m (3本), 293.5m (3本), 593.66m (2本), 893.18m (1本)
      const chinaMarks = [
        { dist: 144.3, count: 3 },
        { dist: 293.5, count: 3 },
        { dist: 593.66, count: 2 },
        { dist: 893.18, count: 1 }
      ];
      for (const mark of chinaMarks) {
        if (inAimZone(mark.dist)) continue;
        const stripes = mark.count === 3
          ? [[-0.25,-0.15],[-0.40,-0.30],[-0.55,-0.45], [ 0.15, 0.25],[ 0.30, 0.40],[ 0.45, 0.55]]
          : mark.count === 2
          ? [[-0.25,-0.15],[-0.40,-0.30], [ 0.15, 0.25],[ 0.30, 0.40]]
          : [[-0.25,-0.15], [ 0.15, 0.25]];
        const opacity = mark.count === 3 ? 0.82 : mark.count === 2 ? 0.75 : 0.75;
        for (const [lf, rf] of stripes) {
          quad(mark.dist, mark.dist + 22, lf, rf, `rgba(255,255,255,${opacity})`);
        }
      }
    } else if (isFAA) {
      // FAA方式: 500ft/1500ft/2000ft/2500ft/3000ft（1000ft=Aiming Point位置のためスキップ）
      // 500ft (152.4m): 3本ずつ両側
      for (const [lf, rf] of [
        [-0.25,-0.15],[-0.40,-0.30],[-0.55,-0.45],
        [ 0.15, 0.25],[ 0.30, 0.40],[ 0.45, 0.55],
      ]) {
        quad(152.4, 174.4, lf, rf, 'rgba(255,255,255,0.82)');
      }
      // 1500ft (457.2m): 3本ずつ両側
      if (!inAimZone(457.2)) {
        for (const [lf, rf] of [
          [-0.25,-0.15],[-0.40,-0.30],[-0.55,-0.45],
          [ 0.15, 0.25],[ 0.30, 0.40],[ 0.45, 0.55],
        ]) {
          quad(457.2, 479.2, lf, rf, 'rgba(255,255,255,0.82)');
        }
      }
      // 2000ft (609.6m): 2本ずつ
      if (!inAimZone(609.6)) {
        for (const [lf, rf] of [
          [-0.25,-0.15],[-0.40,-0.30],
          [ 0.15, 0.25],[ 0.30, 0.40],
        ]) {
          quad(609.6, 631.6, lf, rf, 'rgba(255,255,255,0.75)');
        }
      }
      // 2500ft (762.0m) / 3000ft (914.4m): 1本ずつ
      for (const xM of [762.0, 914.4]) {
        if (inAimZone(xM)) continue;
        for (const [lf, rf] of [[-0.25,-0.15],[ 0.15, 0.25]]) {
          quad(xM, xM + 22, lf, rf, 'rgba(255,255,255,0.75)');
        }
      }
    } else {
      // ICAO方式: 150/300/450m: 3本ずつ両側
      for (const xM of [150, 300, 450]) {
        if (inAimZone(xM)) continue;
        for (const [lf, rf] of [
          [-0.25,-0.15],[-0.40,-0.30],[-0.55,-0.45],
          [ 0.15, 0.25],[ 0.30, 0.40],[ 0.45, 0.55],
        ]) {
          quad(xM, xM + 22, lf, rf, 'rgba(255,255,255,0.82)');
        }
      }
      // 600m: 2本ずつ
      if (!inAimZone(600)) {
        for (const [lf, rf] of [
          [-0.25,-0.15],[-0.40,-0.30],
          [ 0.15, 0.25],[ 0.30, 0.40],
        ]) {
          quad(600, 622, lf, rf, 'rgba(255,255,255,0.75)');
        }
      }
      // 750m/900m: 1本ずつ
      for (const xM of [750, 900]) {
        if (inAimZone(xM)) continue;
        for (const [lf, rf] of [[-0.25,-0.15],[ 0.15, 0.25]]) {
          quad(xM, xM + 22, lf, rf, 'rgba(255,255,255,0.75)');
        }
      }
    }

    // ---- ラインアノテーション ヘルパー ----
    function horizLine(xM, color, lw) {
      const y = yAt(xM), hw = hwAt(xM);
      ctx.strokeStyle = color; ctx.lineWidth = lw || 2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(xCen - hw, y); ctx.lineTo(xCen + hw, y); ctx.stroke();
    }

    // side: -1=左ラベル, +1=右ラベル / yBias: ラベルを縦にずらすpx
    function annotLabel(text, sub, xM, side, color, yBias) {
      yBias = yBias || 0;
      const actualY = yAt(xM), hw = hwAt(xM);
      const bw = 148, bh = 30;
      const edgeX = side > 0 ? xCen + hw + 5 : xCen - hw - 5;
      const bx = Math.max(2, Math.min(W - bw - 2, side > 0 ? edgeX : edgeX - bw));
      const labelCY = Math.max(bh/2 + 4, Math.min(H - bh/2 - 4, actualY + yBias));
      const by = labelCY - bh / 2;
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(side > 0 ? xCen + hw : xCen - hw, actualY);
      ctx.lineTo(side > 0 ? bx : bx + bw, labelCY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.80)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = color; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(text, bx + bw/2, by + 12);
      ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.font = '9px sans-serif';
      ctx.fillText(sub, bx + bw/2, by + 24);
    }

    // ---- TDZ / Aiming Point 補助線（白破線）----
    const tdzAnnot = isCHINA
      ? [[144.3, '144.3m'], [293.5, '293.5m'], [593.66, '593.66m'], [893.18, '893.18m']]
      : isFAA
      ? [[152.4, '152m (500ft TDZ)'], [304.8, '305m (1000ft AP)']]
      : [[150, '150m (492ft)'], [300, '300m (984ft)']];
    for (const [distM, label] of tdzAnnot) {
      const y  = yAt(distM), hw = hwAt(distM);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(xCen - hw, y); ctx.lineTo(xCen + hw, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(label, xCen + hw + 6, y + 4);
    }

    // ---- GS Ant（緑）---- (ILS ある場合のみ)
    if (rwy && rwy.ils) {
      horizLine(gsAntM, '#69f0ae', 2);
      annotLabel(`G/S Ant  ${Math.round(gsAntM)}m`, `(${gsAntFt}ft from TH)`, gsAntM, -1, '#69f0ae', H * 0.07);
    }

    // ---- PAPI（赤）+ 4灯表示（papiSide L/R 対応、滑走路外側に配置）----
    horizLine(papiM, '#ef5350', 2);
    annotLabel(`PAPI  ${Math.round(papiM)}m`, `(${papiFt}ft from TH)`, papiM, 1, '#ef5350', H * 0.05);
    {
      const papiSide = rwy?.papi?.side || rwy?.ils?.papiSide || 'L';
      const isLeft   = papiSide === 'L';
      const y_p  = yAt(papiM), hw_p = hwAt(papiM);
      const sz   = Math.max(3, hw_p * 0.13 - 2);   // 2pt 小さく
      const gap  = sz + 2;
      // 左右それぞれエッジ外側（滑走路内には描かない）
      // Left: 内側(右)→外側(左)の順に配置、色はW→W→R→R（内側から外へ）
      // Right: 内側(左)→外側(右)、色はW→W→R→R
      for (let i = 0; i < 4; i++) {
        const lx = isLeft
          ? xCen - hw_p - 4 - sz - i * gap   // 左エッジ外、外側へ
          : xCen + hw_p + 4 + i * gap;        // 右エッジ外、外側へ
        // on-glidepath: 内側2灯=White, 外側2灯=Red
        ctx.fillStyle = i < 2 ? '#f5f5f5' : '#e53935';
        ctx.fillRect(lx, y_p - sz/2, sz, sz);
        ctx.strokeStyle = '#444'; ctx.lineWidth = 0.5;
        ctx.strokeRect(lx, y_p - sz/2, sz, sz);
      }
      const lblX = isLeft
        ? xCen - hw_p - 4 - 4*gap
        : xCen + hw_p + 4;
      ctx.fillStyle = '#ef5350'; ctx.font = '7px sans-serif';
      ctx.textAlign = isLeft ? 'right' : 'left';
      ctx.fillText('WWRR', lblX + (isLeft ? 0 : 4*gap), y_p + sz/2 + 8);
    }


    // ---- G/S Follow Eye Aim（黄色ダイヤ、センター、ILSある場合のみ） ----
    if (rwy && rwy.ils) {
      const y_g = yAt(gsfEyeM);
      const bw = 180, bh = 30;
      const biasPx = -H * 0.025;
      const bx = Math.max(4, Math.min(W - bw - 4, xCen - 14 - bw));
      const by = Math.max(4, Math.min(H - bh - 4, y_g + biasPx - bh/2));
      // リーダーライン（ダイヤ→ラベル）
      ctx.strokeStyle = 'rgba(255,224,130,0.65)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(xCen - 8, y_g); ctx.lineTo(bx + bw, by + bh/2); ctx.stroke();
      ctx.setLineDash([]);
      // ダイヤマーカー
      ctx.fillStyle = '#ffe082';
      ctx.beginPath();
      ctx.moveTo(xCen,     y_g - 8);
      ctx.lineTo(xCen + 8, y_g);
      ctx.lineTo(xCen,     y_g + 8);
      ctx.lineTo(xCen - 8, y_g);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xCen,     y_g - 8);
      ctx.lineTo(xCen + 8, y_g);
      ctx.lineTo(xCen,     y_g + 8);
      ctx.lineTo(xCen - 8, y_g);
      ctx.closePath(); ctx.stroke();
      // ラベルボックス
      ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#ffe082'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#ffe082'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`G/S Follow Eye Aim  ${Math.round(gsfEyeM)}m`, bx + bw/2, by + 12);
      ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = '9px sans-serif';
      ctx.fillText(`GS Ant+400ft = ${gsfEyeFt}ft`, bx + bw/2, by + 23);
    }



    // ---- タイトルボックス（右上） ----
    ctx.font = 'bold 13px sans-serif';
    const t1 = `${apCode}  RWY ${rwCode}`;
    const t2 = `GP ${angle}°   TH ${tdze}ft`;
    const tw = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) + 22;
    const tx = W - tw - 8, ty = 8;
    ctx.fillStyle = 'rgba(0,0,20,0.84)'; ctx.fillRect(tx, ty, tw, 48);
    ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1; ctx.strokeRect(tx, ty, tw, 48);
    ctx.fillStyle = '#4fc3f7'; ctx.textAlign = 'center';
    ctx.fillText(t1, tx + tw/2, ty + 18);
    ctx.fillStyle = '#90a4ae'; ctx.font = '10px sans-serif';
    ctx.fillText(t2, tx + tw/2, ty + 36);

    // ---- 凡例（左下） ----
    const leg = [
      { color: '#69f0ae', label: 'G/S Ant' },
      { color: '#ef5350', label: 'PAPI' },
      { color: '#ffe082', label: 'G/S Follow Eye Aim (◇)' },
    ];
    const legX = 8, legY = H - 8 - leg.length * 18;
    ctx.fillStyle = 'rgba(0,0,0,0.60)';
    ctx.fillRect(legX - 4, legY - 4, 175, leg.length * 18 + 8);
    leg.forEach((item, i) => {
      ctx.fillStyle = item.color; ctx.fillRect(legX, legY + i*18, 12, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.80)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(item.label, legX + 16, legY + i*18 + 10);
    });
  }

  // ===== Runway Diagram 描画 =====
  function drawRunwayDiagram() {
    const canvas = el('aim-rwy-diagram');
    if (!canvas) { console.log('No canvas'); return; }

    const view = el('aim-view');
    if (!view || view.style.display === 'none') { console.log('View hidden or not found'); return; }

    const rwy = currentAimRwy();
    if (!rwy) { console.log('No runway'); return; }

    let W = canvas.clientWidth  || 0;
    let H = canvas.clientHeight || 0;

    // クライアント幅が 0 の場合は、親要素から計算
    if (W === 0) {
      const parent = canvas.parentElement;
      W = parent ? parent.clientWidth - 20 : 280;
    }
    if (H === 0) H = 100;

    console.log('Runway Diagram size:', W, 'x', H);
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, W, H);

    // ---- パラメータ ----
    const aimFt    = parseFloat(el('aim-aim').value)   || 1312;
    const stripeFt = parseFloat(el('aim-stripe').value)|| 197;
    const rwyLenFt = (rwy.length_m || 3000) * 3.28084;

    // TDZ Marker 位置（Threshold からの距離）
    const tdz1Ft = 180;    // 180ft
    const tdz2Ft = 675;    // 675ft
    const tdz3Ft = 1170;   // 1170ft

    // スケール: 滑走路全長を画面幅の80%で表示
    const pxPerFt = (W * 0.8) / rwyLenFt;
    const offsetX = W * 0.1;
    const offsetY = H * 0.35;
    const rwyH = H * 0.4;

    // 滑走路の端点
    const thX = offsetX;
    const endX = offsetX + rwyLenFt * pxPerFt;

    // ---- 滑走路 ----
    ctx.fillStyle = '#ffcc02';
    ctx.fillRect(thX, offsetY, endX - thX, rwyH);

    // ---- スケール目盛り ----
    ctx.strokeStyle = '#546e7a';
    ctx.fillStyle = '#546e7a';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    [0, 1000, 2000, 3000].forEach(ft => {
      if (ft > rwyLenFt) return;
      const x = thX + ft * pxPerFt;
      ctx.beginPath();
      ctx.moveTo(x, offsetY - 4);
      ctx.lineTo(x, offsetY - 8);
      ctx.stroke();
      ctx.fillText(ft + 'ft', x, offsetY - 14);
    });

    // ---- Threshold ----
    ctx.fillStyle = '#ffcc02';
    ctx.fillRect(thX - 2, offsetY - 6, 4, rwyH + 12);
    ctx.fillStyle = '#546e7a';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('THR', thX - 8, offsetY - 10);

    // ---- Aiming Point Marking ----
    const aimX = thX + aimFt * pxPerFt;
    ctx.fillStyle = '#ffd740';
    ctx.fillRect(aimX - 3, offsetY - 2, 6, rwyH + 4);
    ctx.fillStyle = '#ffd740';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Aim', aimX, offsetY - 8);
    ctx.fillText('1312ft', aimX, offsetY + rwyH + 14);

    // ---- Touchdown Zone Markers ----
    const tdzMarkers = [
      { ft: tdz1Ft, label: 'TDZ-1', color: '#4caf50' },
      { ft: tdz2Ft, label: 'TDZ-2', color: '#4caf50' },
      { ft: tdz3Ft, label: 'TDZ-3', color: '#4caf50' },
    ];

    tdzMarkers.forEach(marker => {
      if (marker.ft > rwyLenFt) return;
      const x = thX + marker.ft * pxPerFt;
      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.arc(x, offsetY + rwyH / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = marker.color;
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(marker.label, x, offsetY + rwyH + 26);
    });

    // ---- 凡例 ----
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#80cbc4';
    ctx.textAlign = 'left';
    ctx.fillText('黄: Aiming Point  |  緑●: Touchdown Zone Marker', offsetX, H - 4);
  }

  // ===== 3° Path アニメーション（Pilot Eye 視点） =====
  // GS Follow: Eye は G/S Follow Eye Aim Point（GS Ant + 400ft）に向かって
  // 3° パス上を降下する。カメラは飛行経路方向を向くため Aim Point は画面中央に固定。
  let animRunning = false;
  let animPaused  = false;
  let animSpeed   = 1;
  let animRaf     = 0;
  let animLastT   = 0;
  let animDGround = 0;      // Eye 地上投影点 → Eye Aim Point の水平距離 (m)
  let animPrevRA  = 99999;
  let animCallout = null;   // { text, until }

  function animParams() {
    const rwy     = currentAimRwy();
    const angle   = parseFloat(el('aim-angle').value) || 3.0;
    const gsAntFt = parseFloat(el('aim-gsant').value) || 1115;
    const papiFt  = parseFloat(el('aim-papi').value)  || 1414;
    const aimFt   = parseFloat(el('aim-aim').value)   || 1312;
    const stripeFt= parseFloat(el('aim-stripe').value)|| 197;
    const acType  = el('aim-aircraft') ? el('aim-aircraft').value : 'B747-8F';
    const eyeHt   = (AC[acType] || AC['B747-8F']).eyeHt;
    const gsfEyeFt = (rwy && rwy.ils) ? (gsAntFt + 400) : papiFt;
    const papiRef = parseFloat((el('aim-papi-angle') || {}).value) || 3.0;
    return {
      rwy, angle, papiRef, th: angle * Math.PI / 180,
      gsAntFt, papiFt, aimFt, stripeFt, acType, eyeHt,
      gsfEyeFt,
      gsAntM: gsAntFt * 0.3048, papiM: papiFt * 0.3048,
      aimM: aimFt * 0.3048, stripeM: stripeFt * 0.3048,
      gsfEyeM: gsfEyeFt * 0.3048,
    };
  }

  // ---- 衛星地面テクスチャ（Mode-7 方式で透視描画） ----
  // ESRI World Imagery タイルを滑走路ローカル座標系（x=TH基準の進行方向距離, u=横距離）に
  // 貼り合わせた1枚のテクスチャを作り、フレームごとに走査線ストリップで透視投影する。
  // タイルはSW経由なのでキャッシュ済みならオフラインでも動作する。
  let animUseSat = true;
  let groundTex = null;          // { canvas, key, x0, uHalf, mpp, w, h, ready }
  let groundTexBuilding = false;

  const TEX_X0 = -2600, TEX_X1 = 3600, TEX_UH = 1200, TEX_MPP = 1.4;

  function buildGroundTexture() {
    const rwy = currentAimRwy();
    if (!rwy || groundTexBuilding) return;
    const { apCode, rwCode } = currentAimApRw();
    const key = apCode + '_' + rwCode;
    if (groundTex && groundTex.key === key && groundTex.ready) return;
    groundTexBuilding = true;

    const adj = getAdjustedCoords();
    const hdg = (rwy.trueHeading || 0) * Math.PI / 180;
    const cosH = Math.cos(hdg), sinH = Math.sin(hdg);
    const cosLat = Math.cos(adj.lat * Math.PI / 180);
    // Displaced Threshold を加味した Landing TH をテクスチャ原点 (x=0) にする
    const dispM = (rwy.displaced_ft || 0) * 0.3048;
    const thLat = adj.lat + dispM * cosH / 111320;
    const thLon = adj.lon + dispM * sinH / (111320 * cosLat);

    const w = Math.round(TEX_UH * 2 / TEX_MPP), h = Math.round((TEX_X1 - TEX_X0) / TEX_MPP);
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const g = cvs.getContext('2d');
    g.fillStyle = '#20291b'; g.fillRect(0, 0, w, h);

    const tex = { canvas: cvs, key, x0: TEX_X0, uHalf: TEX_UH, mpp: TEX_MPP, w, h, ready: false };

    // ローカル (x,u) → lat/lon
    const toLL = (x, u) => {
      const dN = x * cosH - u * sinH;
      const dE = x * sinH + u * cosH;
      return [thLat + dN / 111320, thLon + dE / (111320 * cosLat)];
    };
    // lat/lon → テクスチャpx
    const toPx = (lat, lon) => {
      const dN = (lat - thLat) * 111320;
      const dE = (lon - thLon) * 111320 * cosLat;
      const x = dN * cosH + dE * sinH;
      const u = -dN * sinH + dE * cosH;
      return [(u + TEX_UH) / TEX_MPP, (x - TEX_X0) / TEX_MPP];
    };
    const tileXY = (lat, lon, z) => {
      const n = Math.pow(2, z);
      return [
        Math.floor((lon + 180) / 360 * n),
        Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n),
      ];
    };
    const tileNW = (tx, ty, z) => {
      const n = Math.pow(2, z);
      return [
        Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI,
        tx / n * 360 - 180,
      ];
    };

    const tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

    // 指定範囲を zoom z のタイルで描画
    function drawZoom(z, xA, xB, uH) {
      const corners = [toLL(xA, -uH), toLL(xA, uH), toLL(xB, -uH), toLL(xB, uH)];
      const txs = [], tys = [];
      corners.forEach(([la, lo]) => { const [tx, ty] = tileXY(la, lo, z); txs.push(tx); tys.push(ty); });
      const jobs = [];
      for (let tx = Math.min(...txs); tx <= Math.max(...txs); tx++)
        for (let ty = Math.min(...tys); ty <= Math.max(...tys); ty++)
          jobs.push([tx, ty]);
      if (jobs.length > 600) return Promise.resolve();   // 安全弁
      return Promise.allSettled(jobs.map(([tx, ty]) => new Promise(res => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const nw = tileNW(tx, ty, z), ne = tileNW(tx + 1, ty, z), sw = tileNW(tx, ty + 1, z);
            const p0 = toPx(nw[0], nw[1]), p1 = toPx(ne[0], ne[1]), p2 = toPx(sw[0], sw[1]);
            g.setTransform(
              (p1[0] - p0[0]) / 256, (p1[1] - p0[1]) / 256,
              (p2[0] - p0[0]) / 256, (p2[1] - p0[1]) / 256,
              p0[0], p0[1]
            );
            g.drawImage(img, 0, 0);
          } catch (e) {}
          res();
        };
        img.onerror = () => res();
        img.src = `${tileUrl}/${z}/${ty}/${tx}`;
      })));
    }

    // z16で全域 → z17でTH周辺を高解像度上書き
    drawZoom(16, TEX_X0, TEX_X1, TEX_UH)
      .then(() => drawZoom(17, -900, 1800, 450))
      .then(() => {
        g.setTransform(1, 0, 0, 1, 0, 0);
        tex.ready = true;
        groundTex = tex;
        groundTexBuilding = false;
      })
      .catch(() => { groundTexBuilding = false; });
  }

  // 1フレーム描画。戻り値 = RA(ft) / 描画不能時 null
  function renderAnimFrame() {
    const canvas = el('aim-canvas');
    if (!canvas) return null;
    const P = animParams();
    if (!P.rwy) return null;
    const { apCode, rwCode } = currentAimApRw();

    const W = canvas.clientWidth || 800, H = canvas.clientHeight || 540;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const d = Math.max(animDGround, 1);          // Eye→Aim Point 水平距離 (m)
    const hM = d * Math.tan(P.th);               // Eye 高さ (m)
    const s  = P.gsfEyeM - d;                    // Eye の TH 基準位置 (m, 負=進入側)
    const eyeFt = hM / 0.3048;
    const ra    = eyeFt - P.eyeHt;               // 主脚基準の概算 RA

    // ---- 透視投影（カメラは飛行経路方向 = 3°下向き） ----
    const fl = H * 1.45, cx = W / 2, cy = H * 0.52;
    const cosT = Math.cos(P.th), sinT = Math.sin(P.th);
    function pt(xM, uM) {
      const dx = xM - s;
      const depth = dx * cosT + hM * sinT;
      if (depth < 5) return null;
      return { x: cx + fl * uM / depth, y: cy - fl * (dx * sinT - hM * cosT) / depth, d: depth };
    }
    const horY = cy - fl * Math.tan(P.th);       // 水平線（Aim Point の 3° 上）

    // ---- 衛星テクスチャ使用可否 ----
    const useSat = animUseSat && groundTex && groundTex.ready &&
                   groundTex.key === apCode + '_' + rwCode;

    // ---- 空 ----
    const skyG = ctx.createLinearGradient(0, 0, 0, horY);
    if (useSat) {
      skyG.addColorStop(0, '#5a86b8'); skyG.addColorStop(0.7, '#8fb4dc'); skyG.addColorStop(1, '#c3d9ee');
    } else {
      skyG.addColorStop(0, '#060d16'); skyG.addColorStop(0.7, '#0d1e30'); skyG.addColorStop(1, '#2a4a6a');
    }
    ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, Math.max(horY, 0));

    // ---- 地面 ----
    if (useSat) {
      // Mode-7: 走査線ごとにテクスチャの帯を透視スケールで転写
      const t = groundTex;
      ctx.fillStyle = '#4a5a40';                 // テクスチャ範囲外の遠景色
      ctx.fillRect(0, Math.max(horY, 0), W, H - Math.max(horY, 0));
      const yStart = Math.max(0, Math.floor(horY) + 2);
      let prevTy = null;
      for (let y = yStart; y < H; y++) {
        const a = (cy - y) / fl;
        const denom = sinT - a * cosT;
        if (denom <= 1e-6) continue;
        const dx = hM * (cosT + a * sinT) / denom;
        const depth = dx * cosT + hM * sinT;
        const xw = s + dx;
        const ty = (xw - t.x0) / t.mpp;
        if (ty < 0 || ty >= t.h) { prevTy = ty; continue; }
        let sh = prevTy !== null ? Math.abs(prevTy - ty) : 1;
        prevTy = ty;
        sh = Math.min(Math.max(sh, 0.5), t.h - ty);
        const uL = (0 - cx) * depth / fl, uR = (W - cx) * depth / fl;
        const sxL = (uL + t.uHalf) / t.mpp, sxR = (uR + t.uHalf) / t.mpp;
        const scale = W / (sxR - sxL);
        const cx0 = Math.max(sxL, 0), cx1 = Math.min(sxR, t.w);
        if (cx1 <= cx0) continue;
        ctx.drawImage(t.canvas, cx0, ty, cx1 - cx0, sh,
                      (cx0 - sxL) * scale, y, (cx1 - cx0) * scale, 1.05);
      }
      // 遠方の霞
      const hazeG = ctx.createLinearGradient(0, horY, 0, horY + H * 0.12);
      hazeG.addColorStop(0, 'rgba(195,217,238,0.85)'); hazeG.addColorStop(1, 'rgba(195,217,238,0)');
      ctx.fillStyle = hazeG; ctx.fillRect(0, Math.max(horY, 0), W, H * 0.12);
    } else {
      const gndG = ctx.createLinearGradient(0, horY, 0, H);
      gndG.addColorStop(0, '#152012'); gndG.addColorStop(1, '#0a1208');
      ctx.fillStyle = gndG; ctx.fillRect(0, horY, W, H - horY);
      ctx.fillStyle = 'rgba(120,170,220,0.10)'; ctx.fillRect(0, horY - 2, W, 6);
    }

    // ---- ヘルパー ----
    const HW = 30;                               // 滑走路半幅 (m)
    function poly(pts, fill) {
      const q = pts.map(p => pt(p[0], p[1]));
      if (q.some(v => !v)) return;
      ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y);
      for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    function quad(x0, x1, lf, rf, color) {
      poly([[x0, lf * HW], [x0, rf * HW], [x1, rf * HW], [x1, lf * HW]], color);
    }
    function dot(xM, uM, color, sizeM, glow) {
      const q = pt(xM, uM); if (!q) return;
      const r = Math.min(12, Math.max(1.1, fl * sizeM / q.d));
      ctx.save();
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = r * 2.5; }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return q;
    }

    const rwLen = P.rwy.length_m || 3500;
    const xNear = Math.max(Math.min(0, s + 6), s + 6);

    // ---- 合成シーン要素（衛星画像使用時は実画像に写っているため描かない） ----
    if (!useSat) {
    // ---- 進入灯（センターライン灯 + 300mクロスバー） ----
    for (let x = -30; x >= -720; x -= 30) dot(x, 0, 'rgba(255,250,230,0.9)', 0.55, true);
    for (let u = -12; u <= 12; u += 3) if (u !== 0) dot(-300, u, 'rgba(255,250,230,0.85)', 0.5, true);

    // ---- 滑走路アスファルト ----
    if (xNear < rwLen) {
      quad(Math.max(0, xNear), rwLen, -1, 1, '#2e2e2e');
      // エッジライン（白）
      quad(Math.max(0, xNear), rwLen, -1.02, -0.96, 'rgba(255,255,255,0.45)');
      quad(Math.max(0, xNear), rwLen,  0.96,  1.02, 'rgba(255,255,255,0.45)');
    }

    // ---- センターライン（白破線 30m/60m周期） ----
    for (let x = Math.max(12, Math.ceil(Math.max(0, xNear) / 60) * 60); x < rwLen - 30; x += 60) {
      quad(x, x + 30, -0.015, 0.015, 'rgba(255,255,255,0.7)');
    }

    // ---- THバー（12本） ----
    for (const [lf, rf] of [
      [-0.21,-0.15],[-0.33,-0.27],[-0.45,-0.39],[-0.57,-0.51],[-0.69,-0.63],[-0.81,-0.75],
      [ 0.15, 0.21],[ 0.27, 0.33],[ 0.39, 0.45],[ 0.51, 0.57],[ 0.63, 0.69],[ 0.75, 0.81],
    ]) quad(0, 30, lf, rf, 'rgba(255,255,255,0.92)');

    // ---- スレッショルド灯（緑） ----
    for (let u = -HW; u <= HW; u += 5) dot(-2, u, '#43d95e', 0.5, true);
    // ---- 滑走路エッジ灯（白） ----
    for (let x = 60; x < rwLen; x += 60) {
      dot(x, -HW - 1.5, 'rgba(255,250,220,0.85)', 0.45, true);
      dot(x,  HW + 1.5, 'rgba(255,250,220,0.85)', 0.45, true);
    }

    // ---- Aiming Point マーキング ----
    const isFAA = ((apCode || '')[0] === 'K' || (apCode || '')[0] === 'P');
    const isCHINA = apCode === 'ZSPD';
    const apNear = P.aimM, apFar = P.aimM + P.stripeM;
    quad(apNear, apFar, -0.60, -0.20, 'rgba(255,255,255,0.90)');
    quad(apNear, apFar,  0.20,  0.60, 'rgba(255,255,255,0.90)');
    function inAimZone(xM) { return xM + 22 > apNear && xM < apFar; }

    // ---- TDZストライプ ----
    function stripes(xM, count, op) {
      if (inAimZone(xM)) return;
      const fr = count === 3
        ? [[-0.25,-0.15],[-0.40,-0.30],[-0.55,-0.45],[0.15,0.25],[0.30,0.40],[0.45,0.55]]
        : count === 2
        ? [[-0.25,-0.15],[-0.40,-0.30],[0.15,0.25],[0.30,0.40]]
        : [[-0.25,-0.15],[0.15,0.25]];
      for (const [lf, rf] of fr) quad(xM, xM + 22, lf, rf, `rgba(255,255,255,${op})`);
    }
    if (isCHINA) {
      stripes(144.3, 3, 0.82); stripes(293.5, 3, 0.82); stripes(593.66, 2, 0.75); stripes(893.18, 1, 0.75);
    } else if (isFAA) {
      stripes(152.4, 3, 0.82); stripes(457.2, 3, 0.82); stripes(609.6, 2, 0.75);
      stripes(762.0, 1, 0.75); stripes(914.4, 1, 0.75);
    } else {
      stripes(150, 3, 0.82); stripes(300, 3, 0.82); stripes(450, 3, 0.82);
      stripes(600, 2, 0.75); stripes(750, 1, 0.75); stripes(900, 1, 0.75);
    }
    }  // end if (!useSat)

    // ---- G/S アンテナ位置（緑ライン、ILSのみ） ----
    if (P.rwy.ils) {
      quad(P.gsAntM - 1.5, P.gsAntM + 1.5, -1, 1, 'rgba(105,240,174,0.55)');
      const q = pt(P.gsAntM, HW + 4);
      if (q) {
        ctx.fillStyle = '#69f0ae'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('G/S Ant', q.x + 4, q.y);
      }
    }

    // ---- PAPI（4灯、実際の見え方: Eye の PAPI に対する角度で White/Red） ----
    const papiSide = P.rwy?.papi?.side || P.rwy?.ils?.papiSide || 'L';
    const sideSign = papiSide === 'L' ? -1 : 1;
    const papiDist = P.papiM - s;                // Eye → PAPI 水平距離
    let aEyeDeg = 90;
    if (papiDist > 5) aEyeDeg = Math.atan(hM / papiDist) * 180 / Math.PI;
    const pr = P.papiRef;
    const nWhite = aEyeDeg >= pr + 0.5 ? 4 : aEyeDeg >= pr + 0.17 ? 3 : aEyeDeg >= pr - 0.17 ? 2 : aEyeDeg >= pr - 0.5 ? 1 : 0;
    for (let i = 0; i < 4; i++) {
      const u = sideSign * (HW + 15 + i * 9);    // i=0 が滑走路寄り（内側）
      dot(P.papiM, u, i < nWhite ? '#ffffff' : '#ff1744', 1.3, true);
    }
    {
      const q = pt(P.papiM, sideSign * (HW + 15 + 3 * 9) + sideSign * 6);
      if (q) {
        ctx.fillStyle = '#ef5350'; ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = sideSign < 0 ? 'right' : 'left';
        ctx.fillText('PAPI', q.x + sideSign * 4, q.y - 8);
      }
    }

    // ---- G/S Follow Eye Aim Point（黄ダイヤ = 画面中央に固定） ----
    // 半透明にして、下の滑走路標識がうっすら見えるようにする
    {
      const q = pt(P.gsfEyeM, 0);
      if (q) {
        const r = Math.min(26, Math.max(7, fl * 3 / q.d));
        ctx.save();
        ctx.fillStyle = 'rgba(255,224,130,0.30)';
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x + r, q.y);
        ctx.lineTo(q.x, q.y + r); ctx.lineTo(q.x - r, q.y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,224,130,0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
    }

    // ---- FPV（Flight Path Vector、HUDグリーン、画面中央固定） ----
    ctx.save();
    ctx.strokeStyle = '#76ff03'; ctx.lineWidth = 2;
    ctx.shadowColor = '#76ff03'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy);  ctx.lineTo(cx - 24, cy);
    ctx.moveTo(cx + 9, cy);  ctx.lineTo(cx + 24, cy);
    ctx.moveTo(cx, cy - 9);  ctx.lineTo(cx, cy - 18);
    ctx.stroke();
    ctx.restore();

    // ---- 水平線基準マーク（-3°の確認用に水平線に目盛り） ----
    ctx.strokeStyle = 'rgba(118,255,3,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 70, horY); ctx.lineTo(cx - 25, horY);
    ctx.moveTo(cx + 25, horY); ctx.lineTo(cx + 70, horY);
    ctx.stroke();
    ctx.fillStyle = 'rgba(118,255,3,0.6)'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
    ctx.fillText('HORIZON', cx + 74, horY + 3);
    ctx.fillText(`-${P.angle.toFixed(1)}°`, cx + 28, cy + 3);

    // ---- HUD 左上: 飛行データ ----
    const distTH = -s;                            // TH まで (m, 負=通過後)
    const spdKt = (() => { const e = document.getElementById('papi-aspd'); return e ? (parseFloat(e.value) || 145) : 145; })();
    ctx.fillStyle = 'rgba(0,10,20,0.72)'; ctx.fillRect(8, 8, 178, 92);
    ctx.strokeStyle = '#76ff03'; ctx.lineWidth = 1; ctx.strokeRect(8, 8, 178, 92);
    ctx.fillStyle = '#76ff03'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
    ctx.fillText(distTH > 0
      ? `DIST THR ${(distTH / 1852).toFixed(2)}NM ${Math.round(distTH)}m`
      : `OVER RWY +${Math.round(-distTH)}m`, 16, 26);
    ctx.fillText(`EYE  ${Math.round(eyeFt)} ft`, 16, 44);
    ctx.fillText(`RA   ${Math.max(0, Math.round(ra))} ft`, 16, 62);
    ctx.fillText(`GS   ${Math.round(spdKt)} kt   ×${animSpeed}`, 16, 80);
    ctx.fillStyle = '#80cbc4'; ctx.font = '9px monospace';
    ctx.fillText(`${P.acType}  EYE-GEAR ${P.eyeHt}ft`, 16, 94);

    // ---- HUD 右上: 空港情報 ----
    ctx.font = 'bold 12px monospace';
    const t1 = `${apCode} RWY ${rwCode}`;
    const t2 = `GP ${P.angle}°  ${P.rwy.ils ? 'G/S FOLLOW' : 'PAPI'}`;
    const t3 = `EYE AIM ${P.gsfEyeFt}ft (${Math.round(P.gsfEyeM)}m)`;
    const tw = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width, ctx.measureText(t3).width) + 20;
    ctx.fillStyle = 'rgba(0,10,20,0.72)'; ctx.fillRect(W - tw - 8, 8, tw, 58);
    ctx.strokeStyle = '#ffe082'; ctx.strokeRect(W - tw - 8, 8, tw, 58);
    ctx.fillStyle = '#4fc3f7'; ctx.textAlign = 'left';
    ctx.fillText(t1, W - tw + 2, 26);
    ctx.fillStyle = '#90a4ae'; ctx.fillText(t2, W - tw + 2, 42);
    ctx.fillStyle = '#ffe082'; ctx.fillText(t3, W - tw + 2, 58);

    // ---- HUD 左下: PAPI リピーター ----
    ctx.fillStyle = 'rgba(0,10,20,0.72)'; ctx.fillRect(8, H - 46, 150, 38);
    ctx.strokeStyle = '#ef5350'; ctx.strokeRect(8, H - 46, 150, 38);
    ctx.fillStyle = '#ef5350'; ctx.font = 'bold 10px monospace';
    ctx.fillText(`PAPI  ${aEyeDeg < 89 ? aEyeDeg.toFixed(2) + '°' : '--'}`, 16, H - 33);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      const color = i < nWhite ? '#ffffff' : '#ff1744';
      ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(24 + i * 22, H - 19, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ---- 衛星テクスチャ読込中表示 ----
    if (animUseSat && !useSat) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(groundTexBuilding ? '🛰 衛星画像 読込中…（完了後に自動切替）' : '', cx, 78);
    }

    // ---- コールアウト ----
    if (animCallout && performance.now() < animCallout.until) {
      ctx.save();
      ctx.fillStyle = '#76ff03'; ctx.font = 'bold 44px monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      ctx.fillText(animCallout.text, cx, H * 0.30);
      ctx.restore();
    }
    if (animPaused) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
      ctx.fillText('⏸ PAUSE', cx, H - 20);
    }

    return ra;
  }

  function animFrame(t) {
    if (!animRunning) return;
    const dt = Math.min((t - animLastT) / 1000, 0.1);
    animLastT = t;
    if (!animPaused) {
      const e = document.getElementById('papi-aspd');
      const spdKt = e ? (parseFloat(e.value) || 145) : 145;
      animDGround -= spdKt * 0.51444 * animSpeed * dt;
    }
    const ra = renderAnimFrame();
    if (ra !== null) {
      for (const c of [500, 400, 300, 200, 100, 50, 40]) {
        if (animPrevRA > c && ra <= c) animCallout = { text: String(c), until: performance.now() + 1400 };
      }
      if (ra <= 30) {
        animCallout = { text: 'FLARE', until: performance.now() + 1e9 };
        renderAnimFrame();
        stopAnim(false);   // 最終フレームを残して終了
        return;
      }
      animPrevRA = ra;
    }
    animRaf = requestAnimationFrame(animFrame);
  }

  function stopAnim(restore) {
    if (animRaf) cancelAnimationFrame(animRaf);
    animRaf = 0; animRunning = false; animPaused = false;
    const ctrl = el('aim-anim-ctrl'); if (ctrl) ctrl.style.display = 'none';
    const btn = el('aim-btn-anim');
    if (btn) { btn.textContent = '▶ 3° Path'; btn.classList.remove('aim-view-active'); }
    const pauseBtn = el('aim-anim-pause'); if (pauseBtn) pauseBtn.textContent = '⏸';
    if (restore) drawAimingPoint();
  }

  // デバッグ用: アニメーション距離を直接設定（コンソールから）
  window._aimAnimSet = function (dGroundM) {
    animDGround = dGroundM;
    if (!animRunning) renderAnimFrame();
  };

  function startAnim() {
    if (animRunning) { stopAnim(true); return; }
    const rwy = currentAimRwy();
    if (!rwy) return;
    if (aimViewMode !== 'persp') setAimView('persp');
    const angle = parseFloat(el('aim-angle').value) || 3.0;
    animDGround = (500 * 0.3048) / Math.tan(angle * Math.PI / 180);  // Eye 500ft AGL から開始
    animPrevRA = 99999; animCallout = null; animPaused = false;
    if (animUseSat) buildGroundTexture();   // 衛星地面テクスチャを非同期生成（完了までCG描画）
    animRunning = true; animLastT = performance.now();
    const ctrl = el('aim-anim-ctrl'); if (ctrl) ctrl.style.display = 'flex';
    const btn = el('aim-btn-anim');
    if (btn) { btn.textContent = '⏹ 停止'; btn.classList.add('aim-view-active'); }
    animRaf = requestAnimationFrame(animFrame);
  }

  // ===== 衛星マップ =====
  let aimViewMode  = 'persp';
  let aimLeafletMap = null;
  let aimMapLayers  = {};

  // THからの距離(ft) → [lat, lon]
  function posAt(ftFromTH, rwy) {
    const th = landingTH(rwy);
    const dM = ftFromTH * 0.3048;
    return [
      th.lat + dM * Math.cos(th.hdgRad) / 111000,
      th.lon + dM * Math.sin(th.hdgRad) / (111000 * th.cosLat),
    ];
  }

  // 滑走路の横エッジ座標（side: -1=左 +1=右）
  function rwyEdge(ftFromTH, rwy, side, halfWidthM) {
    const th = landingTH(rwy);
    const dM = ftFromTH * 0.3048;
    const cLat = th.lat + dM * Math.cos(th.hdgRad) / 111000;
    const cLon = th.lon + dM * Math.sin(th.hdgRad) / (111000 * th.cosLat);
    const pLat = -Math.sin(th.hdgRad); // 垂直方向（右）の北成分
    const pLon =  Math.cos(th.hdgRad); // 垂直方向（右）の東成分
    return [
      cLat + side * halfWidthM * pLat / 111000,
      cLon + side * halfWidthM * pLon / (111000 * th.cosLat),
    ];
  }

  function initAimMap() {
    if (aimLeafletMap) return;
    if (typeof L === 'undefined') return;
    aimLeafletMap = L.map('aim-map', { zoomControl: true, attributionControl: false });
    window._aimMap = aimLeafletMap;
    aimLeafletMap.on('click', function(e) { window._clickedLatLng = e.latlng; console.log('CLICK:', e.latlng.lat.toFixed(7), e.latlng.lng.toFixed(7)); });
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, crossOrigin: true }
    ).addTo(aimLeafletMap);
    updateAimMap();
  }

  function updateAimMap() {
    if (!aimLeafletMap) return;
    const { apCode, rwCode } = currentAimApRw();
    const airport = AIRPORTS[apCode];
    if (!airport) return;
    const rwy = airport.runways[rwCode];
    if (!rwy) return;

    // 調整済み座標を適用
    const { lat, lon } = getAdjustedCoords();
    const adjustedRwy = Object.assign({}, rwy, { threshold: [lat, lon] });

    Object.values(aimMapLayers).forEach(l => { try { aimLeafletMap.removeLayer(l); } catch(e){} });
    aimMapLayers = {};

    const gsAntFt  = parseFloat(el('aim-gsant').value)  || 1115;
    const papiFt   = parseFloat(el('aim-papi').value)   || 1414;
    const aimFt    = parseFloat(el('aim-aim').value)    || 1312;
    const stripeFt = parseFloat(el('aim-stripe').value) || 197;
    const gsfEyeFt = (rwy && rwy.ils) ? (gsAntFt + 400) : papiFt;
    const HW = 35; // 滑走路半幅(m)
    const dispFt   = rwy.displaced_ft || 0; // Displaced Threshold距離(ft)

    // 滑走路アスファルト（ランディングエリア: piano keys〜奥）
    const rwyFarFt = 1800 / 0.3048;
    aimMapLayers.rwy = L.polygon([
      rwyEdge(0,        adjustedRwy, -1, HW), rwyEdge(rwyFarFt, adjustedRwy, -1, HW),
      rwyEdge(rwyFarFt, adjustedRwy, +1, HW), rwyEdge(0,        adjustedRwy, +1, HW),
    ], { color: '#546e7a', weight: 1.5, fillColor: '#2a2a2a', fillOpacity: 0.55 })
      .addTo(aimLeafletMap);

    // Displaced Threshold エリア（物理的滑走路端〜piano keys）
    if (dispFt > 0) {
      aimMapLayers.dispRwy = L.polygon([
        rwyEdge(-dispFt, adjustedRwy, -1, HW), rwyEdge(0, adjustedRwy, -1, HW),
        rwyEdge(0, adjustedRwy, +1, HW),       rwyEdge(-dispFt, adjustedRwy, +1, HW),
      ], { color: '#78909c', weight: 1.5, fillColor: '#141414', fillOpacity: 0.55, dashArray: '5,4' })
        .addTo(aimLeafletMap);
      // 物理的滑走路端ライン（白）
      aimMapLayers.rwyPhysEnd = L.polyline(
        [rwyEdge(-dispFt, rwy, -1, HW), rwyEdge(-dispFt, rwy, +1, HW)],
        { color: '#eceff1', weight: 2 }
      ).addTo(aimLeafletMap);
      // Displaced THラベル
      aimMapLayers.dispLbl = L.marker(rwyEdge(-dispFt, rwy, -1, HW + 22), {
        icon: L.divIcon({
          html: `<div style="background:rgba(0,0,0,.78);color:#b0bec5;border:1px solid #78909c;padding:2px 5px;font-size:9px;font-weight:700;border-radius:3px;white-space:nowrap">Rwy End  −${dispFt}ft</div>`,
          className: '', iconAnchor: [100, 8],
        })
      }).addTo(aimLeafletMap);
    }

    // センターライン（displaced area も含む）
    aimMapLayers.ctr = L.polyline(
      [posAt(-dispFt, rwy), posAt(rwyFarFt, rwy)],
      { color: 'rgba(255,255,255,0.35)', weight: 1, dashArray: '8,8' }
    ).addTo(aimLeafletMap);

    // TDZ 補助線（白点線）/ FAA空港は300m→1000ftマーカーに置き換え
    const aimNearM = (aimFt * 0.3048) - 60; // Aiming Point近端(m)
    const { apCode: mapApCode } = currentAimApRw();
    const isFAA = /^[KP]/i.test(mapApCode);
    const isCHINA = mapApCode === 'ZSPD';

    // 描画する距離リスト
    // FAA: 500/1000/1500/2000/2500/3000ft基準（実際のマーキング位置）
    // ICAO: 150/300/450/600/750/900m基準
    // CHINA: 144.3/293.5/593.66/893.18m基準
    const tdzMarkers = isCHINA
      ? [144.3, 293.5, 593.66, 893.18].map(distM => ({
          distM, label: `${distM}m`
        }))
      : isFAA
      ? [
          { distM:  500 * 0.3048, label:  '500ft Marker' },
          { distM: 1000 * 0.3048, label: '1000ft Marker', highlight: true },
          { distM: 1500 * 0.3048, label: '1500ft Marker' },
          { distM: 2000 * 0.3048, label: '2000ft Marker' },
          { distM: 2500 * 0.3048, label: '2500ft Marker' },
          { distM: 3000 * 0.3048, label: '3000ft Marker' },
        ]
      : [150, 300, 600, 750, 900, 922.5].map(distM => ({
          distM, label: `${distM}m (${Math.round(distM / 0.3048)}ft)`
        }));

    for (const { distM, label, highlight } of tdzMarkers) {
      const distFt   = distM / 0.3048;
      const isBeyond = distM > aimNearM;
      const lineColor = highlight
        ? 'rgba(255,224,130,0.85)'                       // 1000ft Marker: 黄色
        : isBeyond ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.70)';
      const lineW = highlight ? 1.8 : isBeyond ? 1.2 : 1.5;
      const key   = 'tdz' + Math.round(distM);
      aimMapLayers[key] = L.polyline(
        [rwyEdge(distFt, rwy, -1, HW), rwyEdge(distFt, rwy, +1, HW)],
        { color: lineColor, weight: lineW, dashArray: '4,4' }
      ).addTo(aimLeafletMap);
      aimMapLayers[key + 'Lbl'] = L.marker(rwyEdge(distFt, rwy, -1, HW + 16), {
        icon: L.divIcon({
          html: `<div style="background:rgba(0,0,0,.60);color:${highlight ? '#ffe082' : 'rgba(255,255,255,0.85)'};border:1px solid ${highlight ? 'rgba(255,224,130,0.6)' : 'rgba(255,255,255,0.4)'};padding:1px 5px;font-size:9px;border-radius:2px;white-space:nowrap">${label}</div>`,
          className: '', iconAnchor: [100, 8],
        })
      }).addTo(aimLeafletMap);
    }

    // GS Ant（緑）— ILS ある場合のみ
    if (rwy && rwy.ils) {
      aimMapLayers.gsAnt = L.polyline(
        [rwyEdge(gsAntFt, rwy, -1, HW), rwyEdge(gsAntFt, rwy, +1, HW)],
        { color: '#69f0ae', weight: 2.5 }
      ).addTo(aimLeafletMap);
      aimMapLayers.gsAntLbl = L.marker(rwyEdge(gsAntFt, rwy, +1, HW+18), {
        icon: L.divIcon({
          html: `<div style="background:rgba(0,0,0,.75);color:#69f0ae;border:1px solid #69f0ae;padding:2px 6px;font-size:10px;font-weight:700;border-radius:3px;white-space:nowrap">GS Ant ${gsAntFt}ft (${Math.round(gsAntFt*0.3048)}m)</div>`,
          className: '', iconAnchor: [0, 10],
        })
      }).addTo(aimLeafletMap);
    }

    // Touch Down Zone（1000-2250ft の赤い枠）
    const TDZ_START_FT = 1000;
    const TDZ_END_FT = 2250;
    const TDZ_HW = 40;  // TDZ幅（m）

    aimMapLayers.tdzStart = L.polyline(
      [rwyEdge(TDZ_START_FT, rwy, -1, HW), rwyEdge(TDZ_START_FT, rwy, +1, HW)],
      { color: '#ff1744', weight: 2, dashArray: '2,2' }
    ).addTo(aimLeafletMap);
    aimMapLayers.tdzEnd = L.polyline(
      [rwyEdge(TDZ_END_FT, rwy, -1, HW), rwyEdge(TDZ_END_FT, rwy, +1, HW)],
      { color: '#ff1744', weight: 2, dashArray: '2,2' }
    ).addTo(aimLeafletMap);

    // TDZ 枠（4隅の線）
    aimMapLayers.tdzBox = L.polygon([
      rwyEdge(TDZ_START_FT, rwy, -1, HW),
      rwyEdge(TDZ_START_FT, rwy, +1, HW),
      rwyEdge(TDZ_END_FT, rwy, +1, HW),
      rwyEdge(TDZ_END_FT, rwy, -1, HW),
    ], { color: '#ff1744', weight: 2, fill: false, dashArray: '5,5' })
      .addTo(aimLeafletMap);


    // TDZ 終端補助線ラベル（922.5m）
    aimMapLayers.tdzEndLbl = L.marker(posAt(TDZ_END_FT, rwy), {
      icon: L.divIcon({
        html: `<div style="background:rgba(255,23,68,.85);color:#fff;border:1px solid #ff1744;padding:3px 8px;font-size:10px;font-weight:700;border-radius:3px;white-space:nowrap">922.5m</div>`,
        className: '', iconAnchor: [30, -15],
      })
    }).addTo(aimLeafletMap);

    // Go Around Decision Point (Deep Landing)
    const gaDpFt = 2791;  // 3026 - 235

    // 235ft距離ラベル
    aimMapLayers.gaDistanceLbl = L.marker(posAt((TDZ_END_FT + gaDpFt) / 2, rwy), {
      icon: L.divIcon({
        html: `<div style="background:rgba(255,152,0,.85);color:#fff;border:1px solid #ff9800;padding:2px 6px;font-size:9px;font-weight:700;border-radius:3px;white-space:nowrap">235ft</div>`,
        className: '', iconAnchor: [20, -10],
      })
    }).addTo(aimLeafletMap);

    // Go Around Decision Markerマーカー
    aimMapLayers.gaDecisionMarker = L.marker(posAt(gaDpFt, rwy), {
      icon: L.divIcon({
        html: `<div style="color:#ff1744;font-size:24px;line-height:1;text-align:center">◆</div>`,
        className: '', iconAnchor: [6, 12],
      })
    }).addTo(aimLeafletMap);
    aimMapLayers.gaDecisionLbl = L.marker(posAt(gaDpFt, rwy), {
      icon: L.divIcon({
        html: `<div style="background:rgba(255,23,68,.85);color:#fff;border:1px solid #ff1744;padding:3px 8px;font-size:10px;font-weight:700;border-radius:3px;white-space:nowrap">Go Around Decision<br>(Deep Landing)</div>`,
        className: '', iconAnchor: [50, -25],
      })
    }).addTo(aimLeafletMap);

    // Aiming Point 補助線（各方式別：開始位置と終端）
    const jpBtn = document.querySelector('.aim-std-btn[data-std="japan"]');
    const icaoBtn = document.querySelector('.aim-std-btn[data-std="icao"]');
    const faaBtn = document.querySelector('.aim-std-btn[data-std="faa"]');
    const chinaBtn = document.querySelector('.aim-std-btn[data-std="china"]');
    const isJp = jpBtn?.classList.contains('aim-std-active');
    const isIcao = icaoBtn?.classList.contains('aim-std-active');
    const isFaa = faaBtn?.classList.contains('aim-std-active');
    const isChina = chinaBtn?.classList.contains('aim-std-active');

    let aimPtFt = 0, aimEndFt = 0;
    const stripeOverride = airport?.aimingPoint?.stripeLength;

    if (isChina) {
      aimPtFt = 1505;
      aimEndFt = 1702;  // 1505 + 197
    } else if (isJp) {
      aimPtFt = 1312;
      aimEndFt = 1509;  // 1312 + 197
    } else if (isIcao) {
      aimPtFt = 1312;
      const stripeLen = stripeOverride || 197;  // 空港設定があれば使用、なければ197ft
      aimEndFt = aimPtFt + stripeLen;
    } else if (isFaa) {
      aimPtFt = 1000;
      aimEndFt = 1150;  // 1000 + 150
    }

    if (aimPtFt > 0) {
      // Aiming Point 開始位置
      aimMapLayers.aimingPointLine = L.polyline(
        [rwyEdge(aimPtFt, rwy, -1, HW), rwyEdge(aimPtFt, rwy, +1, HW)],
        { color: 'rgba(255,255,255,0.6)', weight: 1.5, dashArray: '4,4' }
      ).addTo(aimLeafletMap);
      aimMapLayers.aimingPointLbl = L.marker(rwyEdge(aimPtFt, rwy, -1, HW + 22), {
        icon: L.divIcon({
          html: `<div style="background:rgba(0,0,0,.75);color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.4);padding:2px 6px;font-size:9px;border-radius:2px;white-space:nowrap">${aimPtFt}ft</div>`,
          className: '', iconAnchor: [0, 8],
        })
      }).addTo(aimLeafletMap);

      // Aiming Point 終端
      if (aimEndFt > 0) {
        aimMapLayers.aimingPointEndLine = L.polyline(
          [rwyEdge(aimEndFt, rwy, -1, HW), rwyEdge(aimEndFt, rwy, +1, HW)],
          { color: 'rgba(255,255,255,0.6)', weight: 1.5, dashArray: '4,4' }
        ).addTo(aimLeafletMap);
        aimMapLayers.aimingPointEndLbl = L.marker(rwyEdge(aimEndFt, rwy, +1, HW + 22), {
          icon: L.divIcon({
            html: `<div style="background:rgba(0,0,0,.75);color:rgba(255,255,255,0.85);border:1px solid rgba(255,255,255,0.4);padding:2px 6px;font-size:9px;border-radius:2px;white-space:nowrap">${aimEndFt}ft</div>`,
            className: '', iconAnchor: [0, 8],
          })
        }).addTo(aimLeafletMap);
      }
    }

    // PAPI（赤）
    aimMapLayers.papi = L.polyline(
      [rwyEdge(papiFt, rwy, -1, HW), rwyEdge(papiFt, rwy, +1, HW)],
      { color: '#ef5350', weight: 2.5 }
    ).addTo(aimLeafletMap);
    aimMapLayers.papiLbl = L.marker(rwyEdge(papiFt, rwy, -1, HW+18), {
      icon: L.divIcon({
        html: `<div style="background:rgba(0,0,0,.75);color:#ef5350;border:1px solid #ef5350;padding:2px 6px;font-size:10px;font-weight:700;border-radius:3px;white-space:nowrap">PAPI ${papiFt}ft (${Math.round(papiFt*0.3048)}m)</div>`,
        className: '', iconAnchor: [100, 10],
      })
    }).addTo(aimLeafletMap);

    // Aiming Pt ライン＆ラベル削除（G/S Follow Eye Aim と重複のため）

    // G/S Follow Eye Aim（黄ライン＋ダイヤ、ILSある場合のみ）
    if (rwy && rwy.ils) {
      const gsfPos = posAt(gsfEyeFt, rwy);
      aimMapLayers.gsfLine = L.polyline(
        [rwyEdge(gsfEyeFt, rwy, -1, HW), rwyEdge(gsfEyeFt, rwy, +1, HW)],
        { color: '#ffe082', weight: 2.5 }
      ).addTo(aimLeafletMap);
      aimMapLayers.gsfEye = L.marker(gsfPos, {
        icon: L.divIcon({
          html: `<div style="width:14px;height:14px;background:#ffe082;transform:rotate(45deg);border:2px solid #fff;box-shadow:0 0 4px rgba(255,224,130,.8)"></div>`,
          className: '', iconSize: [14,14], iconAnchor: [7,7],
        })
      }).addTo(aimLeafletMap);
      aimMapLayers.gsfLbl = L.marker(rwyEdge(gsfEyeFt, rwy, -1, HW+18), {
        icon: L.divIcon({
          html: `<div style="background:rgba(0,0,0,.82);color:#ffe082;border:1px solid #ffe082;padding:2px 6px;font-size:10px;font-weight:700;border-radius:3px;white-space:nowrap">G/S Follow Eye Aim ${gsfEyeFt}ft (${Math.round(gsfEyeFt*0.3048)}m)</div>`,
          className: '', iconAnchor: [100, 10],
        })
      }).addTo(aimLeafletMap);
    }

    // TH マーカー
    aimMapLayers.th = L.marker(posAt(0, rwy), {
      icon: L.divIcon({
        html: `<div style="width:10px;height:10px;background:#eceff1;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(255,255,255,.7)"></div>`,
        className: '', iconSize: [10,10], iconAnchor: [5,5],
      })
    }).addTo(aimLeafletMap);

    // Runway Name Marker（黄色）
    aimMapLayers.rwyName = L.marker(posAt(0, rwy), {
      icon: L.divIcon({
        html: `<div style="color:#ffcc02;font-size:14px;font-weight:bold;text-shadow:1px 1px 3px rgba(0,0,0,.8)">${rwy.name}</div>`,
        className: '', iconAnchor: [15, 0],
      })
    }).addTo(aimLeafletMap);

    // 表示範囲をフィット（displaced area + 900m含める）
    const farFt = Math.max(gsfEyeFt + 150, 900 / 0.3048);
    const startFt = -dispFt; // 物理的滑走路端（displaced=0なら0）
    const pts = [
      posAt(startFt, rwy), posAt(0, rwy), posAt(farFt, rwy),
      rwyEdge(startFt, rwy, -1, HW+60), rwyEdge(startFt, rwy, +1, HW+60),
      rwyEdge(0,       rwy, -1, HW+60), rwyEdge(0,       rwy, +1, HW+60),
      rwyEdge(farFt,   rwy, -1, HW+60), rwyEdge(farFt,   rwy, +1, HW+60),
    ];
    aimLeafletMap.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  }

  function setAimView(mode) {
    if (animRunning) stopAnim(false);
    aimViewMode = mode;
    const canvas = el('aim-canvas');
    const mapDiv = el('aim-map');
    const btnPersp = el('aim-btn-persp');
    const btnSat   = el('aim-btn-sat');
    if (!canvas || !mapDiv) return;

    if (mode === 'persp') {
      canvas.style.display = '';
      mapDiv.style.display = 'none';
      btnPersp && btnPersp.classList.add('aim-view-active');
      btnSat   && btnSat.classList.remove('aim-view-active');
      drawAimingPoint();
    } else {
      canvas.style.display = 'none';
      mapDiv.style.display = 'block';
      btnPersp && btnPersp.classList.remove('aim-view-active');
      btnSat   && btnSat.classList.add('aim-view-active');
      // display反映後にLeafletを初期化
      setTimeout(() => {
        if (!aimLeafletMap) {
          initAimMap();
        } else {
          updateAimMap();
          aimLeafletMap.invalidateSize();
        }
      }, 60);
    }
  }

  // ===== 初期化 =====
  window.addEventListener('DOMContentLoaded', () => {
    updateAimRunwayOptions();
    loadAimIlsDefaults();

    const apSel = el('aim-airport-sel');
    const rwSel = el('aim-runway-sel');
    if (apSel) apSel.addEventListener('change', () => {
      updateAimRunwayOptions();
      loadAimIlsDefaults();
      // ZSPD は自動的に CHINA 方式を選択
      if (apSel.value === 'ZSPD') {
        const chinaBtn = document.querySelector('.aim-std-btn[data-std="china"]');
        if (chinaBtn) chinaBtn.click();
      }
      // KORD と KLAX は自動的に FAA 方式を選択
      if (apSel.value === 'KORD' || apSel.value === 'KLAX') {
        console.log('🔧 ' + apSel.value + ' selected - auto-selecting FAA standard');
        const faaBtn = document.querySelector('.aim-std-btn[data-std="faa"]');
        console.log('FAA button found:', !!faaBtn);
        if (faaBtn) {
          console.log('Clicking FAA button...');
          faaBtn.click();
        }
      }
      if (aimViewMode === 'persp') drawAimingPoint(); else updateAimMap();
      if (typeof window.syncPapiTo === 'function')
        window.syncPapiTo(apSel.value, el('aim-runway-sel') ? el('aim-runway-sel').value : null);
    });
    if (rwSel) rwSel.addEventListener('change', () => {
      loadAimIlsDefaults();
      updateCoordinateDisplay();
      if (aimViewMode === 'persp') drawAimingPoint(); else updateAimMap();
      if (typeof window.syncPapiTo === 'function')
        window.syncPapiTo(null, rwSel.value);
    });

    // 座標調整ボタン
    const latDecBtn = document.getElementById('aim-lat-dec');
    const lonDecBtn = document.getElementById('aim-lon-dec');
    const coordCancel = document.getElementById('coord-cancel');
    const coordSave = document.getElementById('coord-save');
    const exportBtn = document.getElementById('aim-export-json');

    if (latDecBtn) latDecBtn.addEventListener('click', showCoordModal);
    if (lonDecBtn) lonDecBtn.addEventListener('click', showCoordModal);
    if (coordCancel) coordCancel.addEventListener('click', closeCoordModal);
    if (coordSave) coordSave.addEventListener('click', saveCoords);
    if (exportBtn) exportBtn.addEventListener('click', exportCoordsAsJSON);

    // 初期座標表示
    updateCoordinateDisplay();

    ['aim-angle','aim-gsant','aim-papi','aim-papi-angle','aim-aim','aim-stripe','aim-aircraft']
      .forEach(id => {
        const e = el(id);
        if (!e) return;
        e.addEventListener('change', () => {
          updateAimInfo();
          if (aimViewMode === 'persp') drawAimingPoint(); else updateAimMap();
        });
        e.addEventListener('input', () => { updateAimInfo(); });
      });

    const btnPersp = el('aim-btn-persp');
    const btnSat   = el('aim-btn-sat');
    if (btnPersp) btnPersp.addEventListener('click', () => setAimView('persp'));
    if (btnSat)   btnSat.addEventListener('click',   () => setAimView('sat'));

    // 3° Path アニメーション コントロール
    const animBtn = el('aim-btn-anim');
    if (animBtn) animBtn.addEventListener('click', startAnim);
    const animPauseBtn = el('aim-anim-pause');
    if (animPauseBtn) animPauseBtn.addEventListener('click', () => {
      animPaused = !animPaused;
      animPauseBtn.textContent = animPaused ? '▶' : '⏸';
    });
    const animStopBtn = el('aim-anim-stop');
    if (animStopBtn) animStopBtn.addEventListener('click', () => stopAnim(true));
    const animSatBtn = el('aim-anim-sat');
    if (animSatBtn) animSatBtn.addEventListener('click', () => {
      animUseSat = !animUseSat;
      animSatBtn.classList.toggle('aim-view-active', animUseSat);
      if (animUseSat) buildGroundTexture();
    });
    document.querySelectorAll('.aim-anim-sp').forEach(b => b.addEventListener('click', () => {
      animSpeed = parseFloat(b.dataset.sp) || 1;
      document.querySelectorAll('.aim-anim-sp').forEach(x => x.classList.toggle('aim-view-active', x === b));
    }));

    // Blind Zone modal
    const bzBtn = el('aim-blind-zone-btn');
    if (bzBtn) bzBtn.addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;
      const content = document.createElement('div');
      content.style.cssText = `
        background: #fff;
        padding: 20px;
        border-radius: 8px;
        max-width: 90%;
        max-height: 90%;
        overflow: auto;
        position: relative;
      `;
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = `
        position: absolute;
        top: 10px; right: 10px;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #333;
      `;
      closeBtn.addEventListener('click', () => modal.remove());

      const img = document.createElement('img');
      img.src = './images/blind-zone.png';
      img.style.cssText = 'width: 100%; height: auto;';

      content.appendChild(closeBtn);
      content.appendChild(img);
      modal.appendChild(content);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
      document.body.appendChild(modal);
    });

    window.addEventListener('resize', () => {
      const view = el('aim-view');
      if (!view || view.style.display === 'none') return;
      if (aimViewMode === 'persp') drawAimingPoint();
      else if (aimLeafletMap) aimLeafletMap.invalidateSize();
    });

    // Aiming Point 標準値ボタンのイベントハンドラ（イベント委譲）
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.aim-std-btn');
      if (!btn) return;

      const std = btn.dataset.std;
      const data = AIM_STANDARDS[std];
      if (!data) return;

      console.log('aim-std-btn clicked via delegation:', std);

      // ボタンのアクティブ状態を切り替え
      document.querySelectorAll('.aim-std-btn').forEach(b => {
        b.classList.remove('aim-std-active');
        b.style.background = '#0f3460';
        b.style.color = '#aaa';
        b.style.borderColor = '#1a4a7a';
        b.style.fontWeight = 'normal';
      });
      btn.classList.add('aim-std-active');
      btn.style.background = '#1565c0';
      btn.style.color = '#e3f2fd';
      btn.style.borderColor = '#4fc3f7';
      btn.style.fontWeight = 'bold';

      // Aiming Point と ストライプ長を自動更新
      const aimEl = el('aim-aim');
      const stripeEl = el('aim-stripe');
      if (aimEl) aimEl.value = data.aimFt;
      if (stripeEl) stripeEl.value = data.stripeFt;

      // 図形を再描画
      updateAimInfo();
      if (aimViewMode === 'persp') drawAimingPoint();
    });
  });

  // papi.js の showView('aim') から呼び出せるようにグローバル公開
  window.drawAimingPoint = drawAimingPoint;
  window.updateAimRunwayOptions = updateAimRunwayOptions;

  // Aiming Point 標準値選択機能（グローバル化）
  window.setupAimStdButtons = function() {
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.aim-std-btn');
      if (!btn) return;

      const std = btn.dataset.std;
      const data = AIM_STANDARDS[std];
      if (!data) return;

      console.log('aim-std-btn clicked:', std);

      document.querySelectorAll('.aim-std-btn').forEach(b => {
        b.classList.remove('aim-std-active');
        b.style.background = '#0f3460';
        b.style.color = '#aaa';
      });
      btn.classList.add('aim-std-active');
      btn.style.background = '#1565c0';
      btn.style.color = '#e3f2fd';
      btn.style.fontWeight = 'bold';

      const aimEl = el('aim-aim');
      const stripeEl = el('aim-stripe');
      if (aimEl) aimEl.value = data.aimFt;
      if (stripeEl) stripeEl.value = data.stripeFt;

      updateAimInfo();
      if (aimViewMode === 'persp') drawAimingPoint();
    });
  };

  // PAPIタブからAimingタブを同期するグローバル関数
  window.syncAimTo = function(apCode, rwCode) {
    const apSel = el('aim-airport-sel');
    const rwSel = el('aim-runway-sel');
    if (!apSel || !rwSel) return;
    if (apCode) { apSel.value = apCode; updateAimRunwayOptions(); }
    if (rwCode) rwSel.value = rwCode;
    loadAimIlsDefaults();
  };

  // ビュー切り替え関数をグローバル化
  window.setAimView = setAimView;

  // 座標調整機能
  function decimalToDMS(decimal, isLat) {
    const sign = decimal < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
    decimal = Math.abs(decimal);
    const deg = Math.floor(decimal);
    const min = Math.floor((decimal - deg) * 60);
    const sec = ((decimal - deg) * 60 - min) * 60;
    return `${deg}°${min}'${sec.toFixed(2)}"${sign}`;
  }

  function DMSToDecimal(dmsStr) {
    const match = dmsStr.match(/(\d+)°(\d+)'([\d.]+)"([NSEW])/);
    if (!match) return null;
    let decimal = parseFloat(match[1]) + parseFloat(match[2])/60 + parseFloat(match[3])/3600;
    if (match[4] === 'S' || match[4] === 'W') decimal = -decimal;
    return decimal;
  }

  function getAdjustedCoords() {
    const { apCode, rwCode } = currentAimApRw();
    const key = `coords_${apCode}_${rwCode}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const [lat, lon] = JSON.parse(stored);
      return { lat, lon, isAdjusted: true };
    }
    const rwy = currentAimRwy();
    if (!rwy) return { lat: 0, lon: 0, isAdjusted: false };
    return { lat: rwy.threshold[0], lon: rwy.threshold[1], isAdjusted: false };
  }

  function updateCoordinateDisplay() {
    const { lat, lon, isAdjusted } = getAdjustedCoords();
    document.getElementById('aim-lat-dms').value = decimalToDMS(lat, true);
    document.getElementById('aim-lon-dms').value = decimalToDMS(lon, false);
    document.getElementById('aim-lat-dec-val').textContent = lat.toFixed(5);
    document.getElementById('aim-lon-dec-val').textContent = lon.toFixed(5);
    if (isAdjusted) {
      document.getElementById('aim-lat-dms').style.background = '#1a5c1a';
      document.getElementById('aim-lon-dms').style.background = '#1a5c1a';
    } else {
      document.getElementById('aim-lat-dms').style.background = '#0d1f2d';
      document.getElementById('aim-lon-dms').style.background = '#0d1f2d';
    }
  }

  function showCoordModal() {
    const { lat, lon } = getAdjustedCoords();
    document.getElementById('coord-lat-input').value = decimalToDMS(lat, true);
    document.getElementById('coord-lon-input').value = decimalToDMS(lon, false);
    document.getElementById('coord-modal').style.display = 'flex';
  }

  function closeCoordModal() {
    document.getElementById('coord-modal').style.display = 'none';
  }

  function saveCoords() {
    const latDMS = document.getElementById('coord-lat-input').value;
    const lonDMS = document.getElementById('coord-lon-input').value;
    const lat = DMSToDecimal(latDMS);
    const lon = DMSToDecimal(lonDMS);
    if (lat === null || lon === null) {
      alert('座標形式が正しくありません。例: 22°19\'17.72"N');
      return;
    }
    const { apCode, rwCode } = currentAimApRw();
    const key = `coords_${apCode}_${rwCode}`;
    localStorage.setItem(key, JSON.stringify([lat, lon]));
    updateCoordinateDisplay();
    if (aimViewMode === 'sat') updateAimMap();
    closeCoordModal();
    alert('座標を保存しました。');
  }

  function exportCoordsAsJSON() {
    // すべての調整済み座標を収集
    const adjustedCoords = {};
    for (const apCode in AIRPORTS) {
      const ap = AIRPORTS[apCode];
      adjustedCoords[apCode] = {};
      for (const rwCode in ap.runways) {
        const key = `coords_${apCode}_${rwCode}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          const [lat, lon] = JSON.parse(stored);
          adjustedCoords[apCode][rwCode] = { threshold: [lat, lon] };
        }
      }
    }

    // 調整がない場合
    const hasAdjustments = Object.values(adjustedCoords).some(a => Object.keys(a).length > 0);
    if (!hasAdjustments) {
      alert('調整された座標がありません。');
      return;
    }

    // JSON を airports.js 形式で生成
    let json = '// Adjusted runway thresholds (paste into airports.js)\n';
    json += '// Format: "APCODE": { "RUNWAY": { threshold: [lat, lon] } }\n\n';
    json += 'const ADJUSTED_COORDS = ' + JSON.stringify(adjustedCoords, null, 2) + ';\n\n';
    json += '// Usage: merge this into AIRPORTS[apCode].runways[rwCode].threshold\n';

    // JSON ファイルをダウンロード
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adjusted_coords_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // airport/runway 変更時に座標を表示
  const origUpdateAimRunwayOptions = updateAimRunwayOptions;
  window.updateAimRunwayOptionsWithCoords = function() {
    origUpdateAimRunwayOptions();
    updateCoordinateDisplay();
  };

  // グローバルスコープで公開
  window.exportCoordsAsJSON = exportCoordsAsJSON;

})();

// aimpoint.js のIIFE外で、ページロード後に標準値ボタンのイベントを設定
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.setupAimStdButtons);
} else {
  window.setupAimStdButtons();
}
