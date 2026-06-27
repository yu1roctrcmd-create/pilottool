// ===== グローバル変数 =====
let map, circuitLayer, glideLayer, runwayLayer, vorLayer, vdpLabelLayer, fafMarker, abeamMarker;
let vdpState = null;   // VDPラベルのビューポート追従用
let currentAirport = 'RJAA';
let currentRunway = '16R';

// ===== 地図初期化 =====
function initMap() {
  const airport = AIRPORTS[currentAirport];
  // zoomDelta/zoomSnap を小さくして +/- ボタンの拡大縮小ステップを細かく
  map = L.map('map', { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.25, zoomAnimation: false, wheelPxPerZoomLevel: 120 }).setView(airport.center, 13);
  L.control.zoom({ position: 'topleft' }).addTo(map);

  // 衛星タイル (Esri World Imagery - 無料・APIキー不要)
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
      crossOrigin: true
    }
  ).addTo(map);

  // ラベルオーバーレイ
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { opacity: 0.6, maxZoom: 19 }
  ).addTo(map);

  circuitLayer = L.layerGroup().addTo(map);
  glideLayer   = L.layerGroup().addTo(map);
  runwayLayer  = L.layerGroup().addTo(map);
  vorLayer     = L.layerGroup().addTo(map);
  vdpLabelLayer = L.layerGroup().addTo(map);
  map.on('move zoom zoomend moveend', renderVdpLabel);

  drawRunway();
  updateCircuit();
}

// ===== 滑走路描画 =====
function drawRunway() {
  runwayLayer.clearLayers();
  const airport = AIRPORTS[currentAirport];
  const drawnRunways = new Set();  // 既に描画した対の滑走路を記録

  Object.values(airport.runways).forEach(rwy => {
    // 対になっている滑走路の場合、小さい方だけ描画
    const opposite = rwy.opposite;
    const pairKey = [rwy.name, opposite].sort().join('-');

    if (drawnRunways.has(pairKey)) return;  // 既に描画済みならスキップ
    drawnRunways.add(pairKey);

    // Visual Circuit 用の座標上書き（ZSPD 34L のみ）
    let threshold = rwy.threshold;
    if (currentAirport === 'ZSPD' && rwy.name === '34L') {
      threshold = [31.12643889, 121.82402500];  // Visual Circuit 用座標
    }

    const endPos = destinationPoint(
      threshold[0], threshold[1],
      rwy.drawHeading != null ? rwy.drawHeading : rwy.trueHeading,  // 描画は実滑走路方位
      rwy.length_m / 1852
    );
    L.polyline([threshold, endPos], {
      color: '#ffcc02', weight: 4, opacity: 0.9
    }).addTo(runwayLayer);
    L.marker(threshold, {
      icon: L.divIcon({
        className: '',
        html: `<div style="color:#ffcc02;font-size:11px;font-weight:bold;text-shadow:1px 1px 2px #000">${rwy.name}</div>`,
        iconAnchor: [0, 0]
      })
    }).addTo(runwayLayer);
  });
}

// 接地点(landing threshold) = 物理末端から trueHeading 方向へ displaced_ft 分ずらした点
function landingThreshold(rwy) {
  const dispFt = rwy.displaced_ft || 0;
  if (dispFt === 0) return rwy.threshold;
  return destinationPoint(rwy.threshold[0], rwy.threshold[1],
                          rwy.trueHeading, dispFt / 6076.12);
}

// ===== パラメータ取得 =====
function getParams() {
  const airport = AIRPORTS[currentAirport];
  const rwy = airport.runways[currentRunway];
  return {
    threshold: landingThreshold(rwy),
    physicalThreshold: rwy.threshold,
    displacedFt: rwy.displaced_ft || 0,
    trueHeading: rwy.trueHeading,
    isLeftTraffic: document.getElementById('traffic-dir').value === 'left',
    downwindWidthNM: parseFloat(document.getElementById('dw-width').value),
    downwindSpeedKt: parseFloat(document.getElementById('dw-speed').value),
    baseTurnSpeedKt: parseFloat(document.getElementById('base-speed').value),
    finalTurnSpeedKt: parseFloat(document.getElementById('final-turn-speed').value),
    finalSpeedKt: parseFloat(document.getElementById('final-speed').value),
    upwindSpeedKt: parseFloat(document.getElementById('upwind-speed').value),
    crosswindSpeedKt: parseFloat(document.getElementById('crosswind-speed').value),
    runwayLengthNM: (rwy.length_m || 0) / 1852,
    baseTurnBankDeg: parseFloat(document.getElementById('base-bank').value),
    finalTurnBankDeg: parseFloat(document.getElementById('final-bank').value),
    crosswindTurnBankDeg: parseFloat(document.getElementById('cw-turn-bank').value),
    downwindTurnBankDeg: parseFloat(document.getElementById('dw-turn-bank').value),
    timeCheckSec: parseFloat(document.getElementById('timecheck').value),
    upwindSec: parseFloat(document.getElementById('upwind-sec').value),
    baseTimeSec: parseFloat(document.getElementById('base-time').value),
    downwindWCA: parseFloat(document.getElementById('dw-wca').value),
    baseWCA: parseFloat(document.getElementById('base-wca').value),
    windDir: parseFloat(document.getElementById('wind-dir').value),        // 磁方位で入力
    magVar: parseFloat(document.getElementById('vor-var').value) || 0,     // 磁気偏差(E正/W負)
    windSpeedKt: parseFloat(document.getElementById('wind-speed').value),
    entryType: document.getElementById('entry-type').value,
    directBaseDistNM: parseFloat(document.getElementById('db-dist').value),
    directBaseLegNM: parseFloat(document.getElementById('db-leg').value),
    vorBCourseMag: parseFloat(document.getElementById('vorb-course').value),
    vorBLegNM: parseFloat(document.getElementById('vorb-leg').value),
    vorBPattern: parseFloat(document.getElementById('vorb-pattern').value),
    vorBTurnBankDeg: parseFloat(document.getElementById('vorb-bank').value),
    vorLat: parseFloat(document.getElementById('vor-lat').value),
    vorLon: parseFloat(document.getElementById('vor-lon').value),
    mda: parseFloat(document.getElementById('mda-input').value),
    thr_elev: rwy.tdze
  };
}

