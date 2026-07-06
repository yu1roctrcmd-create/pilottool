// ===== PAPI / グライドパス解析ページ =====
(function () {
  const FT_PER_NM = 6076.12;

  // 機種データ: GS アンテナからパイロット目高 (ft) ── VOL.29 Table A6-2 より
  const AIRCRAFT_DATA = {
    'B747-8F':  { eyeHt: 20.9 },
    'B747-400': { eyeHt: 15.3 },
    'B767-300': { eyeHt: 6.9  },
    'B737-900': { eyeHt: 1.1  },
  };

  let standardMode = 'icao';
  let ilsPresent = true; // ILS あり/なし モード

  function el(id) { return document.getElementById(id); }

  // ===== タブ切替 =====
  function showView(which) {
    const main = el('main'), papi = el('papi-view'), aim = el('aim-view'), dev = el('dev-view');
    const tabC = el('tab-circuit'), tabP = el('tab-papi'), tabA = el('tab-aim'), tabD = el('tab-dev');
    main.style.display = 'none';
    if (papi) papi.style.display = 'none';
    if (aim)  aim.style.display  = 'none';
    if (dev)  dev.style.display  = 'none';
    if (tabC) tabC.classList.remove('active');
    if (tabP) tabP.classList.remove('active');
    if (tabA) tabA.classList.remove('active');
    if (tabD) tabD.classList.remove('active');
    if (which === 'papi') {
      if (papi) papi.style.display = 'flex';
      if (tabP) tabP.classList.add('active');
      updatePapiRunwayOptions();
      updatePapiRwyLabel();
      loadIlsDefaults();
      updateSatelliteImage();
      drawPapi();
      drawRunwayDiagram();
      updateBlindZoneInfo();
    } else if (which === 'aim') {
      if (aim) aim.style.display = 'flex';
      if (tabA) tabA.classList.add('active');
      if (typeof window.updateAimRunwayOptions === 'function') window.updateAimRunwayOptions();
      if (typeof drawAimingPoint === 'function') drawAimingPoint();
    } else if (which === 'dev') {
      if (dev) dev.style.display = 'flex';
      if (tabD) tabD.classList.add('active');
      if (typeof window.drawDev === 'function') window.drawDev();
    } else {
      main.style.display = 'flex';
      if (tabC) tabC.classList.add('active');
      if (typeof map !== 'undefined' && map) setTimeout(() => map.invalidateSize(), 50);
    }
  }

  function currentApRw() {
    const apSel = el('papi-airport-sel');
    const rwSel = el('papi-runway-sel');
    return {
      apCode: (apSel && apSel.value) ? apSel.value : (typeof currentAirport !== 'undefined' ? currentAirport : 'RJAA'),
      rwCode: (rwSel && rwSel.value) ? rwSel.value : (typeof currentRunway  !== 'undefined' ? currentRunway  : '16R'),
    };
  }

  function currentRwy() {
    if (typeof AIRPORTS === 'undefined') return null;
    const { apCode, rwCode } = currentApRw();
    const ap = AIRPORTS[apCode];
    return ap ? ap.runways[rwCode] : null;
  }

  function getRwyLengthFt() {
    const rwy = currentRwy();
    return rwy ? (rwy.length_m || 3000) * 3.28084 : 9843;
  }

  function getStandardAimFt() {
    if (standardMode === 'faa') return 1000;
    return getRwyLengthFt() >= 7874 ? 1312 : 984;
  }

  function getStripeLenFt() {
    if (standardMode === 'faa') return 150;
    return getRwyLengthFt() >= 7874 ? 197 : 148;
  }

  function updateIlsButtons() {
    const btnOn  = el('papi-ils-btn');
    const btnOff = el('papi-noils-btn');
    if (btnOn)  btnOn.classList.toggle('std-active',  ilsPresent);
    if (btnOff) btnOff.classList.toggle('std-active', !ilsPresent);

    // ILSなしの場合、GS関連項目を非表示（個別要素のみ）
    const gpaRow = el('papi-aim') ? el('papi-aim').closest('.param-row') : null;
    const gsantRow = el('papi-gsant') ? el('papi-gsant').closest('.param-row') : null;
    const gsdevRow = el('gs-dev-show') ? el('gs-dev-show').closest('.param-row') : null;

    // GS偏差修正計算セクション — 個別の行のみ非表示
    const gsCorr_titleRow = document.querySelector('.section-title:nth-of-type(2)'); // "GS 偏差 修正計算"
    const gsCorrAltRow = el('gs-corr-alt') ? el('gs-corr-alt').closest('.param-row') : null;
    const gsCorrDotRow = el('gs-corr-dot') ? el('gs-corr-dot').closest('.param-row') : null;
    const gsCorrResultRow = el('gs-corr-result');

    if (gpaRow) gpaRow.style.display = ilsPresent ? 'block' : 'none';
    if (gsantRow) gsantRow.style.display = ilsPresent ? 'block' : 'none';
    if (gsdevRow) gsdevRow.style.display = ilsPresent ? 'block' : 'none';
    if (gsCorr_titleRow) gsCorr_titleRow.style.display = ilsPresent ? 'block' : 'none';
    if (gsCorrAltRow) gsCorrAltRow.style.display = ilsPresent ? 'block' : 'none';
    if (gsCorrDotRow) gsCorrDotRow.style.display = ilsPresent ? 'block' : 'none';
    if (gsCorrResultRow) gsCorrResultRow.style.display = ilsPresent ? 'block' : 'none';
  }

  function autoDetectIls() {
    const rwy = currentRwy();
    ilsPresent = !!(rwy && rwy.ils);
    updateIlsButtons();
  }

  function updatePapiRunwayOptions() {
    const apSel = el('papi-airport-sel');
    const rwSel = el('papi-runway-sel');
    if (!apSel || !rwSel || typeof AIRPORTS === 'undefined') return;
    const ap = AIRPORTS[apSel.value];
    if (!ap) return;
    const cur = rwSel.value;
    rwSel.innerHTML = Object.keys(ap.runways)
      .map(r => `<option value="${r}"${r === cur ? ' selected' : ''}>${r}</option>`)
      .join('');
  }

  function updatePapiRwyLabel() {
    const { apCode, rwCode } = currentApRw();
    const ap  = typeof AIRPORTS !== 'undefined' ? AIRPORTS[apCode] : null;
    const rwy = ap ? ap.runways[rwCode] : null;
    const lbl = el('papi-rwy-label');
    if (!lbl || !ap || !rwy) return;
    lbl.textContent = `${ap.icao} RWY${rwCode}  TH ${rwy.tdze || 0}ft  ${Math.round(getRwyLengthFt())}ft`;
  }

  // ===== GP チャート描画 =====
  function drawPapi() {
    const canvas = el('papi-canvas');
    if (!canvas || el('papi-view').style.display === 'none') return;

    const rwy    = currentRwy();
    const thElev = rwy ? (rwy.tdze || 0) : 0;

    const angle   = parseFloat(el('papi-angle').value);
    const aimFt   = parseFloat(el('papi-aim').value);
    let papiFt    = parseFloat(el('papi-loc').value);
    // ILSなしの場合、PAPI = Aiming Point位置
    if (!ilsPresent) {
      papiFt = aimFt;
    }
    const spread  = parseFloat(el('papi-spread').value);
    // PAPI基準角度（設置角）。降下角度と独立に設定可能（例: ILS 15@PANC = 3.2°）
    const papiRef = parseFloat((el('papi-ref-angle') || {}).value) || 3.0;
    const gsAntFt = parseFloat(el('papi-gsant').value);
    const rangeNM = parseFloat(el('papi-range').value);
    const acType  = el('papi-aircraft') ? el('papi-aircraft').value : 'B747-8F';
    const eyeHt   = (AIRCRAFT_DATA[acType] || AIRCRAFT_DATA['B747-8F']).eyeHt;
    const aspd    = el('papi-aspd') ? parseFloat(el('papi-aspd').value) : 165;
    const slope   = el('papi-slope') ? parseFloat(el('papi-slope').value) : 0.0;
    const oat     = el('papi-oat')   ? parseFloat(el('papi-oat').value)   : 15;

    const stdAimFt    = getStandardAimFt();
    const stripeLenFt = getStripeLenFt();
    const stripeEndFt = stdAimFt + stripeLenFt;
    const visualAimFt = aimFt + eyeHt / Math.tan(angle * Math.PI / 180);
    // GS アンテナから Pilot Eye Visual Aim までの水平距離
    const gsToVisualFt = visualAimFt - gsAntFt;
    // [1] 滑走路勾配補正
    const slopeAngleDeg = Math.atan(slope / 100) * 180 / Math.PI;
    const effGpAngle    = angle - slopeAngleDeg;
    // [3] 地上気温 / Baro VNAV 補正
    const T_ISA      = 15 - thElev * 0.001981;       // 標高での ISA 気温 (°C)
    const oatDev     = oat - T_ISA;                   // ISA 偏差
    const tempFactor = (273 + oat) / (273 + T_ISA);  // 実高度/指示高度 比

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.clientWidth;
    const H   = canvas.clientHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const pad   = { l: 64, r: 110, t: 36, b: 44 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;

    const altAt    = (dNM, offFt, deg) => thElev + (dNM * FT_PER_NM + offFt) * Math.tan(deg * Math.PI / 180);
    const eyeAltAt = (dNM, offFt, deg) => altAt(dNM, offFt, deg) + eyeHt;

    const outerAngle = Math.max(angle, papiRef) + (ilsPresent ? spread * 1.16 : spread);
    const topAlt = Math.ceil((Math.max(
      altAt(rangeNM, papiFt, outerAngle),
      eyeAltAt(rangeNM, aimFt, angle)
    ) + 180) / 100) * 100;
    const yMin   = Math.max(0, thElev - 50);

    // TH後方（滑走路内部）の表示延長: 常に1500ft分
    const rwyExtFt  = 1500;
    const rwyExtNM  = rwyExtFt / FT_PER_NM;
    const totalRangeNM = rangeNM + rwyExtNM;
    const X = dNM => pad.l + (1 - (dNM + rwyExtNM) / totalRangeNM) * plotW;
    const Y = alt  => pad.t + (1 - (alt - yMin) / (topAlt - yMin)) * plotH;
    const pxPerFt = plotW / (totalRangeNM * FT_PER_NM);
    const yRwy    = Y(thElev);

    // 滑走路内部エリア（X(0)〜右端）を薄い背景で示す
    const xTH = X(0);
    ctx.fillStyle = 'rgba(100,120,100,0.07)';
    ctx.fillRect(xTH, pad.t, pad.l + plotW - xTH, plotH);

    // グリッド
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
    ctx.fillStyle = '#78909c'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const gridStep = rangeNM > 6 ? 1 : 0.5;
    for (let d = 0; d <= rangeNM + 0.001; d += gridStep) {
      const x = X(d);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
      ctx.fillText(d.toFixed(rangeNM > 6 ? 0 : 1), x, pad.t + plotH + 16);
    }
    // TH（0.0NM）縦線を強調
    ctx.strokeStyle = 'rgba(144,164,174,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xTH, pad.t); ctx.lineTo(xTH, pad.t + plotH); ctx.stroke();
    ctx.fillStyle = '#78909c'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('TH', xTH, pad.t + plotH + 16);
    ctx.textAlign = 'right';
    const yStep = topAlt > 1600 ? 200 : 100;
    for (let a = Math.ceil(yMin / yStep) * yStep; a <= topAlt; a += yStep) {
      const y = Y(a);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
      ctx.fillText(a, pad.l - 6, y + 4);
    }
    ctx.fillStyle = '#78909c'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Distance From Threshold (nm)', pad.l + plotW / 2, H - 8);
    ctx.save(); ctx.translate(16, pad.t + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('Baro Altitude (feet MSL)', 0, 0); ctx.restore();

    // PAPI 遷移角ライン（ILSあり: ±0.58S/±0.50S、ILSなし: ±S/±S/3）
    const papiAngles = ilsPresent
      ? [papiRef + spread * 1.16, papiRef + spread * 0.5, papiRef - spread * 0.5, papiRef - spread * 1.16]
      : [papiRef + spread,        papiRef + spread / 3,   papiRef - spread / 3,   papiRef - spread];

    // ── Approach Corridor 黄色塗りつぶし（Figure 5 黄帯）──
    // papiAngles[1]（2W2R上限 B'）〜 papiAngles[2]（2W2R下限 C'）の楔形
    {
      const xApex = Math.min(X(0) + papiFt * pxPerFt, W - 3);
      const xFar  = X(rangeNM);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xFar,  Y(altAt(rangeNM, papiFt, papiAngles[1])));
      ctx.lineTo(xApex, yRwy);
      ctx.lineTo(xFar,  Y(altAt(rangeNM, papiFt, papiAngles[2])));
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 214, 0, 0.28)';
      ctx.fill();
      ctx.restore();

    }

    // PAPI 遷移角ライン（外側 i=0,3 グレー / 内側 i=1,2 B'・C' 黄色）
    ctx.setLineDash([6, 4]);
    papiAngles.forEach((a, i) => {
      const isInner = i === 1 || i === 2;
      ctx.lineWidth   = isInner ? 2.0 : 1.2;
      ctx.strokeStyle = isInner ? '#f9a825' : '#8a9ba8';
      ctx.beginPath();
      ctx.moveTo(X(rangeNM), Y(altAt(rangeNM, papiFt, a)));
      ctx.lineTo(Math.min(X(0) + papiFt * pxPerFt, W - 3), yRwy);
      ctx.stroke();
      ctx.fillStyle = isInner ? '#f9a825' : '#607d8b';
      ctx.font = isInner ? 'bold 10px sans-serif' : '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(a.toFixed(2) + '°', X(rangeNM) + 4, Y(altAt(rangeNM, papiFt, a)) - 2);
    });
    ctx.setLineDash([]);

    // ── GS デビエーションライン（±1dot / ±2dot、0.36°/dot）──
    // 全ビームはGSアンテナ実位置（gsAntFt）を原点とする
    // ILSある場合のみ表示
    if (ilsPresent && el('gs-dev-show') && el('gs-dev-show').checked) {
      const DOT_DEG    = 0.36;
      const angleRad   = angle * Math.PI / 180;
      // GSアンテナ実位置（スライダー値）を収束点に使用
      const devApexFt  = gsAntFt || 0;
      const devApexX   = Math.min(X(0) + devApexFt * pxPerFt, W - 3);
      const devApexY   = Y(thElev);

      const gsDevDefs = [
        { dots: +2, color: 'rgba(239,83,80,0.75)',   dash: [3, 5], lw: 0.9 },
        { dots: +1, color: 'rgba(255,143,0,0.85)',   dash: [6, 4], lw: 1.1 },
        { dots: -1, color: 'rgba(79,195,247,0.85)',  dash: [6, 4], lw: 1.1 },
        { dots: -2, color: 'rgba(21,101,192,0.75)',  dash: [3, 5], lw: 0.9 },
      ];
      gsDevDefs.forEach(({ dots, color, dash, lw }) => {
        const devAngle = angle + dots * DOT_DEG;
        // GSアンテナ位置（devApexFt）からの角度でrangeNM地点の高度を算出
        const altFar   = thElev + (rangeNM * FT_PER_NM + devApexFt) * Math.tan(devAngle * Math.PI / 180);
        if (Y(altFar) < pad.t || Y(altFar) > pad.t + plotH) return;
        ctx.strokeStyle = color;
        ctx.lineWidth   = lw;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(X(rangeNM), Y(altFar));
        ctx.lineTo(devApexX, devApexY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle   = color;
        ctx.font        = `${Math.abs(dots) === 2 ? '8' : '9'}px sans-serif`;
        ctx.textAlign   = 'left';
        const sign = dots > 0 ? '+' : '';
        ctx.fillText(`${sign}${dots}dot`, X(rangeNM) + 4, Y(altFar) + (dots > 0 ? -3 : 10));
      });
    }

    // ── IAN Approach 温度別 VPA ライン（TCH 50ft AGL 収束点）──
    if (!ilsPresent) {
      const T_ISA = 15;
      const baseVPA = 3.0;
      const tch_agl = 50; // TCH 高さ: 50ft AGL
      const tchX = X(0); // Threshold 位置（距離 0 NM）
      const tchY = Y(thElev + tch_agl); // Threshold + 50ft AGLの高さ

      // ISA, ISA+5, ISA+10, ... ISA+30
      const tempOffsets = [0, 5, 10, 15, 20, 25, 30];
      const vpaColors = [
        'rgba(76,175,80,0.7)',   // ISA (15°C) - 緑
        'rgba(255,152,0,0.6)',   // ISA+5 (20°C) - オレンジ
        'rgba(255,193,7,0.5)',   // ISA+10 (25°C) - イエロー
        'rgba(244,67,54,0.6)',   // ISA+15 (30°C) - レッド
        'rgba(233,30,99,0.5)',   // ISA+20 (35°C) - ピンク
        'rgba(156,39,176,0.5)',  // ISA+25 (40°C) - パープル
        'rgba(63,81,181,0.6)'    // ISA+30 (45°C) - インディゴ
      ];

      // 現在の OAT に対応する VPA と Pilot Eye ラインを強調表示
      const oatOffset = oat - T_ISA;
      const currentVPA = baseVPA + (oatOffset / 10) * 0.12;
      const eyeHt = (AIRCRAFT_DATA[el('papi-aircraft').value] || AIRCRAFT_DATA['B747-8F']).eyeHt;

      tempOffsets.forEach((offset, idx) => {
        const temp = T_ISA + offset;
        const vpa = baseVPA + (offset / 10) * 0.12;

        // TCH (thElev + 50ft) から rangeNM 地点の高度を計算
        // VPA ラインは TCH ポイント(0, thElev+50)を通る直線
        const altFar = (thElev + tch_agl) + (rangeNM * FT_PER_NM) * Math.tan(vpa * Math.PI / 180);

        if (Y(altFar) >= pad.t && Y(altFar) <= pad.t + plotH) {
          ctx.strokeStyle = vpaColors[idx];
          ctx.lineWidth = idx === 0 ? 2 : 1.2; // ISA ラインは太く
          ctx.setLineDash(idx === 0 ? [1, 0] : [4, 3]); // ISA ラインは実線、その他は点線
          ctx.beginPath();
          ctx.moveTo(X(rangeNM), Y(altFar));
          ctx.lineTo(tchX, tchY);
          ctx.stroke();
          ctx.setLineDash([]);

          // ラベル表示
          ctx.fillStyle = vpaColors[idx];
          ctx.font = idx === 0 ? 'bold 9px sans-serif' : '8px sans-serif';
          ctx.textAlign = 'left';
          const label = 'ISA' + (offset > 0 ? '+' + offset : '');
          ctx.fillText(label + ' ' + vpa.toFixed(2) + '°', X(rangeNM) + 3, Y(altFar) - 2);

          // ── Pilot Eye ライン（現在の OAT に対応する場合）──
          if (Math.abs(vpa - currentVPA) < 0.01) {  // 現在の VPA と一致
            const eyeAltFar = (thElev + tch_agl + eyeHt) + (rangeNM * FT_PER_NM) * Math.tan(vpa * Math.PI / 180);
            const eyeTchY = Y(thElev + tch_agl + eyeHt);

            if (Y(eyeAltFar) >= pad.t && Y(eyeAltFar) <= pad.t + plotH) {
              // Pilot Eye ライン（同色、点線、太め）
              ctx.strokeStyle = vpaColors[idx];
              ctx.lineWidth = 1.8;
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.moveTo(X(rangeNM), Y(eyeAltFar));
              ctx.lineTo(X(0), eyeTchY);
              ctx.stroke();
              ctx.setLineDash([]);

              // Pilot Eye ラベル
              ctx.fillStyle = vpaColors[idx];
              ctx.font = 'bold 9px sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText('Pilot Eye ' + eyeHt.toFixed(1) + 'ft', X(rangeNM) + 3, Y(eyeAltFar) + 10);
            }
          }
        }
      });
    }

    // ── ゾーンラベル（TOO HIGH / SLIGHTLY HIGH / CORRECT / SLIGHTLY LOW / TOO LOW）──
    {
      const lNM  = Math.min(rangeNM * 0.55, rangeNM - 0.1);
      const d1   = Math.min(lNM + 0.2, rangeNM);
      const d2   = Math.max(lNM - 0.2, 0.02);
      const extraSpread = spread * 0.7;
      const zoneDefs = [
        { a0: papiAngles[0] + extraSpread, a1: papiAngles[0], text: 'TOO HIGH',      color: 'rgba(239,154,154,0.85)' },
        { a0: papiAngles[0], a1: papiAngles[1],               text: 'SLIGHTLY HIGH', color: 'rgba(255,224,130,0.85)' },
        { a0: papiAngles[1], a1: papiAngles[2],               text: 'CORRECT',       color: 'rgba(165,214,167,0.90)' },
        { a0: papiAngles[2], a1: papiAngles[3],               text: 'SLIGHTLY LOW',  color: 'rgba(255,224,130,0.85)' },
        { a0: papiAngles[3], a1: papiAngles[3] - extraSpread, text: 'TOO LOW',       color: 'rgba(239,154,154,0.85)' },
      ];
      zoneDefs.forEach(({ a0, a1, text, color }) => {
        const aMid = (a0 + a1) / 2;
        const xMid = X(lNM);
        const yMid = (Y(altAt(lNM, papiFt, a0)) + Y(altAt(lNM, papiFt, a1))) / 2;
        if (yMid < pad.t || yMid > pad.t + plotH) return;
        // スクリーン上の傾き角
        const rot = Math.atan2(
          Y(altAt(d2, papiFt, aMid)) - Y(altAt(d1, papiFt, aMid)),
          X(d2) - X(d1)
        );
        ctx.save();
        ctx.translate(xMid, yMid);
        ctx.rotate(rot);
        ctx.fillStyle = color;
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(text, 0, 3);
        ctx.restore();
      });
    }

    // ===== PAPI 遷移高度 補助線（1NM 基準） =====
    const refNM = rangeNM >= 1.0 ? 1.0 : rangeNM * 0.5;
    // 4本の水平補助線
    const papiHLineColors = ['rgba(144,164,174,0.45)', 'rgba(79,195,247,0.6)', 'rgba(79,195,247,0.6)', 'rgba(144,164,174,0.45)'];
    const isLDAForLabels = !!(rwy && rwy.ils && rwy.ils.approachType === 'LDA');
    const papiHLineLabels = isLDAForLabels
      ? ['3W1R', '2W2R', '1W3R ✓', '4R']
      : ['3W1R', '2W2R ✓', '1W3R', '4R'];
    papiAngles.forEach((a, i) => {
      const altH = altAt(refNM, papiFt, a);
      const yH   = Y(altH);
      if (yH < pad.t || yH > pad.t + plotH) return;
      ctx.strokeStyle = papiHLineColors[i];
      ctx.lineWidth = (i === 1 || i === 2) ? 1.0 : 0.7;
      ctx.setLineDash([2, 7]);
      ctx.beginPath(); ctx.moveTo(pad.l, yH); ctx.lineTo(pad.l + plotW, yH); ctx.stroke();
      ctx.setLineDash([]);
    });
    // 1NM 参照縦線
    if (rangeNM >= 1.0) {
      const x1NM = X(1.0);
      ctx.strokeStyle = 'rgba(144,164,174,0.22)';
      ctx.lineWidth = 1; ctx.setLineDash([2, 8]);
      ctx.beginPath(); ctx.moveTo(x1NM, pad.t); ctx.lineTo(x1NM, pad.t + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#78909c'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('1NM', x1NM, pad.t - 4);
    }

    // [2] Aiming Point 位置計算（情報パネル用、チャート描画なし）
    const stdAimNM = stdAimFt / FT_PER_NM;
    const stripeNM = stripeEndFt / FT_PER_NM;

    // [2] GS アンテナ位置（ラベル — ILSある場合のみ）
    if (ilsPresent) {
      const gsNM = gsAntFt / FT_PER_NM;
      if (gsNM <= rangeNM) {
        const xGs = X(gsNM);
        // 衛星画像はcanvas上部を占有するため、ラベルは下部（plotH 75%付近）に描画
        const gsLblY = pad.t + plotH * 0.75;
        ctx.fillStyle = '#69f0ae'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('Glideslope  ' + Math.round(gsAntFt) + ' ft from TH', xGs + 4, gsLblY);
      }
    }

    // ── ILS Antenna Path（Figure 5 赤線）: ILS アンテナが追うグライドパス ──
    // THでTCH高度、同角度でGPI（地面交点）まで延びる
    const tch = rwy?.ils?.tch;
    if (tch) {
      const angleRad2    = angle * Math.PI / 180;
      const gpiFromTH    = tch / Math.tan(angleRad2);          // GPI: RWY内 TH からの距離(ft)
      const antAltRange  = thElev + tch + rangeNM * FT_PER_NM * Math.tan(angleRad2);
      ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(rangeNM), Y(antAltRange));
      ctx.lineTo(Math.min(X(0) + gpiFromTH * pxPerFt, W - 3), Y(thElev));
      ctx.stroke();
      ctx.fillStyle = '#ef5350'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('ILS antenna path  TCH ' + tch + 'ft', X(rangeNM) + 4, Y(antAltRange) + 10);
      // GPI マーカー（アンテナパスが地面と交わる点）— 青
      const xGPI = Math.min(X(0) + gpiFromTH * pxPerFt, W - 3);
      ctx.fillStyle = '#1565c0';
      ctx.beginPath(); ctx.arc(xGPI, Y(thElev), 4, 0, Math.PI * 2); ctx.fill();
      // GPI ラベル: 衛星画像より下（65%付近）に沿って回転描画
      {
        const x1 = X(rangeNM), y1 = Y(antAltRange);
        const x2 = xGPI,       y2 = Y(thElev);
        const mx = x1 + (x2 - x1) * 0.65;
        const my = y1 + (y2 - y1) * 0.65;
        const lineAngle = Math.atan2(y2 - y1, x2 - x1);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(lineAngle);
        ctx.fillStyle = '#42a5f5'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('GPI  ' + Math.round(gpiFromTH) + 'ft', 0, -4);
        ctx.restore();
      }

      // EAH ブラケット（Figure 6 準拠）: ILS path ↔ ILS+EAH の垂直間隔
      // EAH = Eye to Antenna Height = eyeHt（同角度で並走する2パスの高度差）
      // ブラケットはチャート中央付近（0.6NM）の2パス間に配置
      const bktNM  = Math.min(rangeNM * 0.6, rangeNM - 0.05);
      const xBkt   = X(bktNM);
      const antAltBkt = thElev + tch + bktNM * FT_PER_NM * Math.tan(angleRad2);
      const yAnt = Y(antAltBkt);
      const yEye = Y(antAltBkt + eyeHt);
      ctx.strokeStyle = '#e040fb'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xBkt, yAnt); ctx.lineTo(xBkt, yEye); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xBkt - 4, yAnt); ctx.lineTo(xBkt + 4, yAnt); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xBkt - 4, yEye); ctx.lineTo(xBkt + 4, yEye); ctx.stroke();
      ctx.save();
      ctx.fillStyle = '#e040fb'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.translate(xBkt + 14, (yAnt + yEye) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('EAH ' + eyeHt + 'ft', 0, 0);
      ctx.restore();

      // ── Eye Exit Point（AC 302-009 Figure 5/6）──
      // ILS追従時にパイロットの目がApproach Corridor下限（B'）を外れる地点
      // d > 0: TH手前でExit / d < 0: TH通過後も回廊内
      {
        const B_prime_rad = papiAngles[2] * Math.PI / 180;
        const tanBp = Math.tan(B_prime_rad);
        const tanA  = Math.tan(angleRad2);
        const dExFt = (tch + eyeHt - papiFt * tanBp) / (tanBp - tanA);
        const dExNM = dExFt / FT_PER_NM;

        if (dExNM >= 0 && dExNM <= rangeNM) {
          // TH手前チャート内でExit
          const xEx  = X(dExNM);
          const yEx  = Y(thElev + (dExFt + papiFt) * tanBp);
          ctx.strokeStyle = '#e040fb'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(xEx, yEx); ctx.lineTo(xEx, yRwy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#e040fb';
          ctx.beginPath(); ctx.arc(xEx, yEx, 4, 0, Math.PI * 2); ctx.fill();
          ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('Eye Exit', xEx, yRwy - 20);
          ctx.fillText(Math.round(dExFt) + 'ft', xEx, yRwy - 10);
        } else if (dExNM > rangeNM) {
          // TH手前だがチャート範囲外（遠方）
          ctx.fillStyle = '#e040fb'; ctx.font = '8px sans-serif'; ctx.textAlign = 'left';
          ctx.fillText('Eye Exit ' + Math.round(dExFt / 6076.12 * 10) / 10 + 'NM before TH', pad.l + 4, pad.t + 38);
        // else: TH通過後も回廊内（B747等）→ 表示なし
        }
      }

      // ── TCH / MEHT マーカー（滑走路末端 TH付近）──
      // TCH         = ILS glide path が TH を通過する高度（AGL）
      // MEHT(ILS)   = TCH + EAH = ILS追従時のパイロット目線 TH 通過高度
      // MEHT(PAPI)  = AIP公式値 = PAPI視覚追従時（WTH + H4）
      {
        const xTH    = X(0);
        const yTCH   = Y(thElev + tch);
        const mehtIls = Math.round((tch + eyeHt) * 10) / 10;
        const yMehtIls = Y(thElev + mehtIls);

        // TCH ティック（赤 = ILS antenna path と同色）
        ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xTH - 6, yTCH); ctx.lineTo(xTH + 16, yTCH); ctx.stroke();
        ctx.fillStyle = '#ef5350'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('TCH  ' + tch + 'ft', xTH + 18, yTCH + 3);

        // MEHT(ILS) ティック（シアン = Pilot Eye と同色）
        ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xTH - 6, yMehtIls); ctx.lineTo(xTH + 16, yMehtIls); ctx.stroke();
        ctx.fillStyle = '#00bcd4'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('MEHT(ILS)  ' + mehtIls + 'ft', xTH + 18, yMehtIls + 3);

        // MEHT(PAPI) = papiFt × tan(M)  where M = B − 2'（AC 302-009 Figure 3）
        // B = papiAngles[2]（コリドー下限 = 2W2R 下限角）
        // M = B − 2分角
        {
          const B_deg  = papiAngles[2];                         // コリドー下限角
          const M_deg  = B_deg - (2 / 60);                     // M = B − 2'
          const M_rad  = M_deg * Math.PI / 180;
          const mehtPapi = Math.round(papiFt * Math.tan(M_rad) * 10) / 10;
          const yMehtPapi = Y(thElev + mehtPapi);

          // M角度ライン（PAPI位置からTHまで点線）
          const xPapi = Math.min(X(0) + papiFt * pxPerFt, W - 3);
          ctx.strokeStyle = '#c6ff00'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(xPapi, yRwy); ctx.lineTo(xTH, yMehtPapi); ctx.stroke();
          ctx.setLineDash([]);

          // MEHT(PAPI) ティック（黄緑）
          ctx.strokeStyle = '#c6ff00'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(xTH - 6, yMehtPapi); ctx.lineTo(xTH + 16, yMehtPapi); ctx.stroke();
          ctx.fillStyle = '#c6ff00'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'left';
          ctx.fillText(
            'MEHT(PAPI)  ' + mehtPapi + 'ft  (M=' + M_deg.toFixed(2) + '° = B' + B_deg.toFixed(2) + '°−2\'（0.033°）)',
            xTH + 18, yMehtPapi + 3
          );
        }
      }
    }

    // ── DH 200ft & 100ft AGL 参照線（AC 302-009 Figure 7 準拠）──
    {
      const _tanA = Math.tan(angle * Math.PI / 180);
      const dhDefs = [
        { ft: 200, color: '#ffd54f', label: 'DH 200ft AGL', dash: [8, 4] },
        { ft: 100, color: '#90a4ae', label: '100ft AGL',    dash: [4, 4] },
      ];
      dhDefs.forEach(({ ft, color, label, dash }) => {
        const yDH = Y(thElev + ft);
        if (yDH < pad.t || yDH > pad.t + plotH) return;
        // ILS glide path（antenna path → GPI）がこの高さを通過する地点
        if (ilsPresent && tch) {
          const dCrossFt = (ft - tch) / _tanA;
          const dCrossNM = dCrossFt / FT_PER_NM;
          if (dCrossNM >= 0 && dCrossNM <= rangeNM) {
            const xCross  = X(dCrossNM);
            const dCrossM = Math.round(dCrossFt * 0.3048);
            // DH水平線: Y軸左端 → 交点のみ（全幅に引かない）
            ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
            ctx.beginPath(); ctx.moveTo(pad.l, yDH); ctx.lineTo(xCross, yDH); ctx.stroke();
            ctx.setLineDash([]);
            // ラベル（左端）
            ctx.fillStyle = color; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(label, pad.l + 4, yDH - 3);
            // 交点ドット
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(xCross, yDH, 3, 0, Math.PI * 2); ctx.fill();
            // 垂直線（交点 → 滑走路面）
            ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(xCross, yDH); ctx.lineTo(xCross, yRwy); ctx.stroke();
            ctx.setLineDash([]);
            // 距離ラベル（NM と m）
            ctx.fillStyle = color; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText((Math.round(dCrossNM * 100) / 100).toFixed(2) + 'NM', xCross, yRwy - 18);
            ctx.fillText(dCrossM + 'm', xCross, yRwy - 8);
          }
        }
      });
    }

    // Pilot Eye Path（Figure 5 破線）: パイロット目線の軌跡
    // ILSあり: ILSアンテナパス + EAH（TCH起点）/ ILSなし: GP目標角 + EAH（aimFt起点）
    {
      const _tanA = Math.tan(angle * Math.PI / 180);
      let eyeStartAlt, eyeEndX;
      if (ilsPresent && tch) {
        // ILS追従時: 目線はILSアンテナパスをEAH分だけ上にオフセット
        const gpiFromTH = tch / _tanA;
        eyeStartAlt = thElev + tch + eyeHt + rangeNM * FT_PER_NM * _tanA;
        eyeEndX = Math.min(X(0) + gpiFromTH * pxPerFt, W - 3);
      } else {
        eyeStartAlt = eyeAltAt(rangeNM, aimFt, angle);
        eyeEndX = Math.min(X(0) + aimFt * pxPerFt, W - 3);
      }
      ctx.strokeStyle = '#00bcd4'; ctx.lineWidth = 2; ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(X(rangeNM), Y(eyeStartAlt));
      ctx.lineTo(eyeEndX, Y(thElev + eyeHt));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#00bcd4'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('Pilot Eye (EAH ' + eyeHt + 'ft)', X(rangeNM) + 4, Y(eyeStartAlt) - 2);

      // ── Pilot Eye × PAPI Corridor 交差点マーカー ──
      // ILS追従Eye PathがPAPIコリドー境界（papiAngles[1]=B', papiAngles[2]=C'）を横切る地点
      if (ilsPresent && tch) {
        const tanA = Math.tan(angle * Math.PI / 180);
        const crossDefs = [
          { a: papiAngles[1], color: '#ffd740', label0: '3W1R', label1: '2W2R' },
          { a: papiAngles[2], color: '#ef9a9a', label0: '2W2R', label1: '1W3R' },
        ];
        crossDefs.forEach(({ a, color, label0, label1 }) => {
          const tanPapi = Math.tan(a * Math.PI / 180);
          const denom   = FT_PER_NM * (tanPapi - tanA);
          if (Math.abs(denom) < 1e-9) return;
          const dNM = (tch + eyeHt - papiFt * tanPapi) / denom;
          if (dNM < -rwyExtNM || dNM > rangeNM) return;
          const eyeAltCross = thElev + tch + eyeHt + dNM * FT_PER_NM * tanA;
          const xCross = X(dNM);
          const yCross = Y(eyeAltCross);
          if (yCross < pad.t || yCross > pad.t + plotH) return;

          // ひし形マーカー
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(xCross,     yCross - 7);
          ctx.lineTo(xCross + 5, yCross);
          ctx.lineTo(xCross,     yCross + 7);
          ctx.lineTo(xCross - 5, yCross);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#000'; ctx.lineWidth = 0.5;
          ctx.stroke();

          // ラベル配置: TH通過後→滑走路帯の下へ / アプローチ側→ダイヤ左横
          const isPastTH = dNM < 0;
          const dFt      = Math.round(Math.abs(dNM) * FT_PER_NM);
          const dSign    = isPastTH ? '−' : '';
          ctx.fillStyle = color;
          ctx.font      = 'bold 8px sans-serif';
          if (isPastTH) {
            // 縦リーダー線（ダイヤ→滑走路面）
            ctx.strokeStyle = color; ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]);
            ctx.beginPath(); ctx.moveTo(xCross, yCross + 8); ctx.lineTo(xCross, yRwy - 6); ctx.stroke();
            ctx.setLineDash([]);
            // テキストを滑走路帯の下に配置
            ctx.textAlign = 'left';
            ctx.fillText(label0 + ' ↔ ' + label1,           xCross + 3, yRwy + 14);
            ctx.fillText(dSign + dFt + 'ft from TH',         xCross + 3, yRwy + 24);
            ctx.fillText(Math.round(eyeAltCross) + 'ft MSL', xCross + 3, yRwy + 34);
          } else {
            ctx.textAlign = 'right';
            ctx.fillText(label0 + ' ↔ ' + label1,           xCross - 8, yCross - 7);
            ctx.fillText(dSign + dFt + 'ft from TH',         xCross - 8, yCross + 2);
            ctx.fillText(Math.round(eyeAltCross) + 'ft MSL', xCross - 8, yCross + 11);
          }
        });
      }
    }

    // [3] Baro VNAV 温度補正パス（OAT が ISA から ±0.5°C 以上ズレている場合のみ）
    if (Math.abs(oatDev) > 0.5) {
      const corrAltAt = dNM => thElev + (altAt(dNM, aimFt, angle) - thElev) * tempFactor;
      ctx.strokeStyle = oatDev < 0 ? 'rgba(255,160,64,0.65)' : 'rgba(144,238,144,0.65)';
      ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
      ctx.lineWidth = 2.2; // 1pt 太く
      ctx.setLineDash([]); // 実線
      ctx.beginPath();
      ctx.moveTo(X(rangeNM), Y(corrAltAt(rangeNM)));
      ctx.lineTo(Math.min(X(0) + aimFt * pxPerFt, W - 3), yRwy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = oatDev < 0 ? '#ffa040' : '#90ee90';
      ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('実高度(OAT' + oat + '°C)',
        X(rangeNM) + 4, Y(corrAltAt(rangeNM)) + 3);
    }

    // GP メイン線 削除（ILSアンテナパス＋Pilot Eye で代替）

    // [5] SINK RATE ライン
    const tanAngle   = Math.tan(angle * Math.PI / 180);
    const distToTH   = 100 / tanAngle - visualAimFt;
    const totalHoriz = distToTH + stdAimFt;
    const effAngle   = Math.atan(100 / Math.max(totalHoriz, 1)) * 180 / Math.PI;
    const sinkRate   = aspd * 101.27 * Math.tan(effAngle * Math.PI / 180);
    const sinkWarn   = sinkRate > 1000;

    // 100ft AGL ライン削除（sink rate計算値は情報パネルで引き続き使用）

    // Visual Aim 1914ft 削除（概念が不正確なため。GS Follow Aim=1515ft / PAPI Eye Aim=papiFt で代替）

    // ===== 滑走路断面イラスト =====
    const rwBH = 9;  // runway band height (px)

    // アプローチ側 参照線
    ctx.strokeStyle = '#37474f'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, yRwy); ctx.lineTo(X(0), yRwy); ctx.stroke();

    // 滑走路面（TH から右方向へ）
    const rwGrad = ctx.createLinearGradient(X(0), 0, W, 0);
    rwGrad.addColorStop(0, '#546e7a'); rwGrad.addColorStop(1, '#263238');
    ctx.fillStyle = rwGrad;
    ctx.fillRect(X(0), yRwy - rwBH / 2, W - X(0), rwBH);
    ctx.strokeStyle = '#607d8b'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(X(0), yRwy - rwBH / 2); ctx.lineTo(W, yRwy - rwBH / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0), yRwy + rwBH / 2); ctx.lineTo(W, yRwy + rwBH / 2); ctx.stroke();

    // TH マーカー（白縦線）
    ctx.strokeStyle = '#eceff1'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(0), yRwy - rwBH - 4); ctx.lineTo(X(0), yRwy + rwBH + 4); ctx.stroke();
    ctx.fillStyle = '#eceff1'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('TH Height  ' + thElev + ' ft', X(0) - 3, yRwy - rwBH - 5);

    // 滑走路上の主要位置マーカー
    const rwMarker = (ft, color, topLabel, botLabel) => {
      const xm = X(0) + ft * pxPerFt;
      if (xm >= W - 3) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(xm, yRwy - rwBH - 2); ctx.lineTo(xm, yRwy + rwBH + 2); ctx.stroke();
      ctx.fillStyle = color; ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
      if (topLabel) ctx.fillText(topLabel, xm + 2, yRwy - rwBH - 4);
      if (botLabel) ctx.fillText(botLabel, xm + 2, yRwy + rwBH + 11);
    };
    // GS Ant マーカー（ILSある場合のみ）
    if (ilsPresent) {
      rwMarker(gsAntFt, '#69f0ae', 'GS Ant  ' + Math.round(gsAntFt) + 'ft', null);
    }
    // GS Follow Aim マーカー（ILSある場合のみ）
    if (ilsPresent) {
      rwMarker(aimFt,   '#4fc3f7', null,  'GS Follow Aim  ' + Math.round(aimFt) + ' ft from TH');
    }
    rwMarker(papiFt,  '#e040fb', 'PAPI Eye Aim  ' + Math.round(papiFt) + ' ft from TH', null);

    // GP 接地点ドット 削除

    // [1] 滑走路勾配ライン（TH から滑走路内方向へ延長）
    if (Math.abs(slope) > 0.05) {
      const pxPerFt   = plotW / (rangeNM * FT_PER_NM);
      const maxDispFt = Math.min(getRwyLengthFt(), (pad.r - 12) / pxPerFt);
      const xEnd      = X(0) + maxDispFt * pxPerFt;
      const altEnd    = thElev + maxDispFt * slope / 100;
      ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(X(0), Y(thElev)); ctx.lineTo(xEnd, Y(altEnd)); ctx.stroke();
      ctx.fillStyle = '#a1887f'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText((slope >= 0 ? '+' : '') + slope.toFixed(1) + '%',
        X(0) + 4, slope < 0 ? Y(thElev) + 13 : Y(thElev) - 5);
    }

    // LDA進入の場合、pilot eye pathを1W3Rゾーン中心（papiAngles[2]〜[3]の中点）に設定
    const isLDA = !!(rwy && rwy.ils && rwy.ils.approachType === 'LDA');
    const ldaAngle  = isLDA ? (papiAngles[2] + papiAngles[3]) / 2 : angle;
    // ILSあり: altAt(d, pilotEyeAimFt, angle) が描画Pilot Eye線と一致するよう (tch+EAH)/tan(angle) を使用
    // ILSなし: GS Follow Aim (aimFt) をそのまま使用
    const pilotEyeAimFt = (ilsPresent && tch)
      ? (tch + eyeHt) / Math.tan(angle * Math.PI / 180)
      : aimFt;
    const ldaAimFt  = isLDA ? papiFt : pilotEyeAimFt;
    drawPapiLights(ctx, X, Y, altAt, ldaAimFt, ldaAngle, papiFt, papiAngles, rangeNM, rwyExtNM);

    // 情報パネル
    const thCross = altAt(0, aimFt, angle) - thElev;
    // [4] 速度別降下率テーブル
    const speeds = [140, 160, aspd, 180, 200];
    const uniqueSpeeds = [...new Set(speeds)].sort((a,b) => a-b);
    const srRows = uniqueSpeeds.map(v => {
      const sr = Math.round(v * 101.27 * tanAngle);
      const isCurrent = v === aspd;
      const warn = sr > 1000;
      return `<span style="${isCurrent ? 'font-weight:bold;color:#fff' : ''}">${v}kt: <span style="color:${warn ? '#ef9a9a' : '#a5d6a7'}">${sr} fpm</span></span>`;
    });

    el('papi-info').innerHTML =
      '<b>GP ' + angle.toFixed(2) + '°</b>　TH通過高: <b>' + thCross.toFixed(0) + ' ft AGL</b><br>' +
      '1NM: ' + altAt(1, aimFt, angle).toFixed(0) + ' ft MSL<br>' +
      '<hr style="border-color:#1a4a7a;margin:4px 0">' +
      '<span style="color:#00bcd4"><b>' + (ilsPresent ? 'Pilot Eye Path（' + acType + '）' : 'PAPI Follow Aim') + '</b></span><br>' +
      (ilsPresent ? 'EAH: <b>' + eyeHt + ' ft</b><br>' +
      '<span style="color:#4fc3f7">GS Follow Aim = GS Ant + EAH/tan(' + angle.toFixed(2) + '°)</span><br>' +
      '= ' + Math.round(gsAntFt) + 'ft + ' + Math.round(eyeHt / Math.tan(angle * Math.PI / 180)) + 'ft = <b>' + Math.round(aimFt) + 'ft</b><br>' :
      'PAPI Follow Aim = <b style="color:#4fc3f7">' + Math.round(papiFt) + ' ft</b><br>') +
      '<hr style="border-color:#1a4a7a;margin:4px 0">' +
      '<span style="color:#ff9800"><b>Aiming Point（' + standardMode.toUpperCase() + '）</b></span><br>' +
      Math.round(stdAimFt) + ' 〜 ' + Math.round(stripeEndFt) + ' ft from TH<br>' +
      '<hr style="border-color:#1a4a7a;margin:4px 0">' +
      '<span style="color:' + (sinkWarn ? '#ef5350' : '#a5d6a7') + '"><b>SINK RATE 検証</b></span><br>' +
      '100ft AGL 実効角: <b>' + effAngle.toFixed(2) + '°</b><br>' +
      '降下率 @ ' + aspd + 'kt: <b style="color:' + (sinkWarn ? '#ef5350' : '#a5d6a7') + '">' + Math.round(sinkRate) + ' fpm</b>' +
      (sinkWarn ? '　<b style="color:#ef5350">⚠ SINK RATE</b>' : '　✓ OK') + '<br>' +
      '<hr style="border-color:#1a4a7a;margin:4px 0">' +
      '<b style="color:#cfd8dc">[4] 速度別降下率 @ ' + angle.toFixed(2) + '°</b><br>' +
      srRows.join('<br>') + '<br>' +
      '<hr style="border-color:#1a4a7a;margin:4px 0">' +
      'PAPI: ' + papiAngles.map(a => a.toFixed(2)).join(' / ') + '°<br>' +
      '<span style="color:#90a4ae">白白白白=高 / 赤赤赤赤=低 / 白白赤赤=On Path</span><br>' +
      (() => {
        // MEHT(PAPI) = papiFt × tan(M)  where M = B − 2'（AC 302-009 Figure 3）
        const B_deg    = papiAngles[2];
        const M_deg    = B_deg - (2 / 60);
        const mehtPapi = Math.round(papiFt * Math.tan(M_deg * Math.PI / 180) * 10) / 10;
        const tch_info = rwy?.ils?.tch;
        const mehtIls  = tch_info ? Math.round((tch_info + eyeHt) * 10) / 10 : null;
        return '<hr style="border-color:#1a4a7a;margin:4px 0">' +
          '<span style="color:#c6ff00"><b>MEHT 計算（PAPI視覚追従）</b></span><br>' +
          'B = <b>' + B_deg.toFixed(4) + '°</b>　（= ' + angle.toFixed(2) + '° − spread×0.5）<br>' +
          'M = B − 2\' = <b>' + M_deg.toFixed(4) + '°</b><br>' +
          'MEHT(PAPI) = ' + Math.round(papiFt) + ' × tan(B' + B_deg.toFixed(2) + '° − 2\'（0.033°）) = <b style="color:#c6ff00">' + mehtPapi + ' ft</b><br>' +
          (mehtIls ? '<span style="color:#00bcd4">MEHT(ILS) = TCH(' + tch_info + ') + EAH(' + eyeHt + ') = <b>' + mehtIls + ' ft</b></span><br>' : '');
      })() +
      '<hr style="border-color:#1a4a7a;margin:4px 0">' +
      '<span style="color:#a1887f"><b>[1] 滑走路勾配補正</b></span><br>' +
      '勾配: ' + (slope >= 0 ? '+' : '') + slope.toFixed(1) + '%　→　' +
      (slope >= 0 ? '+' : '') + slopeAngleDeg.toFixed(3) + '°<br>' +
      '対RWY実効GP角: <b>' + effGpAngle.toFixed(2) + '°</b>　（0%基準: ' + angle.toFixed(2) + '°）<br>' +
      '<hr style="border-color:#1a4a7a;margin:4px 0">' +
      '<span style="color:#ffb74d"><b>[3] 温度補正（Baro VNAV）</b></span><br>' +
      'OAT: <b>' + oat + '°C</b>　ISA@' + Math.round(thElev) + 'ft: ' + T_ISA.toFixed(1) + '°C<br>' +
      'ISA偏差: <b style="color:' + (Math.abs(oatDev) < 1 ? '#90a4ae' : oatDev < 0 ? '#ffa040' : '#90ee90') + '">' +
      (oatDev >= 0 ? '+' : '') + oatDev.toFixed(1) + '°C</b>' +
      (Math.abs(oatDev) > 0.5 ? '　<b style="color:' + (oatDev < 0 ? '#ffa040' : '#90ee90') + '">' +
      (oatDev < 0 ? '▼ 実高度 低め' : '▲ 実高度 高め') + '</b>' : '　（標準）') + '<br>' +
      '高度誤差 @TH:  <b>' + Math.round(thCross * (1 - tempFactor)) + 'ft</b>　' +
      '@1NM: <b>' + Math.round((altAt(1, aimFt, angle) - thElev) * (1 - tempFactor)) + 'ft</b>' +
      (() => {
        // ── 温度別 PAPI 指示テーブル ──
        const tempList = [-40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
        const papiStr = (gAngle) => {
          if (gAngle >= papiAngles[0]) return 'WWWW';
          if (gAngle >= papiAngles[1]) return 'WWWR';
          if (gAngle >= papiAngles[2]) return 'WWRR';
          if (gAngle >= papiAngles[3]) return 'WRRR';
          return 'RRRR';
        };
        const lightsHtml = (zone) => zone.split('').map(c =>
          '<span style="color:' + (c === 'W' ? '#ffffff' : '#ef5350') + ';font-size:13px;line-height:1">●</span>'
        ).join('');

        let h = '<hr style="border-color:#1a4a7a;margin:6px 0">';
        h += '<b style="color:#ff9800">VPA × 温度 → PAPI 指示表</b><br>';
        h += '<span style="font-size:9px;color:#607d8b">VPA ' + angle.toFixed(2) + '° Baro VNAV 飛行時、温度によりPAPIが変化</span><br>';
        h += '<table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:4px">';
        h += '<tr style="color:#78909c;border-bottom:1px solid #1a4a7a">';
        h += '<th style="text-align:left;padding:2px 3px">OAT</th>';
        h += '<th style="padding:2px;text-align:right">ΔT</th>';
        h += '<th style="padding:2px;text-align:right">幾何角</th>';
        h += '<th style="padding:2px">PAPI</th>';
        h += '</tr>';
        tempList.forEach(t => {
          const k = (273 + t) / (273 + T_ISA);
          const geomAngle = Math.atan(k * Math.tan(angle * Math.PI / 180)) * 180 / Math.PI;
          const zone = papiStr(geomAngle);
          const deltaT = Math.round(t - T_ISA);
          const isCurrent = Math.abs(t - oat) < 6;
          const zoneColor = zone === 'WWRR' ? '#4caf50' :
                            (zone === 'WWWR' || zone === 'WRRR') ? '#ffd740' : '#ef5350';
          const dtColor = t < T_ISA - 1 ? '#ffa040' : t > T_ISA + 1 ? '#90ee90' : '#78909c';
          h += '<tr style="border-top:1px solid #0f2540' + (isCurrent ? ';background:rgba(255,152,0,0.15)' : '') + '">';
          h += '<td style="color:' + (isCurrent ? '#ff9800' : '#90a4ae') + ';padding:2px 3px;font-weight:' + (isCurrent ? 'bold' : 'normal') + '">' + t + '°C</td>';
          h += '<td style="color:' + dtColor + ';padding:2px;text-align:right">' + (deltaT >= 0 ? '+' : '') + deltaT + '°</td>';
          h += '<td style="color:' + zoneColor + ';padding:2px;text-align:right">' + geomAngle.toFixed(2) + '°</td>';
          h += '<td style="padding:2px">' + lightsHtml(zone) + '</td>';
          h += '</tr>';
        });
        h += '</table>';
        h += '<div style="font-size:9px;color:#546e7a;margin-top:3px">';
        h += '寒冷時: Baro VNAV では実際の幾何角が低くなる → PAPIは低め指示<br>';
        // 何°Cで WRRR になるか計算
        const findCriticalTemp = (targetZoneIdx) => {
          for (let t = 40; t >= -60; t -= 0.5) {
            const k = (273 + t) / (273 + T_ISA);
            const ga = Math.atan(k * Math.tan(angle * Math.PI / 180)) * 180 / Math.PI;
            if (ga < papiAngles[targetZoneIdx]) return t;
          }
          return null;
        };
        const critWRRR = findCriticalTemp(2); // below papiAngles[2] → WRRR
        const critRRRR = findCriticalTemp(3); // below papiAngles[3] → RRRR
        if (critWRRR !== null) h += 'WRRR (Callout): OAT ≦ ' + critWRRR.toFixed(0) + '°C<br>';
        if (critRRRR !== null) h += 'RRRR (Too Low): OAT ≦ ' + critRRRR.toFixed(0) + '°C';
        h += '</div>';
        return h;
      })();

    // GS/PAPI スライダー変更時もマーカーを更新
    updateSatMarkers();

    // IAN Approach（ILSなし）セクション更新
    if (!ilsPresent) {
      updateIanApproachInfo(angle, eyeHt, oat);
    } else {
      el('ian-approach-section').style.display = 'none';
    }
  }

  // ===== IAN Approach（TCH 50ft、温度補正）情報表示 =====
  function updateIanApproachInfo(angle, eyeHt, oat) {
    const section = el('ian-approach-section');
    const info = el('ian-vpa-info');
    if (!section || !info) return;

    section.style.display = 'block';

    const T_ISA = 15; // ISA at sea level
    const tch = 50; // TCH fixed at 50ft for IAN Approach
    const baseVPA = 3.0; // Base VPA angle

    // Temperature correction: ±0.12°VPA per ±10°C from ISA
    const tempDelta = oat - T_ISA;
    const vpaCorrection = (tempDelta / 10) * 0.12;
    const effectiveVPA = baseVPA + vpaCorrection;

    // Standard temperatures for verification
    const tempPoints = [
      { t: 30, label: '+30°C (ISA +15°C)', color: '#ef5350' },
      { t: 15, label: '+15°C (ISA)', color: '#4caf50' },
      { t: 0, label: '0°C (ISA −15°C)', color: '#2196f3' },
      { t: -31, label: '−31°C (ISA −46°C)', color: '#1565c0' }
    ];

    // Calculate VPA and PAPI for each temperature
    const tempTable = tempPoints.map(tp => {
      const vpaAtT = baseVPA + ((tp.t - T_ISA) / 10) * 0.12;

      // PAPI angles at this VPA (±0.5° spread)
      const papi1 = vpaAtT + 0.75; // White
      const papi2 = vpaAtT + 0.25; // White
      const papi3 = vpaAtT - 0.25; // Red
      const papi4 = vpaAtT - 0.75; // Red (Too Low)

      // Determine PAPI display at current altitude/position
      // Simplification: show at threshold crossing (50ft)
      const papiDisplay = (vpaAtT > papi2 && vpaAtT <= papi1) ? 'WWRR' :
                          (vpaAtT > papi3 && vpaAtT <= papi2) ? 'WRRR' :
                          (vpaAtT > papi4 && vpaAtT <= papi3) ? 'RRRR' : '?';

      return {
        temp: tp.t,
        label: tp.label,
        color: tp.color,
        vpa: vpaAtT.toFixed(2),
        papi: papiDisplay,
        angles: [papi1.toFixed(2), papi2.toFixed(2), papi3.toFixed(2), papi4.toFixed(2)]
      };
    });

    // Build HTML
    let html = '<div style="margin-bottom:4px">TCH: <b>50ft</b> | Base VPA: <b>3.0°</b> | 補正係数: <b>±0.12°/±10°C</b></div>';
    html += '<div style="background:rgba(0,0,0,0.5);padding:6px;border-radius:3px;font-size:10px;">';
    html += '<div style="margin-bottom:4px"><b>現在設定 OAT: ' + oat.toFixed(1) + '°C → VPA <span style="color:#ffeb3b">' + effectiveVPA.toFixed(2) + '°</span></b></div>';
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<tr style="border-bottom:1px solid #37474f;"><th style="text-align:left;padding:2px">温度</th><th>VPA</th><th>PAPI</th></tr>';

    tempTable.forEach(row => {
      html += '<tr style="border-bottom:1px solid #263238;color:' + row.color + '">';
      html += '<td style="padding:2px">' + row.label + '</td>';
      html += '<td style="text-align:center"><b>' + row.vpa + '°</b></td>';
      html += '<td style="text-align:center;font-weight:bold;letter-spacing:2px">' + row.papi + '</td>';
      html += '</tr>';
    });

    html += '</table></div>';
    html += '<div style="margin-top:4px;font-size:9px;color:#90a4ae">白白赤赤 = On Path (GP) | 白白白白 = High | 赤赤赤赤 = Low | WWRR/WRRRPAPI段階</div>';

    info.innerHTML = html;
  }

  function drawPapiLights(ctx, X, Y, altAt, aimFt, angle, papiFt, papiAngles, rangeNM, rwyExtNM) {
    const step = rangeNM / 6;

    // 角丸矩形ヘルパー（古いSafari対応: ctx.roundRect が無い環境でも動作）
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const drawDot = (d) => {
      const acAlt = altAt(d, aimFt, angle);
      const cx = X(d), cyTop = Y(acAlt) - 22;
      // 近THR（ラベル密集域）ではドット列の背後に暗色プレートを敷き、
      // 文字（MEHT/TCH/GS Ant/PAPI等）に埋もれず PAPI 灯列が読めるようにする
      if (d < 0.42) {
        ctx.save();
        ctx.fillStyle = 'rgba(3,9,18,0.80)';
        ctx.strokeStyle = 'rgba(130,150,170,0.55)';
        ctx.lineWidth = 0.8;
        roundRect(cx - 7, cyTop - 6, 14, 3 * 11 + 12, 4);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      papiAngles.forEach((pa, i) => {
        const white = acAlt >= altAt(d, papiFt, pa);
        const cy = cyTop + i * 11;
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = white ? '#fff' : '#e53935';
        ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = '#b71c1c'; ctx.stroke();
      });
    };

    // ── アプローチ側（TH前）──
    for (let d = step; d <= rangeNM - step / 2; d += step) drawDot(d);

    // ── THR（d=0）には必ず PAPI 灯列を描く ──
    // ILSなし滑走路（機体がPAPI中心線に完全一致）でも THR 位置の指示が出るようにする
    drawDot(0);

    // ── 滑走路内（TH後）: アプローチ側と同じ step 間隔で連続表示 ──
    if (!rwyExtNM || rwyExtNM <= 0) return;
    for (let d = -step; d >= -rwyExtNM; d -= step) drawDot(d);
  }

  // ===== [5] 滑走路 基準点図（平面図） =====
  function drawRunwayDiagram() {
    const canvas = el('runway-canvas');

    // 空港別 Aiming Point 方式の自動選択
    const { apCode } = currentApRw();
    const japanAps = ['RJAA', 'RJTT', 'RJGG', 'RJFR'];
    const faaAps = ['PANC', 'KLAX'];
    if (japanAps.includes(apCode)) {
      standardMode = 'jp';
    } else if (faaAps.includes(apCode)) {
      standardMode = 'faa';
    } else {
      standardMode = 'icao';
    }

    if (!canvas || el('papi-view').style.display === 'none') return;

    const angle   = parseFloat(el('papi-angle').value);
    const aimFt   = parseFloat(el('papi-aim').value);
    const papiFt  = parseFloat(el('papi-loc').value);
    const gsAntFt = parseFloat(el('papi-gsant').value);
    const acType  = el('papi-aircraft') ? el('papi-aircraft').value : 'B747-8F';
    const eyeHt   = (AIRCRAFT_DATA[acType] || AIRCRAFT_DATA['B747-8F']).eyeHt;
    const stdAimFt    = getStandardAimFt();
    const stripeLenFt = getStripeLenFt();
    const stripeEndFt = stdAimFt + stripeLenFt;
    const visualAimFt = aimFt + eyeHt / Math.tan(angle * Math.PI / 180);

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.clientWidth;
    const H   = canvas.clientHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const maxFt  = Math.max(visualAimFt, stripeEndFt, papiFt) * 1.15;
    const pad    = { l: 10, r: 10, t: 28, b: 22 };
    const plotW  = W - pad.l - pad.r;
    const rwyY   = pad.t + (H - pad.t - pad.b) / 2;
    const rwyH   = 14;

    const Xft = ft => pad.l + (ft / maxFt) * plotW;

    // 滑走路（TH から右方向）
    ctx.fillStyle = '#37474f';
    ctx.fillRect(Xft(0), rwyY - rwyH / 2, plotW, rwyH);

    // Aiming Point Marking（オレンジ帯）
    ctx.fillStyle = 'rgba(255,152,0,0.5)';
    ctx.fillRect(Xft(stdAimFt), rwyY - rwyH / 2, Xft(stripeEndFt) - Xft(stdAimFt), rwyH);
    // Aiming Point Marking 補助線（各方式別）
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    if (standardMode === 'jp') {
      // 日本方式: 1312ft / 1509ft
      ctx.beginPath();
      ctx.moveTo(Xft(1312), rwyY - rwyH / 2 - 8);
      ctx.lineTo(Xft(1312), rwyY + rwyH / 2 + 8);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(Xft(1509), rwyY - rwyH / 2 - 8);
      ctx.lineTo(Xft(1509), rwyY + rwyH / 2 + 8);
      ctx.stroke();
    } else if (standardMode === 'faa') {
      // FAA方式: 1000ft / 1150ft / 1575ft
      ctx.beginPath();
      ctx.moveTo(Xft(1000), rwyY - rwyH / 2 - 8);
      ctx.lineTo(Xft(1000), rwyY + rwyH / 2 + 8);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(Xft(1150), rwyY - rwyH / 2 - 8);
      ctx.lineTo(Xft(1150), rwyY + rwyH / 2 + 8);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(Xft(1575), rwyY - rwyH / 2 - 8);
      ctx.lineTo(Xft(1575), rwyY + rwyH / 2 + 8);
      ctx.stroke();
    } else if (standardMode === 'icao') {
      // ICAO方式: 1312ft / 1460ft (1312 + 148stripe)
      ctx.beginPath();
      ctx.moveTo(Xft(1312), rwyY - rwyH / 2 - 8);
      ctx.lineTo(Xft(1312), rwyY + rwyH / 2 + 8);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(Xft(1460), rwyY - rwyH / 2 - 8);
      ctx.lineTo(Xft(1460), rwyY + rwyH / 2 + 8);
      ctx.stroke();
    } else {
      // PAPI のみ（ILS なし）: papiFt に補助線を表示
      ctx.beginPath();
      ctx.moveTo(Xft(papiFt), rwyY - rwyH / 2 - 8);
      ctx.lineTo(Xft(papiFt), rwyY + rwyH / 2 + 8);
      ctx.stroke();
    }


    // ── マーカー描画ヘルパー ──
    function marker(ft, color, label, sub, above) {
      const x = Xft(ft);
      const y1 = above ? rwyY - rwyH / 2 - 2 : rwyY + rwyH / 2 + 2;
      const y2 = above ? rwyY - rwyH / 2 - 14 : rwyY + rwyH / 2 + 14;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, rwyY - rwyH / 2); ctx.lineTo(x, rwyY + rwyH / 2); ctx.stroke();
      ctx.fillStyle = color; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, x, above ? rwyY - rwyH / 2 - 4 : rwyY + rwyH / 2 + 11);
      if (sub) {
        ctx.font = '8px sans-serif'; ctx.fillStyle = '#90a4ae';
        ctx.fillText(sub, x, above ? rwyY - rwyH / 2 - 14 : rwyY + rwyH / 2 + 21);
      }
    }

    // TH
    ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(Xft(0), rwyY - rwyH / 2 - 2); ctx.lineTo(Xft(0), rwyY + rwyH / 2 + 2); ctx.stroke();
    ctx.fillStyle = '#cfd8dc'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('TH', Xft(0), rwyY - rwyH / 2 - 4);

    // GS Ant（緑・上）
    marker(gsAntFt, '#69f0ae', 'GS Ant', Math.round(gsAntFt) + 'ft', true);
    // GS Follow Aim（青・下）
    marker(aimFt, '#4fc3f7', 'GS Aim', Math.round(aimFt) + 'ft', false);
    // PAPI Eye Aim（黄・上）
    marker(papiFt, '#ffcc02', 'PAPI Eye', Math.round(papiFt) + 'ft', true);

    // Aiming Pt ラベル
    const midXAim = (Xft(stdAimFt) + Xft(stripeEndFt)) / 2;
    ctx.fillStyle = '#ff9800'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(standardMode.toUpperCase(), midXAim, rwyY + 5);

    // 距離スケール
    ctx.fillStyle = '#546e7a'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('0', Xft(0), H - 4);
    ctx.fillText(Math.round(maxFt / 2) + 'ft', Xft(maxFt / 2), H - 4);
    ctx.fillText(Math.round(maxFt) + 'ft', Xft(maxFt), H - 4);
    // 矢印（進入方向）
    ctx.fillStyle = '#546e7a'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('← 進入', Xft(0) - 2, rwyY + 4);
  }

  // ===== 衛星画像サムネイル =====
  // 衛星画像のbbox（マーカー座標計算用に保持）
  let _satBbox = { minLon: 0, maxLon: 1, minLat: 0, maxLat: 1 };

  // Landing Threshold 座標を返す（displaced threshold 考慮）
  function landingThreshold(rwy) {
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

  function updateSatelliteImage() {
    const rwy = currentRwy();
    const img = el('papi-sat-img');
    const lbl = el('papi-sat-overlay') ? el('papi-sat-overlay').querySelector('.papi-sat-label') : null;
    if (!img || !rwy) return;

    const { apCode, rwCode } = currentApRw();
    const { lat: thLat, lon: thLon, hdgRad, cosLat } = landingThreshold(rwy);

    // Landing TH から 580m（約1900ft）を表示 ±110m 垂直パッド、前方 30m バッファ
    const distFwdM  = 580;
    const padPerpM  = 110;
    const padAlongM = 30;
    const perpRad   = hdgRad + Math.PI / 2;

    const endLat = thLat + distFwdM * Math.cos(hdgRad) / 111000;
    const endLon = thLon + distFwdM * Math.sin(hdgRad) / (111000 * cosLat);

    const corners = [
      [thLat  - padAlongM * Math.cos(hdgRad) / 111000 + padPerpM * Math.cos(perpRad) / 111000,
       thLon  - padAlongM * Math.sin(hdgRad) / (111000 * cosLat) + padPerpM * Math.sin(perpRad) / (111000 * cosLat)],
      [thLat  - padAlongM * Math.cos(hdgRad) / 111000 - padPerpM * Math.cos(perpRad) / 111000,
       thLon  - padAlongM * Math.sin(hdgRad) / (111000 * cosLat) - padPerpM * Math.sin(perpRad) / (111000 * cosLat)],
      [endLat + padAlongM * Math.cos(hdgRad) / 111000 + padPerpM * Math.cos(perpRad) / 111000,
       endLon + padAlongM * Math.sin(hdgRad) / (111000 * cosLat) + padPerpM * Math.sin(perpRad) / (111000 * cosLat)],
      [endLat + padAlongM * Math.cos(hdgRad) / 111000 - padPerpM * Math.cos(perpRad) / 111000,
       endLon + padAlongM * Math.sin(hdgRad) / (111000 * cosLat) - padPerpM * Math.sin(perpRad) / (111000 * cosLat)],
    ];

    let minLat = Math.min(...corners.map(c => c[0]));
    let maxLat = Math.max(...corners.map(c => c[0]));
    let minLon = Math.min(...corners.map(c => c[1]));
    let maxLon = Math.max(...corners.map(c => c[1]));

    // ArcGIS export は画像サイズ(480×360=4:3)に合わせて bbox を内部拡張するため、
    // 要求 bbox と実画像範囲がズレてマーカーが滑走路から外れる。
    // あらかじめ度数アスペクトを 4:3 に補正して要求＝実画像範囲を一致させる
    {
      const target = 480 / 360;               // 経度span / 緯度span（度数）
      const cLat = (minLat + maxLat) / 2, cLon = (minLon + maxLon) / 2;
      let dLat = maxLat - minLat, dLon = maxLon - minLon;
      if (dLon / dLat < target) dLon = dLat * target;
      else dLat = dLon / target;
      minLat = cLat - dLat / 2; maxLat = cLat + dLat / 2;
      minLon = cLon - dLon / 2; maxLon = cLon + dLon / 2;
    }

    _satBbox = { minLon, maxLon, minLat, maxLat };

    const bbox = [minLon.toFixed(6), minLat.toFixed(6), maxLon.toFixed(6), maxLat.toFixed(6)].join(',');
    img.src = `https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=480,360&format=png&f=image`;
    img.onerror = () => { if (lbl) lbl.textContent = 'Satellite unavailable'; };
    if (lbl) lbl.textContent = `${apCode} RWY${rwCode}  Landing TH – 1900ft`;

    updateSatMarkers();
  }

  function updateSatMarkers() {
    const rwy = currentRwy();
    const canvas = el('sat-mark-canvas');
    if (!canvas || !rwy) return;
    const { minLon, maxLon, minLat, maxLat } = _satBbox;
    if (maxLon === minLon || maxLat === minLat) return;

    const OW = 320, OH = 240;
    canvas.width  = OW;
    canvas.height = OH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, OW, OH);

    const toXY = (lat, lon) => ({
      x: (lon - minLon) / (maxLon - minLon) * OW,
      y: (maxLat - lat) / (maxLat - minLat) * OH,
    });

    const { lat: thLat, lon: thLon, hdgRad, cosLat } = landingThreshold(rwy);
    const perpRad = hdgRad + Math.PI / 2;

    const gsAntFt = parseFloat((el('papi-gsant') || {}).value) || 1115;
    const papiFt  = parseFloat((el('papi-loc')   || {}).value) || 1414;
    const gsM   = gsAntFt * 0.3048;
    const papiM = papiFt  * 0.3048;

    // 滑走路方向・垂直方向にオフセットした座標を返す
    const posAlong = (distM) => ({
      lat: thLat + distM * Math.cos(hdgRad) / 111000,
      lon: thLon + distM * Math.sin(hdgRad) / (111000 * cosLat),
    });
    const posPerp = (baseLat, baseLon, perpM) => ({
      lat: baseLat + perpM * Math.cos(perpRad) / 111000,
      lon: baseLon + perpM * Math.sin(perpRad) / (111000 * cosLat),
    });

    // ── 中心線（破線） ──
    const clStart = posAlong(-25);
    const clEnd   = posAlong(600);
    const s = toXY(clStart.lat, clStart.lon);
    const e = toXY(clEnd.lat, clEnd.lon);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    ctx.setLineDash([]);

    // ── TH クロスバー（ピアノ線を模した横線、進入側） ──
    const thPx = toXY(thLat, thLon);
    const thL  = toXY(...Object.values(posPerp(thLat, thLon, -28)));
    const thR  = toXY(...Object.values(posPerp(thLat, thLon,  28)));
    // ちょうどTH上
    ctx.strokeStyle = '#eceff1';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(thL.x, thL.y); ctx.lineTo(thR.x, thR.y); ctx.stroke();
    // 進入側（手前）に "TH" ラベル
    const thLblPos = posAlong(-14);
    const thLbl = toXY(thLblPos.lat, thLblPos.lon);
    ctx.fillStyle = '#eceff1';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
    ctx.fillText('TH', thLbl.x, thLbl.y);
    ctx.shadowBlur = 0;

    // ── マーカー描画ヘルパー（中心線上のドット＋ラベル） ──
    function markOnCL(distM, color, label, sideM) {
      const pos  = posAlong(distM);
      const dot  = toXY(pos.lat, pos.lon);
      // ドット（中心線上）
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(dot.x, dot.y, 4, 0, Math.PI * 2); ctx.fill();
      // ラベル（垂直方向にオフセット）
      const lblPos = posPerp(pos.lat, pos.lon, sideM);
      const lbl = toXY(lblPos.lat, lblPos.lon);
      ctx.fillStyle = color;
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
      ctx.fillText(label, lbl.x, lbl.y);
      ctx.shadowBlur = 0;
    }

    markOnCL(gsM,   '#69f0ae', 'GS Ant', -32);  // 左側ラベル
    markOnCL(papiM, '#e040fb', 'PAPI',    32);
  // 右側ラベル
  }

  // ===== ILS データ自動反映 =====
  function setSlider(id, val) {
    const inp = el(id);
    if (!inp) return;
    inp.value = val;
    // バッジ表示も更新
    const suffixMap = { 'papi-angle': '°', 'papi-aim': 'ft', 'papi-loc': 'ft',
                        'papi-gsant': 'ft', 'papi-spread': '°', 'papi-aspd': 'kt',
                        'papi-range': '', 'papi-slope': '%', 'papi-oat': '°C' };
    const preMap    = { 'papi-spread': '±' };
    const disp = el(id + '-val');
    if (disp) disp.textContent = (preMap[id] || '') + val + (suffixMap[id] || '');
  }

  // GS Follow Aim = GS Ant + EAH/tan(angle)  ← +400ftの由来
  function calcGsFollowAim(gsAntFt, eyeHt, angleDeg) {
    return Math.round((gsAntFt + eyeHt / Math.tan(angleDeg * Math.PI / 180)) / 5) * 5;
  }

  function loadIlsDefaults() {
    const rwy = currentRwy();
    if (!rwy) return;

    if (rwy.ils) {
      // ---- ILS ある場合 ----
      const ils    = rwy.ils;
      const angle  = ils.gpAngle || 3.0;
      const acType = el('papi-aircraft') ? el('papi-aircraft').value : 'B747-8F';
      const eyeHt  = (AIRCRAFT_DATA[acType] || AIRCRAFT_DATA['B747-8F']).eyeHt;
      // GS Follow Aim を EAH・角度から自動計算
      const aimFt  = calcGsFollowAim(ils.gsAntFt, eyeHt, angle);

      setSlider('papi-angle',  angle.toFixed(2));
      setSlider('papi-ref-angle', (ils.papiAngle || 3.0).toFixed(2));
      setSlider('papi-aim',    aimFt);
      setSlider('papi-loc',    ils.papiFt || 1312);
      setSlider('papi-gsant',  ils.gsAntFt);

      // ILS あり をデフォルトに
      const ilsBtn = el('papi-ils-btn');
      const noilsBtn = el('papi-noils-btn');
      if (ilsBtn) ilsBtn.classList.add('std-active');
      if (noilsBtn) noilsBtn.classList.remove('std-active');
    } else {
      // ---- ILS なし場合（PAPI のみ）----
      // Pilot Eye Aiming = PAPI設置位置
      const papiFt = rwy.papi?.papiFt || 1227;  // デフォルト値（MEHT計算値）
      const angle  = 3.0;  // FAA標準

      setSlider('papi-angle',  angle.toFixed(2));
      setSlider('papi-ref-angle', ((rwy.papi && rwy.papi.papiAngle) || 3.0).toFixed(2));
      setSlider('papi-aim',    papiFt);  // ⭐ aimFt = papiFt
      setSlider('papi-loc',    papiFt);
      // gsAntFt はセット不要（ILSなしなので表示されない）

      // ILS なし をデフォルトに
      const ilsBtn = el('papi-ils-btn');
      const noilsBtn = el('papi-noils-btn');
      if (ilsBtn) ilsBtn.classList.remove('std-active');
      if (noilsBtn) noilsBtn.classList.add('std-active');
    }
  }

  // ===== GS偏差 修正計算 =====
  function updateGsCorr() {
    const resultEl = el('gs-corr-result');
    if (!resultEl) return;
    const altInput = el('gs-corr-alt');
    const dotSel   = el('gs-corr-dot');
    if (!altInput || !dotSel) return;

    const currentAlt = parseFloat(altInput.value);
    const dots       = parseFloat(dotSel.value);
    const angle      = parseFloat((el('papi-angle') || {}).value) || 3.0;
    const aspd       = parseFloat((el('papi-aspd')  || {}).value) || 165;
    const rwy        = currentRwy();
    const thElev     = rwy ? (rwy.tdze || 0) : 0;

    if (isNaN(currentAlt) || isNaN(dots)) return;
    const agl     = Math.max(0, currentAlt - thElev);
    const angleRad = angle * Math.PI / 180;
    // GS上での水平距離(ft) → 1dot(0.36°)当たりの高度偏差(ft)
    const distFt   = agl / Math.tan(angleRad);
    const devFt    = Math.round(Math.abs(dots) * distFt * Math.tan(0.36 * Math.PI / 180));
    // 通常降下率: 精算 + 概算 (Speed×5+50 = "Speed÷2を百の位として+50")
    const precRate  = Math.round(aspd * 6076 / 60 * Math.tan(angleRad));
    const approxRate = Math.round(aspd * 5 + 50);

    let html = '';
    if (dots === 0) {
      html += `<span style="color:#4caf50;font-weight:bold">On GS ✓</span><br>`;
      html += `通常降下率: <b style="color:#80cbc4">${precRate} ft/min</b>`;
      html += ` <span style="color:#546e7a">（概算: ${approxRate}）</span><br>`;
      html += `<span style="color:#546e7a;font-size:10px">概算式: Speed×5+50 = ${aspd}×5+50</span>`;
    } else {
      const dir    = dots > 0 ? '高い' : '低い';
      const dotClr = dots > 0 ? '#ff8f00' : '#4fc3f7';
      const sign   = dots > 0 ? '+' : '';
      html += `<span style="color:${dotClr};font-weight:bold">${sign}${dots}dot 偏差</span>`;
      html += ` → <b style="color:${dotClr}">${devFt} ft ${dir}</b>`;
      html += ` <span style="color:#546e7a">（対地 ${Math.round(agl)} ft）</span><br>`;
      html += `通常降下率: <b style="color:#80cbc4">${precRate} ft/min</b>`;
      html += ` <span style="color:#546e7a">（概算: ${approxRate}）</span><br>`;
      if (dots > 0) {
        // 上ズレ → 降下率を深める
        const rate30 = precRate + devFt * 2;
        const rate60 = precRate + devFt;
        html += `<span style="color:#ef5350;font-weight:bold">▼ 降下率を深める</span><br>`;
        html += `　<b>30秒修正:</b> <b style="color:#ef5350">${rate30} ft/min</b>`;
        html += ` <span style="color:#546e7a">(+${devFt * 2})</span><br>`;
        html += `　<b>1分修正:</b> <b style="color:#ff8f00">${rate60} ft/min</b>`;
        html += ` <span style="color:#546e7a">(+${devFt})</span>`;
      } else {
        // 下ズレ → 降下率を浅める
        const rate30 = Math.max(0, precRate - devFt * 2);
        const rate60 = Math.max(0, precRate - devFt);
        html += `<span style="color:#4fc3f7;font-weight:bold">▲ 降下率を浅める</span><br>`;
        html += `　<b>30秒修正:</b> <b style="color:#4fc3f7">${rate30} ft/min</b>`;
        html += ` <span style="color:#546e7a">(-${devFt * 2})</span><br>`;
        html += `　<b>1分修正:</b> <b style="color:#29b6f6">${rate60} ft/min</b>`;
        html += ` <span style="color:#546e7a">(-${devFt})</span>`;
      }
    }
    resultEl.innerHTML = html;
  }

  // ===== 初期化 =====
  window.addEventListener('load', () => {
    try {
      el('tab-papi').addEventListener('click',    () => showView('papi'));
      el('tab-circuit').addEventListener('click', () => showView('circuit'));
      if (el('tab-aim')) el('tab-aim').addEventListener('click', () => showView('aim'));
      if (el('tab-dev')) el('tab-dev').addEventListener('click', () => showView('dev'));
    } catch(e) {
      console.error('Tab event listener error:', e);
    }

    el('std-icao').addEventListener('click', () => {
      standardMode = 'icao';
      el('std-icao').classList.add('std-active'); el('std-faa').classList.remove('std-active');
      drawPapi(); drawRunwayDiagram(); updateBlindZoneInfo();
    });
    el('std-faa').addEventListener('click', () => {
      standardMode = 'faa';
      el('std-faa').classList.add('std-active'); el('std-icao').classList.remove('std-active');
      drawPapi(); drawRunwayDiagram(); updateBlindZoneInfo();
    });

    const acEl = el('papi-aircraft');
    if (acEl) acEl.addEventListener('change', () => {
      // 機種変更時: GS Follow Aim = GS Ant + EAH/tan(angle) を再計算
      const gsAntFt = parseFloat(el('papi-gsant').value) || 1115;
      const angle   = parseFloat(el('papi-angle').value)  || 3.0;
      const eyeHt   = (AIRCRAFT_DATA[acEl.value] || AIRCRAFT_DATA['B747-8F']).eyeHt;
      setSlider('papi-aim', calcGsFollowAim(gsAntFt, eyeHt, angle));
      drawPapi(); drawRunwayDiagram(); updateBlindZoneInfo();
    });

    [
      ['papi-angle',  'papi-angle-val',  '°',  ''],
      ['papi-aim',    'papi-aim-val',    'ft', ''],
      ['papi-loc',    'papi-loc-val',    'ft', ''],
      ['papi-ref-angle', 'papi-ref-angle-val', '°', ''],
      ['papi-spread', 'papi-spread-val', '°',  '±'],
      ['papi-gsant',  'papi-gsant-val',  'ft', ''],
      ['papi-aspd',   'papi-aspd-val',   'kt', ''],
      ['papi-range',  'papi-range-val',  '',   ''],
      ['papi-slope',  'papi-slope-val',  '%',  ''],
      ['papi-oat',    'papi-oat-val',    '°C', ''],
    ].forEach(([id, vid, suf, pre]) => {
      const inp = el(id), disp = el(vid);
      if (!inp || !disp) return;
      inp.addEventListener('input', () => {
        disp.textContent = pre + inp.value + suf;
        // 角度またはGSアンテナ位置変更時: GS Follow Aim を自動再計算
        if (id === 'papi-angle' || id === 'papi-gsant') {
          const acEl2  = el('papi-aircraft');
          const acType = acEl2 ? acEl2.value : 'B747-8F';
          const eyeHt  = (AIRCRAFT_DATA[acType] || AIRCRAFT_DATA['B747-8F']).eyeHt;
          const gsAnt  = parseFloat(el('papi-gsant').value) || 1115;
          const ang    = parseFloat(el('papi-angle').value)  || 3.0;
          setSlider('papi-aim', calcGsFollowAim(gsAnt, eyeHt, ang));
        }
        // 滑走路勾配変更時: Pitch/Flare補正値を更新
        if (id === 'rwy-slope') {
          updateRunwayGradient();
        }
        drawPapi(); drawRunwayDiagram(); updateBlindZoneInfo();
      });
    });

    el('papi-airport-sel').addEventListener('change', () => {
      updatePapiRunwayOptions();
      autoDetectIls();
      // 空港別デフォルト standard auto-select
      const apCode = el('papi-airport-sel').value;
      let btnToClick = null;
      if (apCode === 'ZSPD') {
        btnToClick = el('std-china');  // CHINA
      } else if (apCode === 'PANC' || apCode === 'KLAX' || apCode === 'KORD') {
        btnToClick = el('std-faa');    // FAA
      } else {
        btnToClick = el('std-icao');   // ICAO (default)
      }
      if (btnToClick) btnToClick.click();
      updatePapiRwyLabel(); loadIlsDefaults(); updateSatelliteImage(); drawPapi(); drawRunwayDiagram(); updateBlindZoneInfo();
      if (typeof window.syncAimTo === 'function')
        window.syncAimTo(el('papi-airport-sel').value, el('papi-runway-sel').value);
    });
    el('papi-runway-sel').addEventListener('change', () => {
      autoDetectIls();
      updatePapiRwyLabel(); loadIlsDefaults(); updateSatelliteImage(); drawPapi(); drawRunwayDiagram(); updateBlindZoneInfo();
      if (typeof window.syncAimTo === 'function')
        window.syncAimTo(null, el('papi-runway-sel').value);
    });

    const ilsBtn   = el('papi-ils-btn');
    const noIlsBtn = el('papi-noils-btn');
    if (ilsBtn)   ilsBtn.addEventListener('click',   () => { ilsPresent = true;  updateIlsButtons(); drawPapi(); drawRunwayDiagram(); updateBlindZoneInfo(); updateBlindZoneInfo(); });
    if (noIlsBtn) noIlsBtn.addEventListener('click', () => { ilsPresent = false; updateIlsButtons(); drawPapi(); drawRunwayDiagram(); updateBlindZoneInfo(); updateBlindZoneInfo(); });

    // GS デビエーションライン チェックボックス
    const gsDevChk = el('gs-dev-show');
    if (gsDevChk) gsDevChk.addEventListener('change', () => { drawPapi(); updateBlindZoneInfo(); });

    // GS 修正計算パネル
    const gsCorrAlt = el('gs-corr-alt');
    const gsCorrDot = el('gs-corr-dot');
    if (gsCorrAlt) gsCorrAlt.addEventListener('input', updateGsCorr);
    if (gsCorrDot) gsCorrDot.addEventListener('change', updateGsCorr);
    // 速度・角度スライダー変更時も修正計算を更新
    ['papi-aspd', 'papi-angle'].forEach(id => {
      const inp = el(id);
      if (inp) inp.addEventListener('input', () => {
        updateGsCorr();
        if (id === 'papi-angle') updateBlindZoneInfo();
      });
    });
    // 空港・滑走路変更時も更新
    el('papi-airport-sel').addEventListener('change', updateGsCorr);
    el('papi-runway-sel').addEventListener('change', updateGsCorr);

    // 滑走路勾配スライダーの change イベント
    const rwySlopeSlider = el('rwy-slope');
    if (rwySlopeSlider) {
      rwySlopeSlider.addEventListener('change', () => {
        const val = rwySlopeSlider.value;
        const disp = el('rwy-slope-val');
        if (disp) disp.textContent = val + '%';
        updateRunwayGradient();
      });
    }

    window.addEventListener('resize', () => { drawPapi(); drawRunwayDiagram(); updateBlindZoneInfo(); });
    updatePapiRunwayOptions();
    autoDetectIls();
    updatePapiRwyLabel();
    loadIlsDefaults();
    updateGsCorr();
    updateRunwayGradient();
  });

  // PAPIページのタブ切替関数をグローバル公開
  window.showView = showView;

  // Blind Zone情報更新関数
  function updateBlindZoneInfo() {
    const bzDiv = el('papi-blindzone');
    if (!bzDiv) return;

    const acSel = el('papi-aircraft');
    const acType = acSel ? acSel.value : 'B747-8F';
    const acData = AIRCRAFT_DATA[acType] || AIRCRAFT_DATA['B747-8F'];
    const cockpitHtFt = acData.eyeHt;

    const gpAngleDeg = 3.0; // 標準 Glide Path
    const pitchAngleDeg = parseFloat(el('papi-angle').value) || 3.0;

    // Blind Zone距離 = Cockpit Height / tan(Pitch angle)
    const pitchRad = pitchAngleDeg * Math.PI / 180;
    const blindDistNM = (cockpitHtFt / Math.tan(pitchRad)) / 6076.12;
    const blindDistFt = blindDistNM * 6076.12;

    // Touchdown Zone情報（ユーザー提供の図から）
    // B747-8F の Touchdown Zone: 1000-2250 ft
    const tdz1000Ft = 1000, tdz2250Ft = 2250;

    let html = '<div style="color:#78909c">';
    html += '<strong>コックピット高さ:</strong> ' + cockpitHtFt + 'ft (' + acType + ')<br>';
    html += '<strong>Pitch角度:</strong> ' + pitchAngleDeg.toFixed(2) + '°<br>';
    html += '<strong>Blind Zone距離:</strong> <span style="color:#ff9800;font-weight:bold">' + blindDistFt.toFixed(0) + 'ft</span> (' + blindDistNM.toFixed(2) + 'NM)<br>';
    html += '<br>';
    html += '<div style="color:#ffeb3b;font-size:8px"><strong>Touchdown Zone標準:</strong></div>';
    html += '<div style="font-size:8px;color:#80cbc4;padding-left:6px">';
    html += '1000～2250 ft from THR<br>';
    if (blindDistFt < tdz1000Ft) {
      html += '<span style="color:#4fc3f7">✓ THR前でTDZ開始</span>';
    } else if (blindDistFt <= tdz2250Ft) {
      html += '<span style="color:#ff6f00">⚠ TDZ内にBlind Zone</span>';
    } else {
      html += '<span style="color:#81c784">✓ TDZ後でクリア</span>';
    }
    html += '</div>';
    html += '</div>';

    bzDiv.innerHTML = html;
  }

  // 滑走路勾配による Pitch/Flare補正値を計算・表示
  function updateRunwayGradient() {
    const slopeDiv = el('rwy-slope-info');
    if (!slopeDiv) return;

    const slopePct = parseFloat(el('rwy-slope').value) || 0.0;

    // Pitch Attitude補正値 = 勾配(%) × 60 / 100 = 勾配(小数) × 60
    const pitchAttiCorr = (slopePct / 100) * 60;

    // Flare開始高度補正値 = 1312ft × 勾配(%)
    const aimingPt = 1312;
    const flareAltCorr = aimingPt * slopePct / 100;

    let html = '<div style="color:#78909c">';
    html += '<strong>Pitch Attitude補正:</strong> <span style="color:#4fc3f7">' + pitchAttiCorr.toFixed(2) + '°</span><br>';
    html += '<strong>Flare高度補正:</strong> <span style="color:#ffeb3b">' + flareAltCorr.toFixed(0) + 'ft</span><br>';
    html += '<div style="font-size:8px;color:#80cbc4;margin-top:4px">';
    if (slopePct > 0) {
      html += '上り勾配：Flareを早める（約 ' + Math.abs(flareAltCorr).toFixed(0) + 'ft 高く開始）';
    } else if (slopePct < 0) {
      html += '下り勾配：Flareを遅める（約 ' + Math.abs(flareAltCorr).toFixed(0) + 'ft 低く開始）';
    } else {
      html += '勾配なし（水平滑走路）';
    }
    html += '</div>';
    html += '</div>';

    slopeDiv.innerHTML = html;
  }

  // AimingタブからPAPIタブを同期するグローバル関数
  window.syncPapiTo = function(apCode, rwCode) {
    const apSel = el('papi-airport-sel');
    const rwSel = el('papi-runway-sel');
    if (!apSel || !rwSel) return;
    if (apCode) { apSel.value = apCode; updatePapiRunwayOptions(); }
    if (rwCode) rwSel.value = rwCode;
    updatePapiRwyLabel(); loadIlsDefaults();
  };
})();
