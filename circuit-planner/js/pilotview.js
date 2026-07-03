// ===== Visual Circuit — Pilot Eye View（3D軌跡アニメーション） =====
// calculateCircuit() の経路を飛行順に連結し、衛星画像テクスチャの地面を
// バンド分割テクスチャ三角形で透視描画しながらカメラを経路に沿って移動させる。
// 高度: Pattern Alt(MDA) を維持 → VDP から 3° 降下。旋回時はヨー+バンク(ロール)を再現。
(function () {
  'use strict';

  const el = id => document.getElementById(id);

  let running = false, paused = false, speed = 2;
  let raf = 0, lastT = 0;
  let path = null;          // buildPath() の結果
  let sTrack = 0;           // 経路上の走行距離 (m)
  let pitchDisp = 0, rollDisp = 0;
  let callout = null;       // { text, until }
  let firedEvents = null;   // Set
  let useSat = true;
  let tex = null, texBuilding = false;
  let prevRA = 99999;
  const EYE_GEAR_FT = 20.9;   // B747-8F: Pilot Eye と主脚の垂直差（RA概算用）

  // ---------- 経路構築 ----------
  function buildPath() {
    if (typeof getParams !== 'function' || typeof calculateCircuit !== 'function') return null;
    const params = getParams();
    const result = calculateCircuit(params);
    const th = params.threshold;
    const hdgRad = params.trueHeading * Math.PI / 180;
    const cosH = Math.cos(hdgRad), sinH = Math.sin(hdgRad);
    const cosLat = Math.cos(th[0] * Math.PI / 180);
    const toLocal = p => {
      const dN = (p[0] - th[0]) * 111320, dE = (p[1] - th[1]) * 111320 * cosLat;
      return [dN * cosH + dE * sinH, -dN * sinH + dE * cosH];   // [x(m,着陸方向+), u(m,右+)]
    };

    const gsl = result.windInfo.legs;
    const legsSrc = [];
    const add = (pts, name, gs) => { if (pts && pts.length >= 2) legsSrc.push({ pts, name, gs: Math.max(gs, 60) }); };
    // RADIAL レグ: VOR B/A は FAF/IAF フィックス（例: FF274）→ 会合旋回開始点 の飛行順で構築
    // （result.radialLegPath は地図表示用で VOR→外側 の順のため、そのままだと逆走になる）
    let startFix = null;
    if ((params.entryType === 'vorB' || params.entryType === 'vorA') && result.vorBTurnStartPos) {
      const appr = AIRPORTS[currentAirport]?.approaches?.[params.entryType];
      startFix = appr?.fixes?.find(f => f.role === 'FAF' || f.role === 'IAF') || null;
      const startPos = startFix ? [startFix.lat, startFix.lon]
                     : (result.radialLegPath && result.radialLegPath[1]) || null;
      if (startPos) add([startPos, result.vorBTurnStartPos], 'RADIAL', gsl.downwind.gs);
    } else {
      add(result.radialLegPath, 'RADIAL', gsl.downwind.gs);
    }
    add(result.entryTurnArc,   'ENTRY TURN', gsl.downwind.gs);
    add(result.downwindPath,   'DOWNWIND',   gsl.downwind.gs);
    add(result.baseTurnArc,    'BASE TURN',  (gsl.downwind.gs + gsl.base.gs) / 2);
    add(result.baseLegPath,    'BASE',       gsl.base.gs);
    add(result.finalTurnArc,   'FINAL TURN', (gsl.base.gs + gsl.final.gs) / 2);
    add(result.finalPath,      'FINAL',      gsl.final.gs);
    if (!legsSrc.length) return null;

    // 頂点列に連結（重複点除去）+ 累積距離
    const v = [];   // {x,u,s,leg,gs}
    let s = 0;
    legsSrc.forEach(leg => {
      leg.pts.forEach(p => {
        const [x, u] = toLocal(p);
        if (v.length) {
          const dx = x - v[v.length - 1].x, du = u - v[v.length - 1].u;
          const d = Math.hypot(dx, du);
          if (d < 1) {
            // 重複点 = レグ境界。前レグ終端を次レグの開始点として引き継ぐ
            v[v.length - 1].leg = leg.name;
            v[v.length - 1].gs = leg.gs;
            return;
          }
          s += d;
        }
        v.push({ x, u, s, leg: leg.name, gs: leg.gs });
      });
    });
    if (v.length < 2) return null;

    // 頂点ごとの進行方位（前後セグメントの単位ベクトル平均）
    // 旋回弧はチャード分割のため、セグメント固定方位だとヨーが階段状に変化して
    // カクつく。頂点方位を持たせて stateAt で角度補間することで滑らかにする。
    for (let i = 0; i < v.length; i++) {
      let sx = 0, su = 0;
      if (i > 0) {
        const dx = v[i].x - v[i - 1].x, du = v[i].u - v[i - 1].u;
        const d = Math.hypot(dx, du) || 1;
        sx += dx / d; su += du / d;
      }
      if (i < v.length - 1) {
        const dx = v[i + 1].x - v[i].x, du = v[i + 1].u - v[i].u;
        const d = Math.hypot(dx, du) || 1;
        sx += dx / d; su += du / d;
      }
      v[i].psi = Math.atan2(su, sx);
    }

    // 接地点(x=0)通過の走行距離 s_TD（FINAL上で x が 0 を横切る点）
    let sTD = v[v.length - 1].s;
    for (let i = v.length - 2; i >= 0; i--) {
      if (v[i].leg !== 'FINAL' && v[i + 1].leg !== 'FINAL') break;
      if (v[i].x <= 0 && v[i + 1].x >= 0) {   // 進入側 x<0 → 接地点 x=0 を通過
        const f = -v[i].x / Math.max(1e-6, v[i + 1].x - v[i].x);
        sTD = v[i].s + f * (v[i + 1].s - v[i].s);
        break;
      }
    }

    const patternAltFt = Math.max(200, params.mda - params.thr_elev);
    const rwy = AIRPORTS[currentAirport].runways[currentRunway];

    // ---- Aiming Point（PAPI）: 滑走路データから Eye の照準点を決定 ----
    // Final では接地点ではなく PAPI 位置（各空港の実データ）に向かって 3° 降下する
    const papiFt = (rwy.ils && rwy.ils.papiFt) || (rwy.papi && rwy.papi.ft) || 1414;
    const papiM  = papiFt * 0.3048;
    const papiSide = (rwy.papi && rwy.papi.side) || (rwy.ils && rwy.ils.papiSide) || 'L';
    // PAPI照準点(x=papiM)通過の走行距離 s_AIM
    let sAIM = null;
    for (let i = v.length - 2; i >= 0; i--) {
      if (v[i].leg !== 'FINAL' && v[i + 1].leg !== 'FINAL') break;
      if (v[i].x <= papiM && v[i + 1].x >= papiM) {
        const f = (papiM - v[i].x) / Math.max(1e-6, v[i + 1].x - v[i].x);
        sAIM = v[i].s + f * (v[i + 1].s - v[i].s);
        break;
      }
    }
    if (sAIM === null) sAIM = sTD + papiM;   // 経路がPAPIまで届かない場合は外挿

    // イベント点（走行距離）
    const events = [];
    const evAt = (latlon, text) => {
      if (!latlon) return null;
      const [ex, eu] = toLocal(latlon);
      // 経路セグメントへ射影して走行距離 s を求める
      let bestS = null, bd = 1e12;
      for (let i = 0; i < v.length - 1; i++) {
        const ax = v[i].x, au = v[i].u;
        const dx = v[i + 1].x - ax, du = v[i + 1].u - au;
        const len2 = dx * dx + du * du;
        if (len2 < 1e-6) continue;
        let t = ((ex - ax) * dx + (eu - au) * du) / len2;
        t = Math.max(0, Math.min(1, t));
        const d = (ax + dx * t - ex) ** 2 + (au + du * t - eu) ** 2;
        if (d < bd) { bd = d; bestS = v[i].s + Math.sqrt(len2) * t; }
      }
      if (bestS === null || bd >= 600 ** 2) return null;
      if (text) events.push({ s: bestS, text });
      return bestS;
    };
    const sAbeam = evAt(result.abeamPos, 'ABEAM — TIME CHECK');
    evAt(result.baseTurnLeadPos,  'BASE TURN LEAD');
    evAt(result.finalTurnLeadPos, 'FINAL TURN LEAD');
    evAt(result.vdpOnCircuit,     'VDP — DESCENT 3°');
    // レグ切替イベント（境界頂点そのものの s で発火）
    for (let i = 1; i < v.length; i++) {
      if (v[i].leg !== v[i - 1].leg) events.push({ s: v[i].s, text: v[i].leg });
    }
    // Time Check カウントダウンの終点 = ベースターン開始
    const btEv = events.find(e => e.text === 'BASE TURN');
    const sBaseTurn = btEv ? btEv.s : null;
    events.sort((a, b) => a.s - b.s);

    // マーカー（地面上に描く注釈）
    const markers = [];
    const mk = (latlon, label, color) => {
      if (!latlon) return;
      const [mx, mu] = toLocal(latlon);
      markers.push({ x: mx, u: mu, label, color });
    };
    if (startFix) mk([startFix.lat, startFix.lon], startFix.ident, '#00e5ff');
    mk(result.vorBTurnStartPos, '会合旋回', '#00e5ff');
    mk(result.abeamPos,         'ABEAM', '#00e5ff');
    mk(result.vdpOnCircuit,     'VDP',   '#ff9800');
    mk(result.baseTurnLeadPos,  'LEAD',  '#ffe082');
    mk(result.finalTurnLeadPos, 'LEAD',  '#ffe082');
    mk(result.baseTurnStartPos, 'BASE TURN', '#4fc3f7');
    mk(result.finalTurnStartPos,'FINAL TURN','#4fc3f7');
    // PAPI照準点（センターライン上・滑走路データ由来）
    markers.push({ x: papiM, u: 0, label: `AIM ${papiFt}ft (PAPI)`, color: '#ffe082' });

    // リファレンスVOR（サイドバー入力値を優先、なければ空港データ）
    const apVor = AIRPORTS[currentAirport]?.vor;
    const vorLat = (params.vorLat != null && !isNaN(params.vorLat)) ? params.vorLat : (apVor ? apVor.lat : null);
    const vorLon = (params.vorLon != null && !isNaN(params.vorLon)) ? params.vorLon : (apVor ? apVor.lon : null);
    const vorIdent = (document.getElementById('vor-ident')?.value || (apVor ? apVor.ident : 'VOR')).trim() || 'VOR';

    return {
      v, sTD, sAIM, sAbeam, sBaseTurn, papiFt, papiM, papiSide, patternAltFt, events, markers,
      total: v[v.length - 1].s,
      thLat: th[0], thLon: th[1], hdgRad, cosH, sinH, cosLat,
      rwLenM: rwy.length_m || 3500,
      magVar: params.magVar || 0,
      trueHeading: params.trueHeading,
      vorLat, vorLon, vorIdent,
      apCode: currentAirport, rwCode: currentRunway,
    };
  }

  // 経路上 s の状態を返す
  function stateAt(P, s) {
    const v = P.v;
    s = Math.max(0, Math.min(s, P.total - 0.01));
    let i = 0;
    while (i < v.length - 2 && v[i + 1].s < s) i++;
    const a = v[i], b = v[i + 1];
    const f = (s - a.s) / Math.max(1e-6, b.s - a.s);
    const x = a.x + (b.x - a.x) * f, u = a.u + (b.u - a.u) * f;
    // 進行方位: 頂点方位を最短角で補間（旋回中も連続的に変化）
    let dpsi = b.psi - a.psi;
    while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
    while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
    const psi = a.psi + dpsi * f;
    // 高度 (ft AGL over THR): Pattern Alt を維持し、
    // PAPI照準点(sAIM, 滑走路データ由来)へ向かう 3° パスと交わったら降下
    const remNM = Math.max(0, (P.sAIM - s)) / 1852;
    const hFt = Math.min(P.patternAltFt, distToAltFt(remNM));
    return { x, u, psi, hFt, gs: a.gs, leg: a.leg, i };
  }

  // ヨー変化率から目標バンク角(rad)
  function bankAt(P, s, vMs) {
    const D = 160;   // 弧の頂点間隔(~140m)より広く取り、局所曲率の振動を平均化
    const s1 = stateAt(P, Math.max(0, s - D)), s2 = stateAt(P, s + D);
    let dpsi = s2.psi - s1.psi;
    while (dpsi > Math.PI) dpsi -= 2 * Math.PI;
    while (dpsi < -Math.PI) dpsi += 2 * Math.PI;
    const rate = dpsi / (2 * D);                            // rad/m
    return Math.max(-0.55, Math.min(0.55, Math.atan(vMs * vMs * rate / 9.81)));
  }

  // ---------- 衛星地面テクスチャ ----------
  function buildTexture(P) {
    if (texBuilding) return;
    texBuilding = true;
    // 経路のバウンディングボックス + マージン
    let x0 = 0, x1 = P.rwLenM, u0 = 0, u1 = 0;
    P.v.forEach(p => {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      u0 = Math.min(u0, p.u); u1 = Math.max(u1, p.u);
    });
    x0 -= 1800; x1 += 1800; u0 -= 2500; u1 += 2500;
    const mpp = Math.max(3, (x1 - x0) / 2800, (u1 - u0) / 2800);
    const w = Math.round((u1 - u0) / mpp), h = Math.round((x1 - x0) / mpp);
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const g = cvs.getContext('2d');
    g.fillStyle = '#232b1d'; g.fillRect(0, 0, w, h);

    const t = { canvas: cvs, x0, u0, mpp, w, h, key: P.apCode + '_' + P.rwCode, ready: false };

    const toLL = (x, u) => {
      const dN = x * P.cosH - u * P.sinH, dE = x * P.sinH + u * P.cosH;
      return [P.thLat + dN / 111320, P.thLon + dE / (111320 * P.cosLat)];
    };
    const toPx = (lat, lon) => {
      const dN = (lat - P.thLat) * 111320, dE = (lon - P.thLon) * 111320 * P.cosLat;
      const x = dN * P.cosH + dE * P.sinH, u = -dN * P.sinH + dE * P.cosH;
      return [(u - u0) / mpp, (x - x0) / mpp];
    };
    const tileXY = (lat, lon, z) => {
      const n = Math.pow(2, z);
      return [Math.floor((lon + 180) / 360 * n),
              Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n)];
    };
    const tileNW = (tx, ty, z) => {
      const n = Math.pow(2, z);
      return [Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n))) * 180 / Math.PI, tx / n * 360 - 180];
    };
    const tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

    function drawZoom(z, xa, xb, ua, ub) {
      const corners = [toLL(xa, ua), toLL(xa, ub), toLL(xb, ua), toLL(xb, ub)];
      const txs = [], tys = [];
      corners.forEach(([la, lo]) => { const [a, b] = tileXY(la, lo, z); txs.push(a); tys.push(b); });
      const jobs = [];
      for (let a = Math.min(...txs); a <= Math.max(...txs); a++)
        for (let b = Math.min(...tys); b <= Math.max(...tys); b++) jobs.push([a, b]);
      if (jobs.length > 700) return Promise.resolve();
      return Promise.allSettled(jobs.map(([a, b]) => new Promise(res => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const nw = tileNW(a, b, z), ne = tileNW(a + 1, b, z), sw = tileNW(a, b + 1, z);
            const p0 = toPx(nw[0], nw[1]), p1 = toPx(ne[0], ne[1]), p2 = toPx(sw[0], sw[1]);
            g.setTransform((p1[0] - p0[0]) / 256, (p1[1] - p0[1]) / 256,
                           (p2[0] - p0[0]) / 256, (p2[1] - p0[1]) / 256, p0[0], p0[1]);
            g.drawImage(img, 0, 0);
          } catch (e) {}
          res();
        };
        img.onerror = () => res();
        img.src = `${tileUrl}/${z}/${b}/${a}`;
      })));
    }

    drawZoom(14, x0, x1, u0, u1)
      .then(() => drawZoom(16, -1500, P.rwLenM + 500, -650, 650))
      .then(() => {
        g.setTransform(1, 0, 0, 1, 0, 0);
        t.ready = true; tex = t; texBuilding = false;
      })
      .catch(() => { texBuilding = false; });
  }

  // カメラ方位整列の中間キャンバス（近距離: 高解像度 / 遠距離: 低解像度）
  // 毎フレーム 回転1回で転写し、走査線ループは軸整列の矩形コピーになる（歪みなし）
  const INTER_NEAR = { F: 2200,  L: 1500,  mpp: 3  };
  const INTER_FAR  = { F: 17000, L: 10000, mpp: 20 };
  let interNear = null, interFar = null;

  function getInter(cfg, ref) {
    if (ref) return ref;
    const c = document.createElement('canvas');
    c.width  = Math.round(cfg.L * 2 / cfg.mpp);
    c.height = Math.round(cfg.F / cfg.mpp);
    return { canvas: c, ctx: c.getContext('2d'), ...cfg };
  }

  // tex（滑走路ローカル座標）→ 中間キャンバス（カメラ前方f×横l）へ回転転写
  function blitInter(I, camX, camU, cosP, sinP) {
    const g = I.ctx, mt = tex.mpp;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#42523a';
    g.fillRect(0, 0, I.canvas.width, I.canvas.height);
    const dX0 = tex.x0 - camX, dU0 = tex.u0 - camU;
    const C1 = dX0 * cosP + dU0 * sinP;      // fwd at tex origin
    const C2 = -dX0 * sinP + dU0 * cosP;     // lat at tex origin
    g.setTransform(
      (cosP * mt) / I.mpp, (sinP * mt) / I.mpp,
      (-sinP * mt) / I.mpp, (cosP * mt) / I.mpp,
      (C2 + I.L) / I.mpp, C1 / I.mpp
    );
    g.drawImage(tex.canvas, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- フレーム描画 ----------
  function render() {
    const canvas = el('pv-canvas');
    const P = path;
    if (!canvas || !P) return;
    const W = canvas.clientWidth || 800, H = canvas.clientHeight || 600;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const st = stateAt(P, sTrack);
    const vMs = st.gs * 0.51444;
    const hM = Math.max(3, st.hFt * 0.3048);

    // ピッチ（降下角）/ バンクのスムージング
    const st2 = stateAt(P, sTrack + 60);
    const gamma = Math.atan(Math.max(0, (st.hFt - st2.hFt) * 0.3048) / 60);
    pitchDisp += (gamma - pitchDisp) * 0.08;
    const bankTgt = bankAt(P, sTrack, vMs);
    rollDisp += (bankTgt - rollDisp) * 0.08;

    const DTILT = 6 * Math.PI / 180;               // 固定下向きチルト（地面が見えるように）
    const theta = pitchDisp + DTILT;               // カメラピッチ（下向き+）
    const psi = st.psi;
    const fl = H * 1.45, cx = W / 2, cy = H * 0.46;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const cosP = Math.cos(psi), sinP = Math.sin(psi);
    const horY = cy - fl * Math.tan(theta);

    const sat = useSat && tex && tex.ready && tex.key === P.apCode + '_' + P.rwCode;

    // ---- ロール回転を全シーンに適用 ----
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-rollDisp); ctx.translate(-cx, -cy);
    const M = Math.max(W, H) * 0.6;                // 回転マージン

    // 空
    const skyG = ctx.createLinearGradient(0, horY - H, 0, horY);
    if (sat) { skyG.addColorStop(0, '#4a7ab0'); skyG.addColorStop(1, '#c3d9ee'); }
    else     { skyG.addColorStop(0, '#060d16'); skyG.addColorStop(1, '#2a4a6a'); }
    ctx.fillStyle = skyG; ctx.fillRect(-M, horY - H - M, W + 2 * M, H + M);
    // 地面ベース
    ctx.fillStyle = sat ? '#42523a' : '#101a0c';
    ctx.fillRect(-M, horY, W + 2 * M, H * 2);

    // ---- 地面テクスチャ（中間キャンバス経由の走査線Mode-7、歪みなし） ----
    if (sat) {
      interNear = getInter(INTER_NEAR, interNear);
      interFar  = getInter(INTER_FAR,  interFar);
      blitInter(interNear, st.x, st.u, cosP, sinP);
      blitInter(interFar,  st.x, st.u, cosP, sinP);

      const yTop = Math.max(-M, Math.floor(horY) + 1);
      const yBot = H + M;
      const STEP = 2;
      let prevDx = null;
      for (let y = yTop; y < yBot; y += STEP) {
        const a = (cy - y) / fl;
        const den = sinT - a * cosT;
        if (den <= 1e-5) { prevDx = null; continue; }
        const dxF = hM * (cosT + a * sinT) / den;
        if (dxF > INTER_FAR.F) { prevDx = dxF; continue; }
        const depth = dxF * cosT + hM * sinT;
        const I = dxF < INTER_NEAR.F * 0.95 ? interNear : interFar;
        const sy = dxF / I.mpp;
        let sh = prevDx !== null ? Math.abs(prevDx - dxF) / I.mpp : 1;
        prevDx = dxF;
        sh = Math.min(Math.max(sh, 0.6), I.canvas.height - sy);
        if (sy < 0 || sy >= I.canvas.height) continue;
        // 横方向: 画面 [-M, W+M] が中間キャンバスのどこに当たるか（線形）
        const uL = (-M - cx) * depth / fl, uR = (W + M - cx) * depth / fl;
        const sxL = (uL + I.L) / I.mpp, sxR = (uR + I.L) / I.mpp;
        const scale = (W + 2 * M) / (sxR - sxL);
        const cx0 = Math.max(sxL, 0), cx1 = Math.min(sxR, I.canvas.width);
        if (cx1 <= cx0) continue;
        ctx.drawImage(I.canvas, cx0, sy, cx1 - cx0, sh,
                      -M + (cx0 - sxL) * scale, y, (cx1 - cx0) * scale, STEP + 0.1);
      }
      // 遠方の霞
      const hz = ctx.createLinearGradient(0, horY, 0, horY + H * 0.10);
      hz.addColorStop(0, 'rgba(195,217,238,0.9)'); hz.addColorStop(1, 'rgba(195,217,238,0)');
      ctx.fillStyle = hz; ctx.fillRect(-M, horY, W + 2 * M, H * 0.10);
    }

    // ---- 投影ヘルパー（ロール適用済み座標系） ----
    const proj = (x, u) => {
      const rx = x - st.x, ru = u - st.u;
      const fwd = rx * cosP + ru * sinP;
      const lat = -rx * sinP + ru * cosP;
      const depth = fwd * cosT + hM * sinT;
      if (depth < 12 || fwd < 0) return null;
      return { x: cx + fl * lat / depth, y: cy - fl * (fwd * sinT - hM * cosT) / depth, d: depth };
    };

    // ---- 滑走路オーバーレイ（z14衛星では不鮮明なため輪郭を強調） ----
    {
      const HW = 30, L = P.rwLenM;
      const c = [proj(0, -HW), proj(0, HW), proj(L, HW), proj(L, -HW)];
      if (c.every(q => q)) {
        ctx.beginPath();
        ctx.moveTo(c[0].x, c[0].y); c.slice(1).forEach(q => ctx.lineTo(q.x, q.y));
        ctx.closePath();
        ctx.fillStyle = sat ? 'rgba(35,35,40,0.72)' : 'rgba(70,70,70,0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2; ctx.stroke();
        // センターライン
        const m0 = proj(60, 0), m1 = proj(L - 60, 0);
        if (m0 && m1) {
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
          ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.lineTo(m1.x, m1.y); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      const t0 = proj(0, -HW), t1 = proj(0, HW);
      if (t0 && t1) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
      }
    }

    // ---- 残りの飛行経路（マゼンタライン）: 現在位置の少し先から描く ----
    {
      ctx.strokeStyle = 'rgba(224,64,251,0.85)'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      let started = false;
      const ahead = stateAt(P, sTrack + 130);
      const q0 = proj(ahead.x, ahead.u);
      if (q0) { ctx.moveTo(q0.x, q0.y); started = true; }
      for (let i = st.i; i < P.v.length; i++) {
        if (P.v[i].s < sTrack + 130) continue;
        const q = proj(P.v[i].x, P.v[i].u);
        if (!q) { started = false; continue; }
        if (!started) { ctx.moveTo(q.x, q.y); started = true; }
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }

    // ---- マーカー ----
    P.markers.forEach(m => {
      const q = proj(m.x, m.u);
      if (!q) return;
      const r = Math.min(14, Math.max(4, fl * 12 / q.d));
      ctx.save();
      ctx.shadowColor = m.color; ctx.shadowBlur = 8;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x + r, q.y);
      ctx.lineTo(q.x, q.y + r); ctx.lineTo(q.x - r, q.y);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = m.color; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(m.label, q.x, q.y - r - 4);
    });

    // ---- PAPI 4灯（滑走路データの位置・Eye角度で White/Red 切替） ----
    {
      const sideSign = P.papiSide === 'L' ? -1 : 1;
      const dAlong = P.papiM - st.x;                 // 滑走路軸方向の水平距離
      // PAPIビームが見える範囲（前方 かつ 方位 ±約20°）のみ描画
      if (dAlong > 30 && Math.abs(st.u) < dAlong * 0.36) {
        const ang = Math.atan(hM / Math.hypot(dAlong, st.u)) * 180 / Math.PI;
        const nWhite = ang >= 3.5 ? 4 : ang >= 3.17 ? 3 : ang >= 2.83 ? 2 : ang >= 2.5 ? 1 : 0;
        for (let i = 0; i < 4; i++) {              // i=0 が滑走路寄り（内側）
          const q = proj(P.papiM, sideSign * (45 + i * 9));
          if (!q) continue;
          const r = Math.min(9, Math.max(1.5, fl * 1.3 / q.d));
          ctx.save();
          const color = i < nWhite ? '#ffffff' : '#ff1744';
          ctx.shadowColor = color; ctx.shadowBlur = r * 2.5;
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
    }

    ctx.restore();   // ロール解除

    // ---- FPV（飛行経路ベクトル: カメラ中心から固定チルト分上） ----
    const fpv = cy - fl * Math.tan(DTILT);
    ctx.save();
    ctx.strokeStyle = '#76ff03'; ctx.lineWidth = 2;
    ctx.shadowColor = '#76ff03'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.arc(cx, fpv, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 8, fpv); ctx.lineTo(cx - 22, fpv);
    ctx.moveTo(cx + 8, fpv); ctx.lineTo(cx + 22, fpv);
    ctx.moveTo(cx, fpv - 8); ctx.lineTo(cx, fpv - 16);
    ctx.stroke();
    ctx.restore();

    // ---- HUD ----
    const trkTrue = ((psi * 180 / Math.PI) + P.trueHeading + 360) % 360;
    const trkMag = ((trkTrue - P.magVar) + 360) % 360;
    const bankDeg = rollDisp * 180 / Math.PI;
    ctx.fillStyle = 'rgba(0,10,20,0.72)'; ctx.fillRect(8, 8, 190, 110);
    ctx.strokeStyle = '#76ff03'; ctx.lineWidth = 1; ctx.strokeRect(8, 8, 190, 110);
    ctx.fillStyle = '#76ff03'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`ALT  ${Math.round(st.hFt)} ft AGL`, 16, 26);
    ctx.fillText(`GS   ${Math.round(st.gs)} kt   ×${speed}`, 16, 44);
    ctx.fillText(`TRK  ${String(Math.round(trkMag)).padStart(3, '0')}°M`, 16, 62);
    ctx.fillText(`BANK ${Math.abs(bankDeg) < 1 ? '—' : Math.abs(Math.round(bankDeg)) + '° ' + (bankDeg < 0 ? 'L' : 'R')}`, 16, 80);
    // リファレンスVOR: 現在位置の RADIAL / DME を常時表示
    if (P.vorLat != null && P.vorLon != null) {
      const acLat = P.thLat + (st.x * P.cosH - st.u * P.sinH) / 111320;
      const acLon = P.thLon + (st.x * P.sinH + st.u * P.cosH) / (111320 * P.cosLat);
      const radialMag = Math.round(normalizeBearing(
        bearingDeg(P.vorLat, P.vorLon, acLat, acLon) - P.magVar));
      const dme = distanceNM(P.vorLat, P.vorLon, acLat, acLon);
      ctx.fillStyle = '#00e5ff'; ctx.font = 'bold 12px monospace';
      ctx.fillText(`${P.vorIdent}  R-${String(radialMag).padStart(3, '0')} / ${dme.toFixed(1)} DME`, 16, 98);
    }
    ctx.fillStyle = '#80cbc4'; ctx.font = '9px monospace';
    const remToTD = Math.max(0, P.sTD - sTrack);
    const raHud = Math.max(0, Math.round(st.hFt - EYE_GEAR_FT));
    ctx.fillText(`THRまで ${(remToTD / 1852).toFixed(1)}NM   RA ${raHud}ft`, 16, 112);

    // 右上: レグ + 次イベント
    ctx.font = 'bold 12px monospace';
    const nextEv = P.events.find(e => e.s > sTrack + 5);
    const t1txt = `${P.apCode} RWY ${P.rwCode}`;
    const t2txt = `LEG: ${st.leg}`;
    const t3txt = nextEv ? `NEXT: ${nextEv.text} ${Math.round((nextEv.s - sTrack) / Math.max(1, vMs))}s` : '';
    const tw = Math.max(ctx.measureText(t1txt).width, ctx.measureText(t2txt).width, ctx.measureText(t3txt).width) + 20;
    ctx.fillStyle = 'rgba(0,10,20,0.72)'; ctx.fillRect(W - tw - 8, 8, tw, 58);
    ctx.strokeStyle = '#4fc3f7'; ctx.strokeRect(W - tw - 8, 8, tw, 58);
    ctx.fillStyle = '#4fc3f7'; ctx.fillText(t1txt, W - tw + 2, 26);
    ctx.fillStyle = '#ffe082'; ctx.fillText(t2txt, W - tw + 2, 42);
    ctx.fillStyle = '#e040fb'; ctx.fillText(t3txt, W - tw + 2, 58);

    // ---- TIME CHECK カウントダウン（Abeam → Base Turn） ----
    if (P.sAbeam !== null && P.sBaseTurn !== null &&
        sTrack >= P.sAbeam - 1 && sTrack < P.sBaseTurn) {
      const remSec = Math.max(0, (P.sBaseTurn - sTrack) / Math.max(1, vMs));
      const boxW = 200, boxX = cx - boxW / 2;
      ctx.fillStyle = 'rgba(0,10,20,0.80)'; ctx.fillRect(boxX, 8, boxW, 48);
      ctx.strokeStyle = '#ffe082'; ctx.lineWidth = 1.5; ctx.strokeRect(boxX, 8, boxW, 48);
      ctx.fillStyle = '#80cbc4'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('TIME CHECK → BASE TURN', cx, 22);
      ctx.fillStyle = remSec <= 5 ? '#ff5252' : '#ffe082';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(Math.ceil(remSec) + ' s', cx, 48);
    }

    // 衛星読込中
    if (useSat && !sat) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(texBuilding ? '🛰 衛星画像 読込中…（完了後に自動切替）' : '', cx, 70);
    }

    // コールアウト
    if (callout && performance.now() < callout.until) {
      ctx.fillStyle = '#76ff03'; ctx.font = 'bold 34px monospace'; ctx.textAlign = 'center';
      ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      ctx.fillText(callout.text, cx, H * 0.26);
      ctx.restore();
    }
    if (paused) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
      ctx.fillText('⏸ PAUSE', cx, H - 56);
    }
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min((t - lastT) / 1000, 0.1);
    lastT = t;
    const P = path;
    if (!P) { stop(); return; }
    const st = stateAt(P, sTrack);
    if (!paused) sTrack += st.gs * 0.51444 * speed * dt;

    // イベントコールアウト
    P.events.forEach(e => {
      if (!firedEvents.has(e.text + e.s) && sTrack >= e.s) {
        firedEvents.add(e.text + e.s);
        callout = { text: e.text, until: performance.now() + 2200 };
      }
    });

    // RAコールアウト（B747-8F主脚基準の概算）+ FLARE 終了
    const raNow = stateAt(P, sTrack).hFt - EYE_GEAR_FT;
    for (const c of [500, 300, 200, 100, 50, 40]) {
      if (prevRA > c && raNow <= c) callout = { text: String(c), until: performance.now() + 1500 };
    }
    prevRA = raNow;
    if (raNow <= 30 || sTrack >= P.total - 40) {
      callout = { text: 'FLARE', until: performance.now() + 1e9 };
      render();
      stop(false);
      return;
    }
    render();
    raf = requestAnimationFrame(frame);
  }

  function stop(hide) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; running = false; paused = false;
    const pb = el('pv-pause'); if (pb) pb.textContent = '⏸';
    if (hide !== false) { const ov = el('pv-overlay'); if (ov) ov.style.display = 'none'; }
  }

  // デバッグ用: 走行距離を直接設定（コンソールから）
  window._pvSet = m => { sTrack = m; if (!running && path) render(); };
  window._pvInfo = () => path ? {
    sTrack, total: path.total, sTD: path.sTD, sAIM: path.sAIM,
    papiM: path.papiM, papiSide: path.papiSide, rwLenM: path.rwLenM,
    markers: path.markers, events: path.events,
    st: stateAt(path, sTrack),
  } : null;

  function start() {
    path = buildPath();
    if (!path) { alert('サーキット経路を生成できません'); return; }
    sTrack = 0; pitchDisp = 0; rollDisp = 0; callout = null;
    prevRA = 99999;
    firedEvents = new Set();
    if (useSat && (!tex || tex.key !== path.apCode + '_' + path.rwCode || !tex.ready)) {
      tex = null;
      buildTexture(path);
    }
    const ov = el('pv-overlay'); if (ov) ov.style.display = 'flex';
    running = true; paused = false; lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // ---------- 初期化 ----------
  window.addEventListener('load', () => {
    const openBtn = el('pv-open');
    if (openBtn) openBtn.addEventListener('click', start);
    const closeBtn = el('pv-close');
    if (closeBtn) closeBtn.addEventListener('click', () => stop(true));
    const pauseBtn = el('pv-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', () => {
      paused = !paused;
      pauseBtn.textContent = paused ? '▶' : '⏸';
      if (!running && path) {            // 終了後の再生 → 最初から
        start();
      }
    });
    document.querySelectorAll('.pv-sp').forEach(b => b.addEventListener('click', () => {
      speed = parseFloat(b.dataset.sp) || 2;
      document.querySelectorAll('.pv-sp').forEach(x => x.classList.toggle('aim-view-active', x === b));
    }));
    const satBtn = el('pv-sat');
    if (satBtn) satBtn.addEventListener('click', () => {
      useSat = !useSat;
      satBtn.classList.toggle('aim-view-active', useSat);
      if (useSat && path) buildTexture(path);
    });
  });
})();