// VDPラベルを画面内にクランプして再描画（リーダー線付き）
function renderVdpLabel() {
  if (!vdpLabelLayer) return;
  vdpLabelLayer.clearLayers();
  if (!vdpState || !map) return;
  const size = map.getSize();
  const vPx = map.latLngToContainerPoint(vdpState.pt);
  const tPx = map.latLngToContainerPoint(vdpState.thr);
  // 接地点→VDP方向（外向き）へピクセルオフセット
  let dx = vPx.x - tPx.x, dy = vPx.y - tPx.y;
  const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const off = 75;
  let lx = vPx.x + dx * off, ly = vPx.y + dy * off;
  // ラベルが画面内に収まるようクランプ（ラベル半サイズ＋余白を考慮）
  const halfW = 130, halfH = 34, m = 8;
  lx = Math.max(halfW + m, Math.min(size.x - halfW - m, lx));
  ly = Math.max(halfH + m + 40, Math.min(size.y - halfH - m, ly));  // 上部はツールバー分の余白
  const labelLatLng = map.containerPointToLatLng(L.point(lx, ly));
  // リーダー線
  L.polyline([vdpState.pt, labelLatLng], { color: '#ff9800', weight: 2, opacity: 0.95 }).addTo(vdpLabelLayer);
  // ラベル
  L.marker(labelLatLng, {
    zIndexOffset: 1100, interactive: false,
    icon: L.divIcon({ className: '', html: vdpState.html, iconSize: [0, 0] })
  }).addTo(vdpLabelLayer);
}

