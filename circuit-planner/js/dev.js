// ===== GS/LOC 偏差 (DEV) タブ — HAT 基準版 =====
(function () {
  const FT_PER_NM = 6076.12;
  const M_PER_NM  = 1852;
  const GP_DEG    = 3.0;  // 標準 Glide Path
  const TCH_FT    = 50;   // Threshold Crossing Height (標準 50ft → HAT=50ft = THR通過)

  // LOC: ILS標準 末端全幅 210m / 4dots = 52.5m/dot (THRにて固定)
  const LOC_1DOT_THR_M = 52.5;

  // HAT キーポイント (ft above threshold)
  const HAT_MARKS = [50, 100, 200, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000];
  const HAT_MIN = 50;
  // ユーザーが選択した表示範囲上限（デフォルト全域）
  let devHatMax = 5000;

  function el(id) { return document.getElementById(id); }

  function getDevParams() {
    return {
      gsDotDeg:    parseFloat(el('dev-gs-dot').value)      || 0.35,
      rwyLengthM:  parseFloat(el('dev-rwy-len').value)     || 4000,
      locOffsetM:  parseFloat(el('dev-loc-offset').value)  || 472,
    };
  }

  // GS偏差: HAT(ft), N dot → deviation (ft) 高め方向のみ
  // = nDots × HAT × tan(dotDeg) / tan(GP)
  function gsDevAtHAT(nDots, hat, dotDeg) {
    return nDots * hat * Math.tan(dotDeg * Math.PI / 180) / Math.tan(GP_DEG * Math.PI / 180);
  }

  // HAT(ft) → 距離(NM from THR)  TCH=50ftでTHR通過のため50ft分シフト
  function hatToNM(hat) {
    return Math.max(0, hat - TCH_FT) / (FT_PER_NM * Math.tan(GP_DEG * Math.PI / 180));
  }

  // LOC偏差: HAT(ft), N dot → deviation (m) 絶対値
  // D_loc = 滑走路長 + LOCオフセット（停止端〜LOCアンテナ）でビーム角を決定
  function locDevAtHAT(nDots, hat, rwyLengthM, locOffsetM) {
    const D_loc = rwyLengthM + locOffsetM;    // THR〜LOCアンテナ (m)
    const D_from_loc = hatToNM(hat) * M_PER_NM + D_loc;
    return nDots * LOC_1DOT_THR_M * D_from_loc / D_loc;
  }

  // ===== 描画 =====
  function drawDev() {
    const canvas = el('dev-canvas');
    if (!canvas || el('dev-view').style.display === 'none') return;

    const { gsDotDeg, rwyLengthM, locOffsetM } = getDevParams();

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.clientWidth  || 800;
    const H   = canvas.clientHeight || 600;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, W, H);

    const PAD_L = 72, PAD_R = 72, PAD_T = 30, PAD_B = 24, GAP = 28;
    const plotW      = W - PAD_L - PAD_R;
    const totalPlotH = H - PAD_T - PAD_B - GAP;
    const gsH        = Math.round(totalPlotH * 0.52);
    const locH       = totalPlotH - gsH;
    const gsTop  = PAD_T,       gsBot  = gsTop + gsH;
    const locTop = gsBot + GAP, locBot = locTop + locH;

    // X軸: 対数スケール HAT（devHatMax まで）
    const LOG_MIN = Math.log10(HAT_MIN);
    const LOG_MAX = Math.log10(devHatMax);
    const XH  = hat => PAD_L + (Math.log10(Math.max(hat, HAT_MIN)) - LOG_MIN) / (LOG_MAX - LOG_MIN) * plotW;
    // ログ空間での連続描画用
    const hatAt = (i, N) => Math.pow(10, LOG_MIN + (LOG_MAX - LOG_MIN) * i / N);

    // ─── 共通: バンド描画 ───
    const drawBand = (nDotsLo, nDotsHi, devFn, YFn, color) => {
      const N = 300;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const hat = hatAt(i, N);
        const y = YFn(devFn(nDotsHi, hat));
        if (i === 0) ctx.moveTo(XH(hat), y); else ctx.lineTo(XH(hat), y);
      }
      for (let i = N; i >= 0; i--) {
        const hat = hatAt(i, N);
        ctx.lineTo(XH(hat), YFn(devFn(nDotsLo, hat)));
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    // 共通: 境界曲線
    const drawBound = (nDots, devFn, YFn, color, lw, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash);
      ctx.beginPath();
      const N = 250;
      for (let i = 0; i <= N; i++) {
        const hat = hatAt(i, N);
        const y = YFn(devFn(nDots, hat));
        if (i === 0) ctx.moveTo(XH(hat), y); else ctx.lineTo(XH(hat), y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // ──────────────────────────────────────
    //  GS DEVIATION パネル（プラス側のみ）
    // ──────────────────────────────────────
    // Y軸上限を表示HAT範囲に合わせてオートスケール
    const gsMaxFt = devHatMax <= 500  ? 100  :
                    devHatMax <= 1000 ? 200  :
                    devHatMax <= 2000 ? 500  : 1200;
    const YGs = devFt => gsBot - Math.max(0, Math.min(1, devFt / gsMaxFt)) * gsH;
    const gsFn = (n, hat) => gsDevAtHAT(n, hat, gsDotDeg);

    ctx.fillStyle = '#071320';
    ctx.fillRect(PAD_L, gsTop, plotW, gsH);

    drawBand(0,   0.5, gsFn, YGs, 'rgba(76,175,80,0.40)');
    drawBand(0.5, 1.0, gsFn, YGs, 'rgba(255,214,0,0.28)');
    drawBand(1.0, 2.0, gsFn, YGs, 'rgba(255,138,0,0.22)');
    drawBand(2.0, 3.5, gsFn, YGs, 'rgba(239,83,80,0.16)');

    // On Path 基線
    ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PAD_L, gsBot); ctx.lineTo(PAD_L + plotW, gsBot); ctx.stroke();

    drawBound(0.5, gsFn, YGs, 'rgba(105,240,174,0.65)', 1.0, [3, 5]);
    drawBound(1.0, gsFn, YGs, '#ffd740',               2.0, [5, 3]);  // CALLOUT
    drawBound(2.0, gsFn, YGs, 'rgba(239,83,80,0.75)',  1.2, [7, 4]);

    // Y軸グリッド + ラベル
    const gsYStep = gsMaxFt <= 100 ? 20 : gsMaxFt <= 200 ? 50 : gsMaxFt <= 500 ? 100 : 200;
    for (let v = 0; v <= gsMaxFt; v += gsYStep) {
      const y = YGs(v);
      if (y < gsTop || y > gsBot + 1) continue;
      ctx.strokeStyle = v === 0 ? '#4caf50' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = v === 0 ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + plotW, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillStyle = v === 0 ? '#4caf50' : '#546e7a';
      ctx.font = v === 0 ? 'bold 10px sans-serif' : '10px sans-serif';
      ctx.fillText(v === 0 ? 'On Path' : '+' + v + 'ft', PAD_L - 5, y + 3);
    }

    // HAT 縦グリッド + 偏差値ラベル（Y間隔トラッキングで重複防止）
    const hatLabel = hat => hat >= 1000 ? (hat % 1000 === 0 ? hat/1000 + 'k' : (hat/1000).toFixed(1) + 'k') : hat + '';
    const LABEL_GAP = 15;

    // GSラベル（暗い輪郭線付き）
    const drawGsLbl = (text, lx, ly, color, bold, ta) => {
      ctx.font = (bold ? 'bold ' : '') + '9px sans-serif'; ctx.textAlign = ta;
      ctx.strokeStyle = 'rgba(4,14,28,0.9)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.strokeText(text, lx, ly);
      ctx.fillStyle = color; ctx.fillText(text, lx, ly);
    };

    HAT_MARKS.forEach(hat => {
      const x = XH(hat);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, gsTop); ctx.lineTo(x, gsBot); ctx.stroke();

      const d05 = Math.round(gsDevAtHAT(0.5, hat, gsDotDeg));
      const d1  = Math.round(gsDevAtHAT(1.0, hat, gsDotDeg));
      const d2  = Math.round(gsDevAtHAT(2.0, hat, gsDotDeg));
      const y05 = YGs(gsDevAtHAT(0.5, hat, gsDotDeg));
      const y1  = YGs(gsDevAtHAT(1.0, hat, gsDotDeg));
      const y2  = YGs(gsDevAtHAT(2.0, hat, gsDotDeg));
      const nearRight = x > PAD_L + plotW - 22;
      const nearLeft  = x < PAD_L + 22;
      const lx = nearRight ? x - 3 : nearLeft ? x + 3 : x;
      const la = nearRight ? 'right' : nearLeft ? 'left' : 'center';

      // 全交点にラベル表示（同HAT内の垂直重複のみ防止）
      const ok05 = y05 > gsTop + 10 && y05 < gsBot - 8;
      if (ok05) drawGsLbl('+' + d05 + 'ft', lx, y05 - 4, 'rgba(105,240,174,0.95)', false, la);

      const ok1 = y1 > gsTop + 10 && y1 < gsBot - 8 && (!ok05 || (y05 - y1) >= LABEL_GAP);
      if (ok1) drawGsLbl('+' + d1 + 'ft', lx, y1 - 4, '#ffd740', true, la);

      const ok2 = y2 > gsTop + 10 && y2 < gsBot - 8 && (!ok1 || (y1 - y2) >= LABEL_GAP);
      if (ok2) drawGsLbl('+' + d2 + 'ft', lx, y2 - 4, '#ef9a9a', false, la);
    });

    // X軸ラベル (HAT ft + NM for ≤1500ft)
    ctx.textAlign = 'center';
    HAT_MARKS.forEach(hat => {
      const x = XH(hat);
      ctx.fillStyle = '#546e7a'; ctx.font = '10px sans-serif';
      ctx.fillText(hatLabel(hat), x, gsBot + 14);
      if (hat <= 1500) {
        ctx.fillStyle = '#455a64'; ctx.font = '8px sans-serif';
        ctx.fillText('(' + hatToNM(hat).toFixed(1) + 'nm)', x, gsBot + 23);
      }
    });

    // ゾーンラベル（右端マージン — CALLOUT情報を含める）
    [
      [0,   0.5, 'CORRECT',         '#a5d6a7'],
      [0.5, 1.0, 'SLIGHTLY/CALL',   '#ffd740'],
      [1.0, 2.0, 'TOO HIGH',        '#ffcc80'],
      [2.0, 3.2, 'DANGER',          '#ef9a9a'],
    ].forEach(([lo, hi, text, color]) => {
      const yMid = (YGs(gsFn(lo, devHatMax)) + YGs(gsFn(hi, devHatMax))) / 2;
      if (yMid < gsTop + 4 || yMid > gsBot - 4) return;
      ctx.fillStyle = color; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(text, PAD_L + plotW + 6, yMid + 3);
    });

    // タイトル（注釈を左側にまとめ、右マージン干渉を排除）
    ctx.fillStyle = '#b0bec5'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('GS偏差（高め方向）  1dot=' + gsDotDeg + '°  CALLOUT>1dot', PAD_L + 4, gsTop + 15);

    // ── GS 境界線凡例 ──
    {
      const lgX = PAD_L + 8, lgY = gsTop + 26;
      ctx.fillStyle = 'rgba(7,19,32,0.80)';
      ctx.fillRect(lgX - 2, lgY - 9, 130, 42);
      const drawL = (y, dash, color, lw, label, bold) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash);
        ctx.beginPath(); ctx.moveTo(lgX, y); ctx.lineTo(lgX + 18, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = (bold ? 'bold ' : '') + '7.5px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(label, lgX + 22, y + 3);
      };
      drawL(lgY,      [3,5], 'rgba(105,240,174,0.9)', 1.0, '0.5 dot', false);
      drawL(lgY + 13, [5,3], '#ffd740',               2.0, '1 dot  ← CALLOUT', true);
      drawL(lgY + 26, [7,4], 'rgba(239,83,80,0.85)',  1.2, '2 dot', false);
    }

    ctx.save();
    ctx.fillStyle = '#607d8b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.translate(14, (gsTop + gsBot) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('高度偏差 ft（高め）', 0, 0);
    ctx.restore();

    // ──────────────────────────────────────
    //  LOC DEVIATION パネル（絶対値）
    // ──────────────────────────────────────
    const locMaxM = devHatMax <= 500  ? 150  :
                    devHatMax <= 1000 ? 300  :
                    devHatMax <= 2000 ? 600  : 1000;
    const YLoc = devM => locBot - Math.max(0, Math.min(1, devM / locMaxM)) * locH;
    const locFn = (n, hat) => locDevAtHAT(n, hat, rwyLengthM, locOffsetM);

    ctx.fillStyle = '#071320';
    ctx.fillRect(PAD_L, locTop, plotW, locH);

    drawBand(0,    1/3,  locFn, YLoc, 'rgba(76,175,80,0.40)');
    drawBand(1/3,  1.0,  locFn, YLoc, 'rgba(255,214,0,0.28)');
    drawBand(1.0,  2.0,  locFn, YLoc, 'rgba(255,138,0,0.22)');
    drawBand(2.0,  3.5,  locFn, YLoc, 'rgba(239,83,80,0.16)');

    ctx.strokeStyle = '#4caf50'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PAD_L, locBot); ctx.lineTo(PAD_L + plotW, locBot); ctx.stroke();

    drawBound(1/3, locFn, YLoc, '#ff5252', 2.0, [3, 3]);  // CALLOUT
    drawBound(1.0, locFn, YLoc, '#ffd740', 1.8, [5, 3]);  // Stable limit
    drawBound(2.0, locFn, YLoc, 'rgba(239,83,80,0.75)', 1.2, [7, 4]);

    // LOC Y軸グリッド + ラベル
    const locYStep = locMaxM <= 150 ? 25 : locMaxM <= 300 ? 50 : locMaxM <= 600 ? 100 : 100;
    for (let v = 0; v <= locMaxM; v += locYStep) {
      const y = YLoc(v);
      if (y < locTop || y > locBot + 1) continue;
      ctx.strokeStyle = v === 0 ? '#4caf50' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = v === 0 ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + plotW, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillStyle = v === 0 ? '#4caf50' : '#546e7a';
      ctx.font = v === 0 ? 'bold 10px sans-serif' : '10px sans-serif';
      ctx.fillText(v === 0 ? 'On CL' : '+' + v + 'm', PAD_L - 5, y + 3);
    }

    // LOC HAT縦グリッド + 偏差値（X/Y間隔両方でラベル重複防止）

    HAT_MARKS.forEach(hat => {
      const x = XH(hat);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, locTop); ctx.lineTo(x, locBot); ctx.stroke();

      const d13 = Math.round(locDevAtHAT(1/3, hat, rwyLengthM, locOffsetM));
      const d1  = Math.round(locDevAtHAT(1.0, hat, rwyLengthM, locOffsetM));
      const d2  = Math.round(locDevAtHAT(2.0, hat, rwyLengthM, locOffsetM));
      const y13 = YLoc(locDevAtHAT(1/3, hat, rwyLengthM, locOffsetM));
      const y1  = YLoc(locDevAtHAT(1.0, hat, rwyLengthM, locOffsetM));
      const y2  = YLoc(locDevAtHAT(2.0, hat, rwyLengthM, locOffsetM));
      const nearRightL = x > PAD_L + plotW - 22;
      const nearLeftL  = x < PAD_L + 22;
      const llx = nearRightL ? x - 3 : nearLeftL ? x + 3 : x;
      const lla = nearRightL ? 'right' : nearLeftL ? 'left' : 'center';

      const mToNm = m => { const n = m / 1852; return n >= 0.1 ? '(' + n.toFixed(2) + 'nm)' : ''; };

      // ラベルを暗い輪郭線付きで描画（背景ゾーン色に依らず視認性確保）
      const drawLocLbl = (text, lx, ly, color, bold) => {
        ctx.font = (bold ? 'bold ' : '') + '9px sans-serif'; ctx.textAlign = lla;
        ctx.strokeStyle = 'rgba(4,14,28,0.9)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        ctx.strokeText(text, lx, ly);
        ctx.fillStyle = color; ctx.fillText(text, lx, ly);
      };

      // 全交点にラベル表示（同HAT内の垂直重複のみ防止）
      const ok13 = y13 > locTop + 10 && y13 < locBot - 8;
      if (ok13) drawLocLbl('+' + d13 + 'm' + mToNm(d13), llx, y13 - 3, '#ff7070', false);

      const ok1 = y1 > locTop + 10 && y1 < locBot - 8 && (!ok13 || (y13 - y1) >= LABEL_GAP);
      if (ok1) drawLocLbl('+' + d1 + 'm' + mToNm(d1), llx, y1 - 4, '#ffd740', true);

      const ok2 = y2 > locTop + 10 && y2 < locBot - 8 && (!ok1 || (y1 - y2) >= LABEL_GAP);
      if (ok2) drawLocLbl('+' + d2 + 'm' + mToNm(d2), llx, y2 - 3, '#ef9a9a', false);
    });

    // X軸ラベル (HAT ft + NM for ≤1500ft)
    ctx.textAlign = 'center';
    HAT_MARKS.forEach(hat => {
      const x = XH(hat);
      ctx.fillStyle = '#546e7a'; ctx.font = '10px sans-serif';
      ctx.fillText(hatLabel(hat), x, locBot + 14);
      if (hat <= 1500) {
        ctx.fillStyle = '#455a64'; ctx.font = '8px sans-serif';
        ctx.fillText('(' + hatToNM(hat).toFixed(1) + 'nm)', x, locBot + 23);
      }
    });
    ctx.fillStyle = '#546e7a'; ctx.font = '10px sans-serif';
    ctx.fillText('HAT (Height Above Threshold, ft)', PAD_L + plotW / 2, H - 6);

    // ゾーンラベル (右端)
    [
      [0,    1/3,  'CORRECT',   '#a5d6a7'],
      [1/3,  1.0,  'CALLOUT',   '#ff9e9e'],
      [1.0,  2.0,  'OFF PATH',  '#ffcc80'],
      [2.0,  3.2,  'DANGER',    '#ef9a9a'],
    ].forEach(([lo, hi, text, color]) => {
      const yMid = (YLoc(locFn(lo, devHatMax)) + YLoc(locFn(hi, devHatMax))) / 2;
      if (yMid < locTop + 4 || yMid > locBot - 4) return;
      ctx.fillStyle = color; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(text, PAD_L + plotW + 6, yMid + 3);
    });

    // タイトル
    ctx.fillStyle = '#b0bec5'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    const D_loc_disp = rwyLengthM + locOffsetM;
    const fsAngle = (2 * Math.atan(105 / D_loc_disp) * 180 / Math.PI).toFixed(1);
    ctx.fillText(`LOC偏差（絶対値）  末端 1dot = 52.5m  D_loc=${D_loc_disp}m  FS=${fsAngle}°  コールアウト: 1/3dot超`, PAD_L + 4, locTop + 15);

    // ── LOC 境界線凡例 ──
    {
      const lgX = PAD_L + 8, lgY = locTop + 26;
      ctx.fillStyle = 'rgba(7,19,32,0.80)';
      ctx.fillRect(lgX - 2, lgY - 9, 140, 42);
      const drawL = (y, dash, color, lw, label, bold) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash);
        ctx.beginPath(); ctx.moveTo(lgX, y); ctx.lineTo(lgX + 18, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = (bold ? 'bold ' : '') + '7.5px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(label, lgX + 22, y + 3);
      };
      drawL(lgY,      [3,3], '#ff5252',               2.0, '1/3 dot  ← CALLOUT', true);
      drawL(lgY + 13, [5,3], '#ffd740',               1.8, '1 dot (Stable limit)', false);
      drawL(lgY + 26, [7,4], 'rgba(239,83,80,0.85)',  1.2, '2 dot', false);
    }

    ctx.save();
    ctx.fillStyle = '#607d8b'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.translate(14, (locTop + locBot) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('横偏差 m（片側）', 0, 0);
    ctx.restore();

    // 区切り線
    ctx.strokeStyle = '#1a3050'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_L, gsBot + GAP / 2);
    ctx.lineTo(PAD_L + plotW, gsBot + GAP / 2);
    ctx.stroke();

    updateDevTable(gsDotDeg, rwyLengthM, locOffsetM);
    drawPfdSidebar();
  }

  // ===== サイドバー PFD ミニ図（2段構成） =====
  function drawPfdSidebar() {
    const canvas = el('dev-pfd-canvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth  || 210;
    // Use CSS style height directly to avoid circular aspect-ratio lock:
    // setting canvas.height (buffer) changes intrinsic aspect, which overrides CSS height
    const H = parseFloat(canvas.style.height) || 340;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1e3a50'; ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // ────────────────────────────────────────
    //  SECTION 1: PFD スタイル偏差スケール
    // ────────────────────────────────────────
    const S1_TOP = 2;
    const S1_H   = Math.round(H * 0.62);  // ~211px

    // GS/LOC strip dimensions — thin like real PFD
    const LBL_H   = 10;   // "STANDARD" label
    const GS_W    = 16;   // GS vertical strip width
    const GS_GAP  = 2;    // gap: ADI right edge → GS strip
    const LOC_H   = 16;   // LOC horizontal strip height
    const LOC_GAP = 2;    // gap: ADI bottom edge → LOC strip

    // Maximize ADI size within available area
    const side = Math.min(
      W - 8 - GS_W - GS_GAP,                      // horizontal constraint
      S1_H - LBL_H - 3 - LOC_H - LOC_GAP - 10    // vertical constraint (10px caption)
    );

    // Center [ADI + GS strip] block horizontally
    const blockW = side + GS_GAP + GS_W;
    const adiL   = Math.round((W - blockW) / 2);
    const adiT   = S1_TOP + LBL_H + 3;
    const adiR   = adiL + side;
    const adiB   = adiT + side;

    // Scale metrics
    const gsCX  = adiR + GS_GAP + GS_W / 2;   // GS strip center X
    const gsCY  = adiT + side / 2;              // GS center Y (= ADI center)
    const gsDot = side / 4.2;                   // px per dot

    const locCX  = adiL + side / 2;             // LOC strip center X
    const locCY  = adiB + LOC_GAP + LOC_H / 2; // LOC strip center Y
    const locDot = side / 4.2;

    // ── "STANDARD" ラベル ──
    ctx.fillStyle = '#546e7a'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('STANDARD', W / 2, S1_TOP + 8);

    // ── ADI 背景（青空/茶色地面）──
    const horizY = adiT + Math.round(side * 0.48);
    ctx.fillStyle = '#1a3c6e';
    ctx.fillRect(adiL, adiT, side, horizY - adiT);
    ctx.fillStyle = '#4a2800';
    ctx.fillRect(adiL, horizY, side, adiB - horizY);

    // Pitch reference lines (faint)
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 0.8;
    [0.22, 0.44].forEach(p => {
      const py = horizY - Math.round(side * p * 0.3);
      ctx.beginPath(); ctx.moveTo(adiL + side*0.18, py); ctx.lineTo(adiL + side*0.82, py); ctx.stroke();
    });

    // ADI border (dark)
    ctx.strokeStyle = '#263238'; ctx.lineWidth = 1.5;
    ctx.strokeRect(adiL, adiT, side, side);

    // Horizon line
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(adiL + 2, horizY); ctx.lineTo(adiR - 2, horizY); ctx.stroke();

    // Aircraft reference symbol (orange wings + center bar)
    const acx = adiL + side / 2, acy = horizY;
    ctx.strokeStyle = '#ff9800'; ctx.lineWidth = Math.max(1.5, side / 100);
    ctx.beginPath(); ctx.moveTo(acx - side*0.27, acy); ctx.lineTo(acx - side*0.08, acy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(acx + side*0.08, acy); ctx.lineTo(acx + side*0.27, acy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(acx, acy - side*0.06); ctx.lineTo(acx, acy + side*0.04); ctx.stroke();

    // ── GS strip (right of ADI, black background) ──
    ctx.fillStyle = '#0b1318';
    ctx.fillRect(adiR + GS_GAP, adiT, GS_W, side);
    ctx.strokeStyle = '#263238'; ctx.lineWidth = 0.5;
    ctx.strokeRect(adiR + GS_GAP, adiT, GS_W, side);

    // "GS" label above strip
    ctx.fillStyle = '#4fc3f7'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('GS', gsCX, adiT - 1);

    // GS center tick
    ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(adiR + GS_GAP + 2, gsCY); ctx.lineTo(adiR + GS_GAP + GS_W - 2, gsCY); ctx.stroke();

    // GS circles ±1, ±2 dot
    [-2, -1, 1, 2].forEach(i => {
      const y = gsCY - i * gsDot;
      ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(gsCX, y, 3.5, 0, Math.PI * 2); ctx.stroke();
    });

    // GS ◆ at +1dot (CALLOUT threshold)
    const gsIndY = gsCY - gsDot;
    ctx.fillStyle = '#e040fb';
    const gdr = 6;
    ctx.beginPath();
    ctx.moveTo(gsCX, gsIndY - gdr); ctx.lineTo(gsCX + gdr, gsIndY);
    ctx.lineTo(gsCX, gsIndY + gdr); ctx.lineTo(gsCX - gdr, gsIndY);
    ctx.closePath(); ctx.fill();

    // ── LOC strip (below ADI, black background) ──
    ctx.fillStyle = '#0b1318';
    ctx.fillRect(adiL, adiB + LOC_GAP, side, LOC_H);
    ctx.strokeStyle = '#263238'; ctx.lineWidth = 0.5;
    ctx.strokeRect(adiL, adiB + LOC_GAP, side, LOC_H);

    // "LOC" label left of strip
    ctx.fillStyle = '#4fc3f7'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('LOC', adiL - 2, locCY + 2);

    // LOC center tick
    ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(locCX, adiB + LOC_GAP + 2); ctx.lineTo(locCX, adiB + LOC_GAP + LOC_H - 2); ctx.stroke();

    // LOC circles ±1, ±2 dot
    [-2, -1, 1, 2].forEach(i => {
      const x = locCX + i * locDot;
      ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(x, locCY, 3.5, 0, Math.PI * 2); ctx.stroke();
    });

    // LOC ◆ at +1/3dot (CALLOUT threshold)
    const locIndX = locCX + locDot / 3;
    ctx.fillStyle = '#e040fb';
    const ldr = 6;
    ctx.beginPath();
    ctx.moveTo(locIndX, locCY - ldr); ctx.lineTo(locIndX + ldr, locCY);
    ctx.lineTo(locIndX, locCY + ldr); ctx.lineTo(locIndX - ldr, locCY);
    ctx.closePath(); ctx.fill();

    // Caption: explain ◆ positions
    ctx.fillStyle = '#9575cd'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('◆ = CALLOUT   GS: +1dot  /  LOC: +1/3dot', W / 2, locCY + LOC_H / 2 + 9);

    // ────────────────────────────────────────
    //  区切り線 + ラベル
    // ────────────────────────────────────────
    const DIV_Y = S1_TOP + S1_H;
    ctx.strokeStyle = '#263238'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(4, DIV_Y); ctx.lineTo(W - 4, DIV_Y); ctx.stroke();

    // ────────────────────────────────────────
    //  SECTION 2: LOC EXPANDED SCALE
    // ────────────────────────────────────────
    const S2_TOP = DIV_Y + 2;
    const S2_H   = H - S2_TOP - 4;

    ctx.fillStyle = '#80cbc4'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LOC  EXPANDED  SCALE', W / 2, S2_TOP + 9);

    // PFD スタイル表示（S2_H に応じて動的に拡大）
    const pfdMargin = 6;
    const pfdTop    = S2_TOP + 13;
    const pfdH      = Math.round(S2_H * 0.42);
    const pfdBot    = pfdTop + pfdH;
    const cx2       = W / 2;
    // ±2dot を (W-pfdMargin*2) 幅に収める
    const eHalfW    = (W - pfdMargin * 2) / 2;
    const ePxPerDot = eHalfW / 2;        // 1 dot あたりのピクセル
    const ePxPer13  = ePxPerDot / 3;     // 1/3 dot  ← CALLOUT 閾値
    const ePxPerHalf = ePxPerDot / 2;    // 1/2 dot  ← □ 1個分
    const scaleY    = pfdTop + pfdH / 2;

    // 黒背景（PFD表示エリア）
    ctx.fillStyle = '#080c0f';
    ctx.fillRect(pfdMargin, pfdTop, W - pfdMargin * 2, pfdH);

    // 緑ゾーン：中心 ± 1/3 dot（= 矩形の2/3まで）
    ctx.fillStyle = 'rgba(76,175,80,0.30)';
    ctx.fillRect(cx2 - ePxPer13, pfdTop, ePxPer13 * 2, pfdH);

    // 中心線（白い縦線）
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx2, pfdTop + 3); ctx.lineTo(cx2, pfdBot - 3);
    ctx.stroke();

    // 矩形マーカー □ — 中心から ±1/2 dot の位置に1個ずつ
    const rSz = 8;
    [-1, 1].forEach(side => {
      const rx = cx2 + side * ePxPerHalf;
      ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1.5;
      ctx.strokeRect(rx - rSz / 2, scaleY - rSz / 2, rSz, rSz);
    });

    // ◆ インジケータ（マゼンタ）— 左 1/3 dot 位置（= CALLOUT 閾値）
    const diaX = cx2 - ePxPer13;
    ctx.fillStyle = '#e040fb';
    const dr2 = 5;
    ctx.beginPath();
    ctx.moveTo(diaX, scaleY - dr2); ctx.lineTo(diaX + dr2, scaleY);
    ctx.lineTo(diaX, scaleY + dr2); ctx.lineTo(diaX - dr2, scaleY);
    ctx.closePath(); ctx.fill();

    // CALLOUT ラベル（◆の上）
    ctx.fillStyle = '#ff5252'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CALLOUT!', diaX, pfdTop - 2);

    // ── 寸法ライン（PFD の下）──
    // 右側矩形を例示: 中心 → □端 (1/2d)、中心 → CALLOUT (1/3d)
    const dimTop = pfdBot + 6;
    const arrH2  = 2.5;

    // 白: 中心 → □端 (1/2d)
    const dimRx = cx2 + ePxPerHalf;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(cx2, dimTop); ctx.lineTo(dimRx, dimTop); ctx.stroke();
    [cx2, dimRx].forEach(x => {
      ctx.beginPath(); ctx.moveTo(x, dimTop - arrH2); ctx.lineTo(x, dimTop + arrH2); ctx.stroke();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('□ = 1/2 dot', cx2 + ePxPerHalf / 2, dimTop - 1);

    // 赤: 中心 → CALLOUT (1/3d = □の2/3)
    const callRx = cx2 + ePxPer13;
    ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(cx2, dimTop + 7); ctx.lineTo(callRx, dimTop + 7); ctx.stroke();
    [cx2, callRx].forEach(x => {
      ctx.beginPath(); ctx.moveTo(x, dimTop + 7 - arrH2); ctx.lineTo(x, dimTop + 7 + arrH2); ctx.stroke();
    });
    ctx.fillStyle = '#ff5252'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CALL=1/3d (□の2/3)', cx2 + ePxPer13 / 2, dimTop + 6);

    // 説明文
    ctx.fillStyle = '#546e7a'; ctx.font = '6px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Center box = ±1/3 dot  (Callout threshold)', W / 2, S2_TOP + S2_H - 3);
  }

  // ===== 偏差早見表 (HAT基準) =====
  function updateDevTable(gsDotDeg, rwyLengthM, locOffsetM) {
    const tableEl = el('dev-table');
    if (!tableEl) return;

    const pct = (Math.tan(gsDotDeg * Math.PI / 180) / Math.tan(GP_DEG * Math.PI / 180) * 100).toFixed(1);

    let html = '<table style="width:100%;border-collapse:collapse;font-size:10px;line-height:1.5">';
    html += '<tr style="color:#78909c;border-bottom:1px solid #1a3050;font-size:9px">';
    html += '<th style="text-align:left;padding:2px">HAT</th>';
    html += '<th style="color:#ffd740;padding:2px;text-align:right">GS<br>1dot</th>';
    html += '<th style="color:#ef9a9a;padding:2px;text-align:right">GS<br>2dot</th>';
    html += '<th style="color:#ff7070;padding:2px;text-align:right">LOC<br>1/3d</th>';
    html += '<th style="color:#ffd740;padding:2px;text-align:right">LOC<br>1dot</th>';
    html += '</tr>';

    HAT_MARKS.forEach(hat => {
      const gs1 = Math.round(gsDevAtHAT(1.0, hat, gsDotDeg));
      const gs2 = Math.round(gsDevAtHAT(2.0, hat, gsDotDeg));
      const l13 = Math.round(locDevAtHAT(1/3, hat, rwyLengthM, locOffsetM));
      const l1  = Math.round(locDevAtHAT(1.0, hat, rwyLengthM, locOffsetM));
      const key = [50, 100, 500, 1000, 2000, 3000, 5000].includes(hat);
      const lbl = hat >= 1000 ? (hat % 1000 === 0 ? hat/1000 + 'k' : (hat/1000).toFixed(1) + 'k') + 'ft' : hat + 'ft';

      html += `<tr style="border-top:1px solid #0f2540${key ? ';background:rgba(33,66,99,0.2)' : ''}">`;
      html += `<td style="color:${key?'#80cbc4':'#607d8b'};padding:2px;font-weight:${key?'bold':'normal'}">${lbl}</td>`;
      html += `<td style="color:${gs1>200?'#ef9a9a':'#ffd740'};padding:2px;text-align:right">+${gs1}ft</td>`;
      html += `<td style="color:#ef5350;padding:2px;text-align:right">+${gs2}ft</td>`;
      html += `<td style="color:#ff7070;padding:2px;text-align:right">+${l13}m</td>`;
      html += `<td style="color:${l1>150?'#ef9a9a':'#ffd740'};padding:2px;text-align:right">+${l1}m</td>`;
      html += '</tr>';
    });
    html += '</table>';
    html += `<div style="font-size:9px;color:#546e7a;margin-top:4px">GS 1dot = HAT × ${pct}%</div>`;
    tableEl.innerHTML = html;
  }

  // ===== 初期化 =====
  window.addEventListener('load', () => {
    [
      ['dev-gs-dot',     'dev-gs-dot-val',     '°'],
      ['dev-rwy-len',    'dev-rwy-len-val',    'm'],
      ['dev-loc-offset', 'dev-loc-offset-val', 'm'],
    ].forEach(([id, vid, suf]) => {
      const inp = el(id), disp = el(vid);
      if (!inp) return;
      inp.addEventListener('input', () => {
        if (disp) disp.textContent = inp.value + suf;
        drawDev(); drawPfdSidebar();
      });
    });

    // HAT 表示範囲ボタン
    const hatBtns = document.querySelectorAll('.dev-hat-btn');
    hatBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        devHatMax = parseInt(btn.dataset.max);
        hatBtns.forEach(b => {
          b.style.background = '#0f2744';
          b.style.color = '#78909c';
          b.style.borderColor = '#1e3a50';
          b.style.fontWeight = 'normal';
        });
        btn.style.background = '#1a3c6e';
        btn.style.color = '#4fc3f7';
        btn.style.borderColor = '#4fc3f7';
        btn.style.fontWeight = 'bold';
        drawDev(); drawPfdSidebar();
      });
    });

    window.addEventListener('resize', () => {
      if (el('dev-view') && el('dev-view').style.display !== 'none') {
        drawDev(); drawPfdSidebar();
      }
    });
  });

  function updateAutoCall() {
    const autoCallDiv = el('dev-autocall');
    if (!autoCallDiv) return;

    const GP_DEG_STD = 3.0;
    const GP_DEG_TRANS = 1.5;
    const FT_PER_NM = 6076.12;
    const TRANS_HAT_FT = 30; // 30Call で Path 遷移
    const TCH_FT = 50;

    // Call高度リスト（ft Above Ground）
    const callHeights = [
      { name: '50 Call', ft: 50 },
      { name: '30 Call', ft: 30 },
      { name: '20 Call', ft: 20 },
      { name: '10 Call', ft: 10 }
    ];

    let html = '<div style="color:#78909c">';

    // 推奨 Descent Rate
    html += '<div style="margin-bottom:4px;color:#80cbc4"><strong>Descent Rate</strong></div>';
    html += '<div style="padding-left:6px;margin-bottom:6px">';
    html += '<div>推奨: <span style="color:#4fc3f7">100～200 ft/min</span></div>';
    html += '</div>';

    // 各Call高度での情報
    html += '<div style="color:#80cbc4"><strong>Call Height Markers</strong></div>';
    callHeights.forEach((call, idx) => {
      const color = idx === 1 ? '#ffeb3b' : '#80cbc4'; // 30Call を強調
      html += '<div style="padding-left:6px;margin:2px 0;color:' + color + '">';
      html += call.name + ' (AGL ' + call.ft + 'ft)';
      if (call.ft === 30) {
        html += ' <span style="font-size:8px;color:#ff9800">← 3.0°→1.5° 遷移</span>';
      }
      html += '</div>';
    });

    html += '<div style="margin-top:6px;color:#78909c;font-size:8px">';
    html += '<strong>Path Info:</strong><br>';
    html += '3.0° descent until 30ft<br>';
    html += '↓<br>';
    html += '1.5° descent from 30ft to landing';
    html += '</div>';

    html += '</div>';
    autoCallDiv.innerHTML = html;
  }

  window.drawDev = () => { drawDev(); drawPfdSidebar(); updateAutoCall(); };
})();
