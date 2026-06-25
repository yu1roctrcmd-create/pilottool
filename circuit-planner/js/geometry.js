const R_NM = 3440.065; // Earth radius in NM

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

// 基点から bearing方向へ distanceNM 進んだ座標を返す
function destinationPoint(lat, lon, bearing, distanceNM) {
  const d = distanceNM / R_NM;
  const b = toRad(bearing);
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(b)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(b) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [toDeg(lat2), toDeg(lon2)];
}

// 2点間の距離(NM)
function distanceNM(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R_NM * Math.asin(Math.sqrt(a));
}

// 角度を0-360に正規化
function normalizeBearing(b) {
  return ((b % 360) + 360) % 360;
}

// 2点間の真方位 (deg, from→to)
function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

// バンク角と速度からターン半径(NM)を計算
// 指定半径(NM)を指定速度(kt)で飛ぶのに必要なバンク角(deg)
// tan(bank) = V² / (g * R)
function bankForRadiusDeg(speedKt, radiusNM) {
  const V = speedKt * 1.6878;       // ft/s
  const g = 32.174;                 // ft/s²
  const R_ft = radiusNM * 6076.12;  // ft
  if (R_ft <= 0) return 90;
  return toDeg(Math.atan((V * V) / (g * R_ft)));
}

function turnRadiusNM(speedKt, bankDeg) {
  // R = V² / (g * tan(bank))  [ft]
  // V in ft/s = speedKt * 1.6878
  const V = speedKt * 1.6878; // ft/s
  const g = 32.174; // ft/s²
  const bankRad = toRad(bankDeg);
  const R_ft = (V * V) / (g * Math.tan(bankRad));
  return R_ft / 6076.12; // NM
}

// ターン円弧の座標列を生成
function arcPoints(centerLat, centerLon, radiusNM, startBearing, endBearing, clockwise, steps = 24) {
  const points = [];
  let start = normalizeBearing(startBearing);
  let end = normalizeBearing(endBearing);
  if (clockwise && end <= start) end += 360;
  if (!clockwise && start <= end) start += 360;
  for (let i = 0; i <= steps; i++) {
    const b = start + (end - start) * (i / steps);
    points.push(destinationPoint(centerLat, centerLon, b, radiusNM));
  }
  return points;
}

// 3°グライドパス: 高度(ft) → 閾値からの水平距離(NM)
function altToDistNM(heightFt) {
  return heightFt / (Math.tan(toRad(3)) * 6076.12);
}

// 3°パス上の距離(NM)→高度(ft above threshold)
function distToAltFt(distNM) {
  return distNM * 6076.12 * Math.tan(toRad(3));
}