// ===== サーキット更新 =====
function updateCircuit() {
  const params = getParams();
  const result = calculateCircuit(params);

  circuitLayer.clearLayers();
  glideLayer.clearLayers();

  // VOR B ラジアル進入レグ
  if (result.radialLegPath && result.radialLegPath.length) {
    L.polyline(result.radialLegPath, {
      color: '#00e5ff', weight: 2.5, dashArray: '10,5'
    }).bindTooltip('VOR ラジアル進入コース', { sticky: true }).addTo(circuitLayer);
  }
  // VOR B 進入ターン（コースリバーサル）
  if (result.entryTurnArc && result.entryTurnArc.length) {
    L.polyline(result.entryTurnArc, {
      color: '#00e5ff', weight: 2.5
    }).bindTooltip('ダウンウィンド進入ターン', { sticky: true }).addTo(circuitLayer);
  }

  // Upwind レグ
  if (result.upwindPath && result.upwindPath.length) {
    L.polyline(result.upwindPath, {
      color: '#ab47bc', weight: 2.5, dashArray: '8,4'
    }).bindTooltip('Upwind', { sticky: true }).addTo(circuitLayer);
  }
  // クロスウィンドターン（90°）
  if (result.crosswindTurnArc && result.crosswindTurnArc.length) {
    L.polyline(result.crosswindTurnArc, {
      color: '#ab47bc', weight: 2.5
    }).bindTooltip('Crosswind Turn', { sticky: true }).addTo(circuitLayer);
  }
  // クロスウィンドレグ
  if (result.crosswindLegPath && result.crosswindLegPath.length) {
    L.polyline(result.crosswindLegPath, {
      color: '#ab47bc', weight: 2.5, dashArray: '8,4'
    }).bindTooltip('Crosswind', { sticky: true }).addTo(circuitLayer);
  }
  // ダウンウィンドターン（90°）
  if (result.downwindTurnArc && result.downwindTurnArc.length) {
    L.polyline(result.downwindTurnArc, {
      color: '#ab47bc', weight: 2.5
    }).bindTooltip('Downwind Turn', { sticky: true }).addTo(circuitLayer);
  }

  // ダウンウィンド
  L.polyline(result.downwindPath, {
    color: '#ef5350', weight: 2.5, dashArray: '8,4'
  }).addTo(circuitLayer);

  // ベースターン弧
  L.polyline(result.baseTurnArc, {
    color: '#ef5350', weight: 2.5
  }).addTo(circuitLayer);

  // ベースレグ（直線）
  if (result.baseLegPath) {
    L.polyline(result.baseLegPath, {
      color: '#ef5350', weight: 2.5
    }).addTo(circuitLayer);
  }

  // ファイナルターン弧
  L.polyline(result.finalTurnArc, {
    color: '#ef5350', weight: 2.5
  }).addTo(circuitLayer);

  // ファイナル
  L.polyline(result.finalPath, {
    color: '#4caf50', weight: 3
  }).addTo(circuitLayer);

  // 延長ファイナル（VDPがパターン外側のとき、ロールアウト点→VDPを点線で表示）
  if (result.extendedFinalPath) {
    L.polyline(result.extendedFinalPath, {
      color: '#4caf50', weight: 2, dashArray: '6,5', opacity: 0.85
    }).bindTooltip('延長ファイナル（VDPはパターン外側）', { sticky: true }).addTo(circuitLayer);
  }

  // 降下開始点 (VDP) マーカー — トラック(サーキット)沿いに fafDistNM の点
  // ＝ ファイナル直線 + 旋回の曲線距離 を足して VDP距離 に達する点
  // VDPのVORラジアル/DMEもラベルに統合表示
  let vdpVorStr = '';
  const vlat = parseFloat(document.getElementById('vor-lat').value);
  const vlon = parseFloat(document.getElementById('vor-lon').value);
  const vmagVar = parseFloat(document.getElementById('vor-var').value) || 0;
  const vIdent = (document.getElementById('vor-ident').value || 'VOR').trim();
  if (!isNaN(vlat) && !isNaN(vlon) && result.vdpOnCircuit) {
    const brg = bearingDeg(vlat, vlon, result.vdpOnCircuit[0], result.vdpOnCircuit[1]);
    const radial = normalizeBearing(brg - vmagVar);
    const dme = distanceNM(vlat, vlon, result.vdpOnCircuit[0], result.vdpOnCircuit[1]);
    vdpVorStr = `<br>${vIdent} R-${pad3(radial)} / ${dme.toFixed(1)} DME`;
  }
  // VDP点での飛行方位(磁方位)
  if (result.vdpHeadingTrue != null) {
    const magHdg = normalizeBearing(result.vdpHeadingTrue - vmagVar);
    vdpVorStr += `<br>HDG ${pad3(magHdg)}°M`;
  }
  if (result.vdpOnCircuit) {
    const vdpPt = result.vdpOnCircuit;
    // VDP実位置のマーカー（はっきり見えるオレンジ菱形＋白縁, 静的）
    L.marker(vdpPt, {
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: '',
        html: `<div style="width:16px;height:16px;background:#ff9800;border:2.5px solid #fff;transform:translate(-50%,-50%) rotate(45deg);box-shadow:0 0 5px #000"></div>`,
        iconSize: [0, 0]
      })
    }).bindTooltip(
      `降下開始点 (VDP) — トラック沿い<br>MDA ${params.mda}ft からここで3°降下開始<br>飛行経路で接地点まで ${result.fafDistNM.toFixed(2)}NM` +
      (result.vdpTrackReached ? '' : '<br><b style="color:#ff5252">※パターン全長より遠い（経路始端に表示）</b>'),
      { direction: 'top' }
    ).addTo(glideLayer);
    // ラベルはビューポート追従（地図移動/ズーム時に画面内へクランプ）
    vdpState = {
      pt: vdpPt,
      thr: params.threshold,
      html: `<div style="display:inline-block;background:#ff8f00;color:#000;font-size:13px;font-weight:bold;padding:3px 8px;border:2px solid #fff;border-radius:4px;white-space:nowrap;text-align:center;line-height:1.4;pointer-events:none;user-select:none;-webkit-user-select:none">▼ 降下開始 ${result.fafDistNM.toFixed(2)}NM(トラック)${vdpVorStr}</div>`
    };
  } else {
    vdpState = null;
  }
  renderVdpLabel();

  // VDP参照ドット（中心線3°パス上, 直線距離基準）
  L.circleMarker(result.fafPos, {
    radius: 4, color: '#fff', fillColor: '#ffb74d', fillOpacity: 0.9, weight: 1.5
  }).bindTooltip('VDP (3°パス/中心線・直線距離基準)', { direction: 'right' }).addTo(glideLayer);

  // Abeam マーカー（ダウンウィンド進入時のみ）
  if (result.abeamPos) {
    L.circleMarker(result.abeamPos, {
      radius: 5, color: '#ffcc02', fillColor: '#ffcc02', fillOpacity: 0.8, weight: 2
    }).bindTooltip('Abeam THR', { permanent: false }).addTo(circuitLayer);
  }

  // ===== 地図上ラベル: 各ターンのバンク角・延長秒数 =====
  const mapLabel = (latlng, text, color, dy = 0) => {
    if (!latlng) return;
    const shift = dy === 0 ? 'translate(-50%,-50%)' : `translate(-50%, calc(-50% + ${dy}px))`;
    L.marker(latlng, {
      interactive: false,
      icon: L.divIcon({
        className: '',
        html: `<div style="transform:${shift};background:rgba(0,0,0,0.6);color:${color};font-size:13px;font-weight:bold;padding:1px 4px;border-radius:3px;white-space:nowrap;box-shadow:0 0 3px #000;pointer-events:none;user-select:none;-webkit-user-select:none">${text}</div>`,
        iconSize: [0, 0]
      })
    }).addTo(circuitLayer);
  };
  const midPt = arr => (arr && arr.length) ? arr[Math.floor(arr.length / 2)] : null;
  const midOf = (a, b) => (a && b) ? [(a[0]+b[0])/2, (a[1]+b[1])/2] : null;
  // 旋回バンク角
  mapLabel(midPt(result.crosswindTurnArc), `CW Turn ${params.crosswindTurnBankDeg}°`, '#ce93d8');
  mapLabel(midPt(result.downwindTurnArc), `DW Turn ${params.downwindTurnBankDeg}°`, '#ce93d8');
  mapLabel(midPt(result.baseTurnArc),     `Base Turn ${params.baseTurnBankDeg}°`,    '#ef9a9a');
  mapLabel(midPt(result.finalTurnArc),    `Final Turn ${params.finalTurnBankDeg}°`,  '#a5d6a7');
  // 延長秒数
  if (params.upwindSec > 0 && result.upwindPath && result.upwindPath.length >= 3) {
    mapLabel(midOf(result.upwindPath[1], result.upwindPath[2]), `Upwind ${params.upwindSec}s`, '#ce93d8');
  }
  // VOR A/B 会合旋回開始点（VORラジアル/DME + バンク角 + 半径）
  if (result.vorBTurnStartPos) {
    const vid = (document.getElementById('vor-ident').value || 'VOR').trim();
    mapLabel(result.vorBTurnStartPos,
      `会合旋回開始 ${vid} R-${pad3(result.vorBRadialNum)} / ${result.vorBTurnDME.toFixed(1)} DME / Bank ${result.vorBTurnBank}° / R ${result.vorBTurnRadius.toFixed(2)}NM`,
      '#00e5ff', 22);
  }
  // LDA W22 フィックスマーカー（DAMBO / BONDO / MX22）
  if (params.entryType === 'ldaW22') {
    const ils = AIRPORTS[currentAirport]?.runways?.[currentRunway]?.ils || {};
    const fixes22 = [
      { key: 'dambo', label: 'DAMBO', tip: 'IKL R-097 / D14.3' },
      { key: 'bondo', label: 'BONDO', tip: 'IKL R-097 / D12.7' },
      { key: 'mx22',  label: 'MX22',  tip: 'IKL R-097 / D1.1'  },
    ];
    fixes22.forEach(({ key, label, tip }) => {
      const f = ils[key];
      if (!f) return;
      L.circleMarker([f.lat, f.lon], {
        radius: 5, color: '#80cbc4', fillColor: '#80cbc4', fillOpacity: 0.9, weight: 2
      }).bindTooltip(`${label} (${tip})`, { permanent: false }).addTo(circuitLayer);
      mapLabel([f.lat, f.lon], label, '#80cbc4');
    });
  }
  // LDA W23 フィックスマーカー（DAMBO / MX23）
  if (params.entryType === 'ldaW23') {
    const ils = AIRPORTS[currentAirport]?.runways?.[currentRunway]?.ils || {};
    const fixes23 = [
      { key: 'dambo', label: 'DAMBO', tip: 'ITL R-097 / D14.5' },
      { key: 'mx23',  label: 'MX23',  tip: 'ITL R-097 / D4.9'  },
    ];
    fixes23.forEach(({ key, label, tip }) => {
      const f = ils[key];
      if (!f) return;
      L.circleMarker([f.lat, f.lon], {
        radius: 5, color: '#80cbc4', fillColor: '#80cbc4', fillOpacity: 0.9, weight: 2
      }).bindTooltip(`${label} (${tip})`, { permanent: false }).addTo(circuitLayer);
      mapLabel([f.lat, f.lon], label, '#80cbc4');
    });
  }
  // LDA 予想高度ラベル（フィックス直上 / Final会合点）
  if (params.entryType === 'ldaW22' || params.entryType === 'ldaW23') {
    const isW22 = params.entryType === 'ldaW22';
    const tdze    = isW22 ? 35 : 55;                   // ft (AIP RJTT AD2.12)
    const ftPerNM = 6076.12 * Math.tan(3.0 * Math.PI / 180);

    if (isW22) {
      // IKL直上: 5481m(2.960NM) from THR
      const iklAlt = Math.round(tdze + (5481 / 1852) * ftPerNM);
      mapLabel([35.603825, 139.818981], `IKL 予想高度 ${iklAlt}ft MSL`, '#ffcc80', -22);
    } else {
      // MX23直上: RWY23 THRから3.448NM
      const mx23Alt = Math.round(tdze + 3.448 * ftPerNM);
      const mx23 = AIRPORTS[currentAirport]?.runways?.[currentRunway]?.ils?.mx23;
      if (mx23) mapLabel([mx23.lat, mx23.lon], `MX23 予想高度 ${mx23Alt}ft MSL`, '#ffcc80', -22);
    }

    if (result.ldaRolloutDistNM > 0) {
      const mergeAlt = Math.round(tdze + result.ldaRolloutDistNM * ftPerNM);
      const mergePos = result.finalPath && result.finalPath.length ? result.finalPath[0] : null;
      if (mergePos) mapLabel(mergePos, `Final会合 予想高度 ${mergeAlt}ft MSL`, '#ffcc80', 22);
    }
  }
  if (params.timeCheckSec > 0) {
    mapLabel(midOf(result.abeamPos, result.baseTurnStartPos), `T/C ${params.timeCheckSec}s`, '#ef9a9a');
  }
  if (params.baseTimeSec > 0 && result.baseLegPath && result.baseLegPath.length) {
    mapLabel(midOf(result.baseLegPath[0], result.baseLegPath[result.baseLegPath.length-1]), `Base ${params.baseTimeSec}s`, '#ef9a9a');
  }

  // ===== 各レグの HDG/TRK ラベル（磁方位, トグルON時のみ）=====
  const showHT = document.getElementById('show-hdgtrk');
  if (result.windInfo && result.windInfo.legs && (!showHT || showHT.checked)) {
    const mvar = parseFloat(document.getElementById('vor-var').value) || 0;
    const toMag = d => pad3(((d - mvar) % 360 + 360) % 360);
    const htLabel = (path, leg) => {
      if (!path || !path.length || !leg) return;
      const mid = path.length >= 2
        ? midOf(path[0], path[path.length - 1])
        : path[0];
      mapLabel(mid, `HDG ${toMag(leg.fhdg)}/TRK ${toMag(leg.hdg)}`, '#b3e5fc');
    };
    const L2 = result.windInfo.legs;
    htLabel(result.upwindPath,      L2.upwind);
    htLabel(result.crosswindLegPath, L2.crosswind);
    htLabel(result.downwindPath,    L2.downwind);
    htLabel(result.baseLegPath,     L2.base);
    htLabel(result.finalPath,       L2.final);
  }

  // 3° グライドパスライン（FAF〜接地点）
  const gpLine = result.glidepathPoints.map(p => p.pos);
  L.polyline(gpLine, {
    color: '#76ff03', weight: 2, dashArray: '4,4', opacity: 0.8
  }).addTo(glideLayer);

  // 接地点(displaced threshold) マーカー — 変位がある場合のみ
  if (params.displacedFt > 0) {
    L.circleMarker(params.threshold, {
      radius: 5, color: '#ff4081', fillColor: '#ff4081', fillOpacity: 0.9, weight: 2
    }).bindTooltip(
      `接地点 (Displaced THR)<br>変位: ${params.displacedFt}ft (${(params.displacedFt/6076.12*1852).toFixed(0)}m)`,
      { permanent: false, direction: 'right' }
    ).addTo(glideLayer);
  }

  // MDA 結果表示
  document.getElementById('mda-result').textContent =
    `降下開始点(VDP): 接地点まで ${result.fafDistNM.toFixed(2)} NM | MDA高度差 ${Math.round(result.heightAboveThr)} ft`;

  // 風・GS情報の表示
  updateWindInfo(result.windInfo);

  // VORリファレンス描画
  updateVOR(result);

  // プロファイル描画
  drawProfile(params, result);
}

// エントリー種別ごとのデフォルト値プリセット（downwind / circling）
function applyEntryDefaults(type) {
  const lblEl = document.getElementById('mda-label');
  if (type !== 'downwind' && type !== 'circling') {
    if (lblEl) lblEl.textContent = 'MDA (ft MSL)';
    return;
  }
  const tdze = (AIRPORTS[currentAirport].runways[currentRunway] || {}).tdze || 0;
  const isPattern = type === 'downwind';
  const set = (id, val, suffix) => {
    const el = document.getElementById(id); if (!el) return;
    el.value = val;
    const badge = document.getElementById(id + '-val');
    if (badge) badge.textContent = val + (suffix || '');
  };
  // 速度160kt一律
  ['dw-speed','base-speed','final-turn-speed','final-speed','upwind-speed','crosswind-speed']
    .forEach(id => set(id, 160, 'kt'));
  set('dw-width', isPattern ? 2.5 : 1.5, 'nm');
  set('upwind-sec', 15, 's');
  set('timecheck', isPattern ? 35 : 20, 's');
  // 高度: Pattern Altitude(TDZE+1500, 標準のみ100ft切り下げ) / MDA(TDZE+700)
  let alt = tdze + (isPattern ? 1500 : 700);
  if (isPattern) alt = Math.floor(alt / 100) * 100;   // 100ft単位でRound Down
  document.getElementById('mda-input').value = alt;
  const lbl = document.getElementById('mda-label');
  if (lbl) lbl.textContent = isPattern ? 'Pattern Altitude (ft MSL)' : 'MDA (ft MSL)';
}

// 空港プリセットのVORを入力欄へ反映（無ければクリア）
function applyAirportVOR() {
  const ap = AIRPORTS[currentAirport];
  const vor = ap.vor;
  document.getElementById('vor-ident').value = vor ? vor.ident : '';
  document.getElementById('vor-lat').value   = vor ? vor.lat : '';
  document.getElementById('vor-lon').value   = vor ? vor.lon : '';
  // 磁気偏差: VOR優先、無ければ空港レベルのmagVar、無ければ0
  document.getElementById('vor-var').value   = vor ? vor.magVar : (ap.magVar != null ? ap.magVar : 0);
}

// ===== 最適バンク角を適用 =====
function applyOptimalBanks() {
  const wi = calculateCircuit(getParams()).windInfo;
  // バンク角スライダーは整数(step=1, 範囲5〜45)。提案値を丸めてクランプ
  const clamp = v => Math.max(5, Math.min(45, Math.round(v)));
  const setBank = (id, val, valId) => {
    const el = document.getElementById(id);
    el.value = clamp(val);
    document.getElementById(valId).textContent = el.value + '°';
  };
  setBank('base-bank', wi.proposedBaseBank, 'base-bank-val');
  setBank('final-bank', wi.proposedFinalBank, 'final-bank-val');
  setBank('cw-turn-bank', wi.proposedCrosswindTurnBank, 'cw-turn-bank-val');
  setBank('dw-turn-bank', wi.proposedDownwindTurnBank, 'dw-turn-bank-val');
  updateCircuit();
}

// ===== 風・GS 情報表示 =====
function updateWindInfo(wi) {
  const el = document.getElementById('wind-comp');
  if (!el || !wi) return;
  const bankLine =
    `<span style="color:#ffd54f">最適バンク角（中心線/幅に整列）<br>` +
    `&nbsp;Crosswind Turn: <b>${wi.proposedCrosswindTurnBank}°</b> / Downwind Turn: <b>${wi.proposedDownwindTurnBank}°</b>（各R=幅/2）<br>` +
    `&nbsp;Base Turn: <b>${wi.proposedBaseBank}°</b> / Final Turn: <b>${wi.proposedFinalBank}°</b>（各R=${wi.targetRbf}NM）</span>`;
  const windy = wi.windSpeedKt > 0;
  const magVar = parseFloat(document.getElementById('vor-var').value) || 0;
  const M = d => pad3(((d - magVar) % 360 + 360) % 360);   // 真→磁
  const windHdr = windy
    ? `<span style="color:#80cbc4">風: 磁${pad3(wi.windDirMag)}°/${wi.windSpeedKt}kt → 真${pad3(wi.windDirTrue)}°</span><br>`
    : `<span style="color:#80cbc4">無風（GS = TAS, HDG = TRK）</span><br>`;
  const fmt = (label, l) => {
    let s = `${label}: HDG ${M(l.fhdg)}°(TRK ${M(l.hdg)}°) GS ${l.gs}kt`;
    if (windy) {
      const hw = l.head >= 0 ? `H${l.head}` : `T${-l.head}`;
      const xw = l.cross >= 0 ? `R${l.cross}` : `L${-l.cross}`;
      s += ` [${hw}/${xw}]`;
    }
    return s;
  };
  const L = wi.legs;
  el.innerHTML =
    windHdr +
    `${fmt('Upwind', L.upwind)}<br>` +
    `${fmt('Crosswind', L.crosswind)}<br>` +
    `${fmt('Downwind', L.downwind)}<br>` +
    `${fmt('Base', L.base)}<br>` +
    `${fmt('滑走路/Final', L.final)}<br>` +
    `<span style="color:#9fa8da">旋回半径(GS考慮): Base ${wi.R_base.toFixed(2)}NM / Final ${wi.R_final.toFixed(2)}NM</span><br>` +
    bankLine;
}

// ===== VOR リファレンス =====
function updateVOR(result) {
  vorLayer.clearLayers();
  const refEl = document.getElementById('vor-ref');
  const lat = parseFloat(document.getElementById('vor-lat').value);
  const lon = parseFloat(document.getElementById('vor-lon').value);
  const ident = (document.getElementById('vor-ident').value || 'VOR').trim();
  const magVar = parseFloat(document.getElementById('vor-var').value) || 0;  // E正

  if (isNaN(lat) || isNaN(lon)) {
    refEl.innerHTML = '緯度経度を入力するとラジアル/DMEを表示';
    return;
  }

  // LDA W22 は IKL 基準、LDA W23 は ITL 基準（回路計算は IKL/MX23 を維持）
  const entryTypeForVor = document.getElementById('entry-type').value;
  let dispLat = lat, dispLon = lon, dispIdent = ident, dispMagVar = magVar;
  if (currentAirport === 'RJTT' && entryTypeForVor === 'ldaW23') {
    const itl = AIRPORTS[currentAirport]?.runways?.['23']?.ils?.loc || {};
    if (itl.lat) { dispLat = itl.lat; dispLon = itl.lon; dispIdent = itl.ident || 'ITL'; dispMagVar = AIRPORTS[currentAirport].vor?.magVar ?? -7.5; }
  }
  const vorPos = [dispLat, dispLon];

  // VOR マーカー（コンパスローズ風）
  const vorIcon = L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-50%);text-align:center">
             <div style="width:18px;height:18px;border:2px solid #00e5ff;border-radius:50%;box-shadow:0 0 4px #000;display:flex;align-items:center;justify-content:center">
               <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:8px solid #00e5ff"></div>
             </div>
             <div style="color:#00e5ff;font-size:10px;font-weight:bold;text-shadow:1px 1px 2px #000;margin-top:1px;white-space:nowrap">${dispIdent}</div>
           </div>`,
    iconSize: [0, 0]
  });
  L.marker(vorPos, { icon: vorIcon }).bindTooltip(
    `${dispIdent}<br>${dispLat.toFixed(4)}, ${dispLon.toFixed(4)}`, { direction: 'top' }
  ).addTo(vorLayer);

  // 各基準点: ラジアル(磁方位) + DME
  const isDB = document.getElementById('entry-type').value === 'directBase';
  const cwStart = result.downwindTurnStartPos || null;
  const dwStart = (result.crosswindLegPath && result.crosswindLegPath.length > 0)
    ? result.crosswindLegPath[result.crosswindLegPath.length - 1] : null;
  const targets = [
    ...(cwStart ? [{ name: 'CW Turn開始', pos: cwStart, color: '#66bb6a' }] : []),
    ...(dwStart ? [{ name: 'DW Turn開始', pos: dwStart, color: '#ce93d8' }] : []),
    { name: isDB ? 'Base進入開始' : 'Base Turn開始', pos: result.baseTurnStartPos, color: '#ef5350' },
    { name: 'VDP (降下開始/トラック)', pos: result.vdpOnCircuit || result.vdpOnFinal, color: '#ff9800', vdp: true },
    { name: 'Final Turn開始', pos: result.finalTurnStartPos, color: '#26c6da' },
  ];

  let html = `<b style="color:#00e5ff">${dispIdent}</b> 基準<br>`;
  targets.forEach(t => {
    if (!t.pos) return;
    const trueBrg = bearingDeg(vorPos[0], vorPos[1], t.pos[0], t.pos[1]);
    const radial = normalizeBearing(trueBrg - dispMagVar);   // 磁方位ラジアル
    const dme = distanceNM(vorPos[0], vorPos[1], t.pos[0], t.pos[1]);

    // VORから基準点へのラジアル線（VDPははっきり太く）
    L.polyline([vorPos, t.pos], t.vdp
      ? { color: '#ff9800', weight: 2.5, dashArray: '7,5', opacity: 1 }
      : { color: t.color, weight: 1.5, dashArray: '2,4', opacity: 0.7 }
    ).addTo(vorLayer);
    // ラベル: VDPは降下開始オレンジラベルに統合表示するので地図ラベルは省略
    if (!t.vdp) {
      L.marker(t.pos, {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(8px,-50%);color:${t.color};text-shadow:1px 1px 2px #000;font-size:10px;font-weight:bold;white-space:nowrap;user-select:none;-webkit-user-select:none">R-${pad3(radial)}/${dme.toFixed(1)}</div>`,
          iconSize: [0, 0]
        })
      }).addTo(vorLayer);
    }

    html += `<span style="color:${t.color}">●</span> ${t.name}: <b>R-${pad3(radial)}</b> / ${dme.toFixed(1)} DME<br>`;
  });

  // LDA W22/W23 (RJTT): TTE を追加基準として表示
  const entryType = document.getElementById('entry-type').value;
  const isLdaRJTT = currentAirport === 'RJTT' && (entryType === 'ldaW22' || entryType === 'ldaW23');
  if (isLdaRJTT) {
    const ttVor = AIRPORTS[currentAirport].vor;  // TTE
    if (ttVor) {
      const ttePos = [ttVor.lat, ttVor.lon];
      // TTE VOR マーカー（水色細め）
      L.marker(ttePos, {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(-50%,-50%);text-align:center">
                   <div style="width:14px;height:14px;border:2px solid #80deea;border-radius:50%;display:flex;align-items:center;justify-content:center">
                     <div style="width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-bottom:6px solid #80deea"></div>
                   </div>
                   <div style="color:#80deea;font-size:9px;font-weight:bold;text-shadow:1px 1px 2px #000;margin-top:1px">TTE</div>
                 </div>`,
          iconSize: [0, 0]
        })
      }).addTo(vorLayer);
      html += `<b style="color:#80deea">TTE 基準</b><br>`;
      targets.forEach(t => {
        if (!t.pos) return;
        const trueBrg = bearingDeg(ttePos[0], ttePos[1], t.pos[0], t.pos[1]);
        const radial = normalizeBearing(trueBrg - ttVor.magVar);
        const dme = distanceNM(ttePos[0], ttePos[1], t.pos[0], t.pos[1]);
        // TTE→基準点 ラジアル線（細い破線）
        L.polyline([ttePos, t.pos], { color: '#80deea', weight: 1, dashArray: '3,5', opacity: 0.5 }).addTo(vorLayer);
        html += `<span style="color:${t.color}">●</span> ${t.name}: <b>R-${pad3(radial)}</b> / ${dme.toFixed(1)} DME<br>`;
      });
    }
  }

  // アプローチフィックス描画（RJFR/RJTT VOR A/B 選択時）
  const apApproach = AIRPORTS[currentAirport]?.approaches?.[entryType];
  if (apApproach && apApproach.fixes) {
    html += `<b style="color:#00bcd4">${apApproach.label} フィックス</b><br>`;
    apApproach.fixes.forEach(fix => {
      const trueBrg = bearingDeg(vorPos[0], vorPos[1], fix.lat, fix.lon);
      const radial = normalizeBearing(trueBrg - dispMagVar);
      const dme = distanceNM(vorPos[0], vorPos[1], fix.lat, fix.lon);
      // VOR→フィックス ラジアル線
      L.polyline([vorPos, [fix.lat, fix.lon]], {
        color: '#00bcd4', weight: 1.5, dashArray: '6,4', opacity: 0.85
      }).addTo(vorLayer);
      // フィックスマーカー（四角）
      L.marker([fix.lat, fix.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(-50%,-50%);width:10px;height:10px;border:2px solid #00bcd4;background:#0a1628;box-shadow:0 0 3px #000"></div>`,
          iconSize: [0, 0]
        })
      }).addTo(vorLayer);
      // フィックスラベル
      L.marker([fix.lat, fix.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(8px,-50%);color:#00bcd4;text-shadow:1px 1px 2px #000;font-size:10px;font-weight:bold;white-space:nowrap;user-select:none;-webkit-user-select:none">${fix.ident}<br><span style="font-weight:normal;font-size:9px">R-${pad3(radial)}/${dme.toFixed(1)}</span></div>`,
          iconSize: [0, 0]
        })
      }).addTo(vorLayer);
      html += `<span style="color:#00bcd4">◆</span> ${fix.ident} (${fix.role}): <b>R-${pad3(radial)}</b> / ${dme.toFixed(1)} DME<br>`;
    });
  }

  refEl.innerHTML = html;
}

function pad3(deg) {
  const r = Math.round(deg) % 360;
  return String(r === 0 ? 360 : r).padStart(3, '0');
}

// ===== 高度プロファイル =====
function drawProfile(params, result) {
  const canvas = document.getElementById('profile-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const W = canvas.width, H = canvas.height;
  const pad = { top: 15, right: 20, bottom: 30, left: 50 };

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, W, H);

  const maxDist = Math.max(result.fafDistNM * 1.3, 3);
  const maxAlt  = Math.max(params.mda * 1.3, params.thr_elev + 500, 2000);
  const minAlt  = Math.max(0, params.thr_elev - 100);

  const xScale = d => pad.left + (d / maxDist) * (W - pad.left - pad.right);
  const yScale = a => H - pad.bottom - ((a - minAlt) / (maxAlt - minAlt)) * (H - pad.top - pad.bottom);

  // グリッド
  ctx.strokeStyle = '#1a3050';
  ctx.lineWidth = 1;
  for (let d = 0; d <= maxDist; d += 0.5) {
    ctx.beginPath(); ctx.moveTo(xScale(d), pad.top); ctx.lineTo(xScale(d), H - pad.bottom); ctx.stroke();
  }
  for (let a = 0; a <= maxAlt; a += 500) {
    ctx.beginPath(); ctx.moveTo(pad.left, yScale(a)); ctx.lineTo(W - pad.right, yScale(a)); ctx.stroke();
  }

  // 軸ラベル
  ctx.fillStyle = '#607d8b';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  for (let d = 0; d <= maxDist; d += 0.5) {
    ctx.fillText(d.toFixed(1), xScale(d), H - pad.bottom + 12);
  }
  ctx.textAlign = 'right';
  for (let a = 0; a <= maxAlt; a += 500) {
    ctx.fillText(a, pad.left - 4, yScale(a) + 3);
  }
  ctx.fillStyle = '#4fc3f7';
  ctx.textAlign = 'center';
  ctx.fillText('距離 (NM)', W / 2, H - 2);
  ctx.save();
  ctx.translate(12, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('高度 (ft)', 0, 0);
  ctx.restore();

  // 地面
  ctx.fillStyle = '#2e4a2e';
  ctx.fillRect(pad.left, yScale(params.thr_elev), W - pad.left - pad.right, H - pad.bottom - yScale(params.thr_elev));

  // 3° グライドパス
  ctx.beginPath();
  ctx.strokeStyle = '#76ff03';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 100; i++) {
    const d = (i / 100) * maxDist;
    const alt = params.thr_elev + distToAltFt(d);
    if (i === 0) ctx.moveTo(xScale(d), yScale(alt));
    else ctx.lineTo(xScale(d), yScale(alt));
  }
  ctx.stroke();

  // MDA ライン
  ctx.beginPath();
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 3]);
  ctx.moveTo(pad.left, yScale(params.mda));
  ctx.lineTo(W - pad.right, yScale(params.mda));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ff9800';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`MDA ${params.mda}ft`, pad.left + 4, yScale(params.mda) - 3);

  // 降下開始点(VDP) 縦線
  ctx.beginPath();
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.moveTo(xScale(result.fafDistNM), pad.top);
  ctx.lineTo(xScale(result.fafDistNM), H - pad.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ff9800';
  ctx.textAlign = 'center';
  ctx.fillText(`▼降下開始 ${result.fafDistNM.toFixed(1)}NM`, xScale(result.fafDistNM), pad.top - 3);

  // TDZE ライン
  ctx.beginPath();
  ctx.strokeStyle = '#ffcc02';
  ctx.lineWidth = 1;
  ctx.moveTo(pad.left, yScale(params.thr_elev));
  ctx.lineTo(W - pad.right, yScale(params.thr_elev));
  ctx.stroke();
  ctx.fillStyle = '#ffcc02';
  ctx.textAlign = 'right';
  ctx.fillText(`TDZE ${params.thr_elev}ft`, W - pad.right - 2, yScale(params.thr_elev) - 3);
}

// ===== スライダーのラベル更新 =====
function bindSlider(id, displayId, suffix) {
  const el = document.getElementById(id);
  const disp = document.getElementById(displayId);
  el.addEventListener('input', () => {
    disp.textContent = el.value + suffix;
    updateCircuit();
  });
}

// ===== オフラインキャッシュ =====
function cacheTiles() {
  const btn = document.getElementById('cache-btn');
  btn.disabled = true;
  btn.textContent = '⏳ キャッシュ中...';

  const tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
  const labelUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile';

  // すべての空港のタイルをプリフェッチ
  let total = 0;
  let completed = 0;
  Object.values(AIRPORTS).forEach(airport => {
    for (let z = 10; z <= 14; z++) {
      const x = Math.floor((airport.center[1] + 180) / 360 * Math.pow(2, z));
      const y = Math.floor((1 - Math.log(Math.tan(airport.center[0] * Math.PI / 180) + 1 / Math.cos(airport.center[0] * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
      total += 2;
      fetch(`${tileUrl}/${z}/${y}/${x}`).finally(() => {
        completed++;
        btn.textContent = `⏳ ${completed}/${total}`;
      }).catch(() => {});
      fetch(`${labelUrl}/${z}/${y}/${x}`).catch(() => {});
    }
  });

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = '✅ キャッシュ完了';
    setTimeout(() => { btn.textContent = '📥 タイルキャッシュ'; }, 2000);
  }, 3000);
}

// ===== 空港・滑走路変更 =====
function onAirportChange() {
  currentAirport = document.getElementById('airport-sel').value;
  const airport = AIRPORTS[currentAirport];
  const rwySelect = document.getElementById('runway-sel');
  rwySelect.innerHTML = '';
  Object.keys(airport.runways).forEach(k => {
    const opt = document.createElement('option');
    const rwy = airport.runways[k];
    opt.value = k;
    // disabled フラグがある場合は B747-8F 使用不可の表示を追加
    opt.textContent = rwy.disabled ? k + ' (B747-8F 使用不可)' : k;
    if (rwy.disabled) opt.disabled = true;
    rwySelect.appendChild(opt);
  });
  currentRunway = Object.keys(airport.runways)[0];
  applyAirportVOR();
  updateTrafficDirAvailability();
  updateVorBAvailability();
  refreshPatternAltitude();
  map.setView(airport.center, 13);
  drawRunway();
  updateCircuit();
}

// 標準/サークリング時、現在のTDZEからPattern Altitude/MDAを再計算
function refreshPatternAltitude() {
  const t = document.getElementById('entry-type').value;
  if (t !== 'downwind' && t !== 'circling') return;
  const tdze = (AIRPORTS[currentAirport].runways[currentRunway] || {}).tdze || 0;
  const isPattern = t === 'downwind';
  let alt = tdze + (isPattern ? 1500 : 700);
  if (isPattern) alt = Math.floor(alt / 100) * 100;
  document.getElementById('mda-input').value = alt;
}

// 滑走路の trafficDir に応じて許可方向のみ表示・強制セット
function updateTrafficDirAvailability() {
  const rwy = AIRPORTS[currentAirport]?.runways?.[currentRunway];
  const dir = rwy?.trafficDir;   // 'left' | 'right' | undefined(両方可)
  const sel = document.getElementById('traffic-dir');
  const optLeft  = sel.querySelector('option[value="left"]');
  const optRight = sel.querySelector('option[value="right"]');
  if (optLeft)  optLeft.hidden  = dir === 'right';
  if (optRight) optRight.hidden = dir === 'left';
  if (dir && sel.value !== dir) sel.value = dir;
}

// VOR A は RJTT 16L または RJFR、VOR B は RJFR または RJTT、LDA W22/23 は RJTT 限定
function updateVorBAvailability() {
  const et = document.getElementById('entry-type');
  const optB = et.querySelector('option[value="vorB"]');
  const optA = et.querySelector('option[value="vorA"]');
  const optLDA22 = et.querySelector('option[value="ldaW22"]');
  const optLDA23 = et.querySelector('option[value="ldaW23"]');
  const isKKJ = currentAirport === 'RJFR';
  const isHND = currentAirport === 'RJTT';
  const isRwy16 = isHND && currentRunway === '16L';
  const isRwy22 = isHND && currentRunway === '22';
  const isRwy23 = isHND && currentRunway === '23';
  const vorBOk = isKKJ;                    // RJFR のみ
  const vorAOk = isHND || isKKJ;           // RJTT 全RWY OR RJFR
  if (optB) optB.hidden = !vorBOk;
  if (optA) optA.hidden = !vorAOk;
  if (optLDA22) optLDA22.hidden = !isRwy22;
  if (optLDA23) optLDA23.hidden = !isRwy23;
  if ((et.value === 'vorB' && !vorBOk) || (et.value === 'vorA' && !vorAOk) || (et.value === 'ldaW22' && !isRwy22) || (et.value === 'ldaW23' && !isRwy23)) {
    et.value = 'downwind';
    document.getElementById('vorb-course-row').style.display = 'none';
    document.getElementById('direct-base-row').style.display = 'none';
    applyEntryDefaults('downwind');
  }
}

function onRunwayChange() {
  currentRunway = document.getElementById('runway-sel').value;
  const rwy = AIRPORTS[currentAirport].runways[currentRunway];
  refreshPatternAltitude();
  updateTrafficDirAvailability();
  updateVorBAvailability();
  map.setView(rwy.threshold, 14);
  updateCircuit();
}

// ===== 初期化 =====
window.addEventListener('load', () => {
  initMap();
  applyAirportVOR();
  updateTrafficDirAvailability();
  updateVorBAvailability();
  applyEntryDefaults(document.getElementById('entry-type').value);
  updateCircuit();

  // スライダーバインド
  bindSlider('dw-width', 'dw-width-val', 'nm');
  bindSlider('dw-speed', 'dw-speed-val', 'kt');
  bindSlider('base-speed', 'base-speed-val', 'kt');
  bindSlider('final-turn-speed', 'final-turn-speed-val', 'kt');
  bindSlider('final-speed', 'final-speed-val', 'kt');
  bindSlider('upwind-speed', 'upwind-speed-val', 'kt');
  bindSlider('crosswind-speed', 'crosswind-speed-val', 'kt');
  bindSlider('base-bank', 'base-bank-val', '°');
  bindSlider('final-bank', 'final-bank-val', '°');
  bindSlider('cw-turn-bank', 'cw-turn-bank-val', '°');
  bindSlider('dw-turn-bank', 'dw-turn-bank-val', '°');
  bindSlider('base-time', 'base-time-val', 's');
  bindSlider('timecheck', 'timecheck-val', 's');
  bindSlider('upwind-sec', 'upwind-sec-val', 's');
  document.getElementById('wind-dir').addEventListener('input', updateCircuit);
  document.getElementById('wind-speed').addEventListener('input', updateCircuit);
  bindSlider('dw-wca', 'dw-wca-val', '°');
  bindSlider('base-wca', 'base-wca-val', '°');

  document.getElementById('traffic-dir').addEventListener('change', updateCircuit);
  bindSlider('db-dist', 'db-dist-val', 'nm');
  bindSlider('db-leg', 'db-leg-val', 'nm');
  bindSlider('vorb-leg', 'vorb-leg-val', 'nm');
  bindSlider('vorb-bank', 'vorb-bank-val', '°');
  document.getElementById('vorb-course').addEventListener('input', updateCircuit);
  document.getElementById('vorb-pattern').addEventListener('change', updateCircuit);
  document.getElementById('entry-type').addEventListener('change', () => {
    const t = document.getElementById('entry-type').value;
    document.getElementById('direct-base-row').style.display = t === 'directBase' ? '' : 'none';
    const isLDA = t === 'ldaW22' || t === 'ldaW23';
    document.getElementById('vorb-course-row').style.display = (t === 'vorB' || t === 'vorA' || isLDA) ? '' : 'none';
    const courseLabel = document.getElementById('course-row-label');
    if (courseLabel) courseLabel.textContent = isLDA ? `LDA ${t === 'ldaW22' ? 'W22' : 'W23'} 進入コース（磁方位）` : (t === 'vorA' ? 'VOR A 進入コース（磁方位）' : 'VOR B 進入コース（磁方位）');
    const patternSection = document.getElementById('vorb-pattern-section');
    if (patternSection) patternSection.style.display = isLDA ? 'none' : '';
    if (isLDA) {
      const ils = AIRPORTS[currentAirport]?.runways?.[currentRunway]?.ils || {};
      if (t === 'ldaW22') {
        // LDA W22: 旋回基点 = IKL（LOC位置）、DAMBO(D14.3 IKL)までtrack
        const loc = ils.loc || {};
        document.getElementById('vor-ident').value = loc.ident || 'IKL';
        document.getElementById('vor-lat').value   = loc.lat   || 35.603825;
        document.getElementById('vor-lon').value   = loc.lon   || 139.818981;
        document.getElementById('vor-var').value   = -7.5;
        const courseEl = document.getElementById('vorb-course');
        courseEl.value = loc.course_mag || 277;
        const badge = document.getElementById('vorb-course-val');
        if (badge) badge.textContent = courseEl.value;
        const legEl = document.getElementById('vorb-leg');
        const legBadge = document.getElementById('vorb-leg-val');
        if (legEl) legEl.value = 14.3;
        if (legBadge) legBadge.textContent = '14.3nm';
      } else {
        // LDA W23: 旋回基点 = MX23（通過後Left Turn）、DAMBO(D9.6 MX23)までtrack
        const mx23 = ils.mx23 || {};
        document.getElementById('vor-ident').value = 'MX23';
        document.getElementById('vor-lat').value   = mx23.lat || 35.570219;
        document.getElementById('vor-lon').value   = mx23.lon || 139.882588;
        document.getElementById('vor-var').value   = -7.5;
        const courseEl = document.getElementById('vorb-course');
        courseEl.value = 277;
        const badge = document.getElementById('vorb-course-val');
        if (badge) badge.textContent = courseEl.value;
        const legEl = document.getElementById('vorb-leg');
        const legBadge = document.getElementById('vorb-leg-val');
        if (legEl) legEl.value = 9.6;
        if (legBadge) legBadge.textContent = '9.6nm';
      }
    } else if ((currentAirport === 'RJFR' || currentAirport === 'RJTT') && (t === 'vorB' || t === 'vorA')) {
      // RJFR/RJTT VOR A/B: 空港VORを復元してコース/レグをオートセット
      applyAirportVOR();  // LDA 等で VOR が変わっていた場合にリセット
      const approach = AIRPORTS[currentAirport]?.approaches?.[t];
      if (approach) {
        const courseEl = document.getElementById('vorb-course');
        courseEl.value = approach.courseMag;
        const badge = document.getElementById('vorb-course-val');
        if (badge) badge.textContent = approach.courseMag;
        const legEl = document.getElementById('vorb-leg');
        const legBadge = document.getElementById('vorb-leg-val');
        if (legEl) legEl.value = approach.legNM;
        if (legBadge) legBadge.textContent = approach.legNM + 'nm';
      }
    }
    applyEntryDefaults(t);
    updateCircuit();
  });
  document.getElementById('mda-input').addEventListener('input', updateCircuit);
  document.getElementById('mda-input').addEventListener('change', updateCircuit);
  ['vor-ident', 'vor-lat', 'vor-lon', 'vor-var'].forEach(id =>
    document.getElementById(id).addEventListener('input', updateCircuit));
  document.getElementById('airport-sel').addEventListener('change', onAirportChange);
  document.getElementById('runway-sel').addEventListener('change', onRunwayChange);
  document.getElementById('cache-btn').addEventListener('click', cacheTiles);
  document.getElementById('apply-bank-btn').addEventListener('click', applyOptimalBanks);
  document.getElementById('show-hdgtrk').addEventListener('change', updateCircuit);
  document.getElementById('pdf-btn').addEventListener('click', () => {
    // 印刷直前に地図サイズを再計算してから印刷ダイアログ（ブラウザの「PDFに保存」で出力）
    map.invalidateSize();
    setTimeout(() => window.print(), 200);
  });

  // オンライン/オフライン監視
  function updateOnlineStatus() {
    const el = document.getElementById('offline-indicator');
    if (navigator.onLine) {
      el.textContent = 'ONLINE'; el.classList.remove('offline');
    } else {
      el.textContent = 'OFFLINE'; el.classList.add('offline');
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // リサイズ時プロファイル再描画
  window.addEventListener('resize', updateCircuit);
});
