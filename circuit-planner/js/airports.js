// 空港・滑走路データ
// 座標・標高・真方位は OurAirports (AIP由来) データに基づく実測値。
// trueHeading は両閾値座標から算出した精密値。
// 注: threshold = 接地閾値(Landing Threshold)の座標 = ストライプ手前の末端線位置。
//     displaced_ft は常に 0（物理末端が Landing Threshold と一致する場合）。
//     グライドパス/ILS距離計算はすべて threshold を基点とする。
const AIRPORTS = {
  RJTT: {
    name: "東京国際空港(羽田)",
    icao: "RJTT",
    elevation: 21,
    center: [35.552, 139.780],
    vor: { ident: "TTE", lat: 35.560042, lon: 139.764942, magVar: -7.5 },  // 東京VOR/DME 117.4 (35°33'36.15"N 139°45'53.79"E)
    // VOR進入 フィックス座標 (TTE VOR から ラジアル/DME で算出)
    approaches: {
      vorA: {
        label: 'VOR A (進入コース274°)', courseMag: 274, legNM: 10.7,
        fixes: [
          { ident: 'DARKS', role: 'IAF', lat: 35.571243, lon: 139.983296 },  // TTE R-094 / D10.7
          { ident: 'SULUL', role: 'FAF', lat: 35.566008, lon: 139.881261 },  // TTE R-094 / D5.7
          { ident: 'MA274', role: 'MAP', lat: 35.562763, lon: 139.818000 },  // TTE R-094 / D2.6
        ]
      }
    },
    // 滑走路はAIP実測 (TRUE BRG 149.88/329.88, THR座標DMS→10進)
    runways: {
      "16L": {
        name: "16L",
        threshold: [35.562853, 139.788711],   // 接地閾値(LDG TH): 物理末端[35.565897,139.786553]から1280ft(390m)内側
        elevation: 22,
        trueHeading: 149.88,
        length_m: 3360,
        displaced_ft: 0,
        opposite: "34R",
        tdze: 19,                              // 接地点標高 19.2FT
        ils: {
          gpAngle: 3.0,
          tch: 53,         // AIP RJTT AD2-34: ILS REF datum 16.3m(53ft)
          gsAntFt: 1024,   // AIP RJTT AD2-34: GP 312m(1024ft) inside FM RWY16L THR
          papiFt: 1352,    // AIP RJTT AD2.14: PAPI DIST FM THR 412m(1352ft)
          papiMeht: 65.0,  papiSide: 'L',
          aimFt: 1424,     // G/S Follow Eye Aim: gsAntFt(1024) + 400ft
        }
      },
      "34R": {
        name: "34R",
        threshold: [35.542500, 139.803145],   // 接地閾値(LDG TH): 物理末端[35.539694,139.805136]から1180ft(360m)内側
        elevation: 28,
        trueHeading: 329.88,
        length_m: 3360,
        displaced_ft: 0,
        opposite: "16L",
        tdze: 21,
        ils: {
          gpAngle: 3.0,
          tch: 54,         // AIP RJTT AD2-32: ILS REF datum 16.5m(54ft)
          gsAntFt: 1037,   // AIP RJTT AD2-32: GP 316m(1037ft) inside FM RWY34R THR
          papiFt: 1365,    // AIP RJTT AD2.14: PAPI DIST FM THR 416m(1365ft)
          papiMeht: 66.0,  papiSide: 'R',   // AIP RJTT AD2.14: PAPI 3.0°/RIGHT
          aimFt: 1437,     // G/S Follow Eye Aim: gsAntFt(1037) + 400ft
        }
      },
      "16R": {
        name: "16R",
        threshold: [35.556242, 139.771720],   // 接地閾値(Displaced LDG TH): AIP RJTT AD2.12: 35°33'22.47"N 139°46'18.19"E / 物理末端[35.559986,139.769067]から1579ft(482m)内側
        elevation: 16,                         // AIP RJTT AD2.12: Displaced THR ELEV 16.4ft
        trueHeading: 149.88,
        length_m: 3000,
        displaced_ft: 0,
        opposite: "34L",
        tdze: 16,                              // AIP RJTT AD2.12: TDZ ELEV 16.4ft
        ils: {
          gpAngle: 3.0,
          tch: 53,         // AIP RJTT AD2-34: ILS REF datum 16.3m(53ft)
          gsAntFt: 1070,   // AIP RJTT AD2-34: GP 326m(1070ft) inside FM RWY16R THR
          papiFt: 1424,    // AIP RJTT AD2.14: PAPI DIST FM THR 434m(1424ft)
          papiMeht: 65.0,  papiSide: 'L',   // AIP RJTT AD2.14: PAPI 3.0°/LEFT
          aimFt: 1470,     // G/S Follow Eye Aim: gsAntFt(1070) + 400ft
        }
      },
      "34L": {
        name: "34L",
        threshold: [35.536600, 139.785669],   // 35°32'11.76"N 139°47'08.41"E
        elevation: 18,
        trueHeading: 329.88,
        length_m: 3000,
        displaced_ft: 0,
        opposite: "16R",
        tdze: 18,
        ils: {
          gpAngle: 3.0,
          tch: 54,         // AIP RJTT AD2-32: ILS REF datum 16.5m(54ft)
          gsAntFt: 1109,   // AIP RJTT AD2-32: GP 338m(1109ft) inside FM RWY34L THR
          papiFt: 1473,    // AIP RJTT AD2.14: PAPI DIST FM THR 449m(1473ft)
          papiMeht: 66.0,  papiSide: 'L',   // AIP RJTT AD2.14: PAPI 3.0°/LEFT
          aimFt: 1509,     // G/S Follow Eye Aim: gsAntFt(1109) + 400ft
        }
      },
      // ---- RWY 04/22: 2,500m (LDA進入: RWY22はLDA W Rwy 22, オフセット55°) ----
      "04": {
        name: "04",
        threshold: [35.548997, 139.761278],   // AIP RJTT AD2.12: 35°32'56.47"N 139°45'40.60"E
        elevation: 19,                          // AIP RJTT AD2.12: THR ELEV 19.0ft
        trueHeading: 35.01,                     // AIP RJTT AD2.12: TRUE BRG 035.01°
        length_m: 2500,
        displaced_ft: 0,
        opposite: "22",
        tdze: 19,                               // AIP RJTT AD2.12: TDZ ELEV 19.3ft
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1049,   // ILS未搭載: 標準値
          papiFt: 1211,    // AIP RJTT AD2.14: PAPI(*2) DIST FM THR 369m(1211ft)
          papiMeht: 61.0,  papiSide: 'L',   // AIP RJTT AD2.14: PAPI 3.0°/LEFT
          aimFt: 1449,
        }
      },
      "22": {
        name: "22",
        threshold: [35.567470, 139.777114],   // AIP RJTT AD2.12: 35°34'02.88"N 139°46'37.61"E
        elevation: 35,                          // AIP RJTT AD2.12: THR ELEV 35.0ft
        trueHeading: 215.01,                    // AIP RJTT AD2.12: TRUE BRG 215.01°
        length_m: 2500,
        displaced_ft: 0,
        opposite: "04",
        tdze: 35,                               // AIP RJTT AD2.12: TDZ ELEV 35.0ft
        ils: {
          gpAngle: 3.0,
          tch: 54,         // AIP RJTT AD2.19: ILS REF datum 16.5m(54ft)
          gsAntFt: 1112,   // AIP RJTT AD2.19: GP 339m(1112ft) inside FM RWY22 THR
          papiFt: 1437,    // AIP RJTT AD2.14: PAPI DIST FM THR 438m(1437ft)
          papiMeht: 63.0,  papiSide: 'L',   // AIP RJTT AD2.14: PAPI 3.0°/LEFT / Jeppesen: PAPI-L
          aimFt: 1512,     // G/S Follow Eye Aim: gsAntFt(1112) + 400ft
          approachType: 'LDA',
          loc: { ident: "IKL", freq: 110.1, lat: 35.603825, lon: 139.818981, course_mag: 277 },
          // AIP RJTT AD2.19: LDA-LOC 22 / 35°36'13.77"N 139°49'08.33"E / 5481m(17983ft) outside FM RWY22 / BRG(MAG) 277°
          dambo: { lat: 35.571292, lon: 140.079157 }, // ITL R-097°(MAG) / D14.5NM: LDA W22 進入フィックス
          bondo: { lat: 35.605391, lon: 140.079134 }, // IKL R-097°(MAG) / D12.7NM: LDA W22 フィックス
          mx22:  { lat: 35.603983, lon: 139.841514 }, // IKL R-097°(MAG) / D1.1NM:  LDA W22 最終進入フィックス
        }
      },
      // ---- RWY 05/23: 2,500m (LDA進入: RWY23はLDA W Rwy 23, オフセット47°) ----
      "05": {
        name: "05",
        threshold: [35.524003, 139.803464],   // AIP RJTT AD2.12: 35°31'26.41"N 139°48'12.47"E
        elevation: 46,                          // AIP RJTT AD2.12: THR ELEV 45.5ft
        trueHeading: 42.56,                     // AIP RJTT AD2.12: TRUE BRG 042.56°
        length_m: 2500,
        displaced_ft: 0,
        opposite: "23",
        tdze: 46,                               // AIP RJTT AD2.12: TDZ ELEV 45.5ft
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1049,   // ILS/PAPI未搭載: 標準値
          papiFt: 1312,
          papiMeht: 65.0,
          aimFt: 1449,
        }
      },
      "23": {
        name: "23",
        threshold: [35.540597, 139.822114],   // AIP RJTT AD2.12: 35°32'26.15"N 139°49'19.61"E
        elevation: 55,                          // AIP RJTT AD2.12: THR ELEV 54.7ft
        trueHeading: 222.56,                    // AIP RJTT AD2.12: TRUE BRG 222.56°
        length_m: 2500,
        displaced_ft: 0,
        opposite: "05",
        tdze: 55,                               // AIP RJTT AD2.12: TDZ ELEV 54.7ft
        ils: {
          gpAngle: 3.0,
          tch: 55,         // AIP RJTT AD2.19: ILS REF datum 16.9m(55ft)
          gsAntFt: 1102,   // AIP RJTT AD2.19: GP 336m(1102ft) inside FM RWY23 THR
          papiFt: 1483,    // AIP RJTT AD2.14: PAPI DIST FM THR 452m(1483ft)
          papiMeht: 66.0,  papiSide: 'L',   // AIP RJTT AD2.14: PAPI 3.0°/LEFT / Jeppesen: PAPI-L
          aimFt: 1502,     // G/S Follow Eye Aim: gsAntFt(1102) + 400ft
          approachType: 'LDA',
          loc: { ident: "ITL", freq: 108.5, lat: 35.569548, lon: 139.782258, course_mag: 277 },
          // AIP RJTT AD2.19: LDA-LOC 23 / 35°34'10.37"N 139°46'56.13"E / 4834m(15860ft) N of RCL / BRG(MAG) 277°
          dambo: { lat: 35.571292, lon: 140.079157 }, // ITL R-097°(MAG) / D14.5NM: LDA W23 進入フィックス
          mx23: { lat: 35.570219, lon: 139.882588 },
          // MX23 = ITL R-097°(MAG) / D4.9NM: LDA W23 進入開始フィックス
        }
      }
    }
  },
  RJAA: {
    name: "成田国際空港",
    icao: "RJAA",
    elevation: 141,
    center: [35.7647, 140.3864],
    vor: { ident: "NRE", lat: 35.782299, lon: 140.363007, magVar: -8 },  // 成田VOR, 偏差 約8°W
    runways: {
      "16R": {
        name: "16R",
        threshold: [35.774383, 140.368292],   // 接地閾値(LDG TH): 35°46'27.78"N 140°22'05.85"E
        elevation: 130,
        trueHeading: 149.60,   // 両閾値座標から算出した精密値（旧149.0は0.6°ズレ→5NMで約95m横ズレ）
        length_m: 4000,
        displaced_ft: 0,
        opposite: "34L",
        tdze: 130,
        ils: {
          gsAntFt: 1115,   // AIP確認値: 340m (ILS GP ANTENNA from TH)
          tch: 59,          // AIP確認値: ILS REF datum 18.0m(59ft)
          gpAngle: 3.0,     // AIP確認値
          papiFt: 1414,    // AIP確認値: PAPI DIST FM THR 431m
          papiMeht: 67.3,  // AIP確認値: PAPI MEHT 67.3ft
          papiSide: 'L',   // AIP RJAA AD2.14: PAPI 3.0°/Left
          aimFt: 1515,     // G/S Follow Eye Aim: gsAntFt(1115) + 400ft
        }
      },
      "34L": {
        name: "34L",
        threshold: [35.743317, 140.390747],   // 接地閾値(LDG TH): 35°44'35.94"N 140°23'26.69"E
        elevation: 139,
        trueHeading: 329.61,   // 両閾値座標から算出した精密値（16Rの逆方位）
        length_m: 4000,
        displaced_ft: 0,
        opposite: "16R",
        tdze: 139,
        ils: {
          gsAntFt: 1109,   // AIP RJAA: GP 338m(1109ft) inside FM RWY34L THR
          tch: 58,          // AIP RJAA: ILS REF datum 17.7m(58ft)
          gpAngle: 3.0,
          papiFt: 1394,    // AIP確認値: PAPI DIST FM THR 425m
          papiMeht: 67.3,
          papiSide: 'L',   // AIP RJAA AD2.14: PAPI 3.0°/Left
          aimFt: 1509,     // G/S Follow Eye Aim: gsAntFt(1109) + 400ft
        }
      },
      "16L": {
        name: "16L",
        threshold: [35.805194, 140.378106],   // 接地閾値(LDG TH): 35°48'18.70"N 140°22'41.18"E
        elevation: 135,
        trueHeading: 149.60,   // 両閾値座標から算出した精密値（旧150.1は0.5°ズレ）
        length_m: 2500,
        displaced_ft: 0,
        opposite: "34R",
        tdze: 135,
        ils: {
          gsAntFt: 1210,   // AIP: GP 369m(1210ft) inside FM RWY16L THR
          tch: 54,          // AIP: ILS REF datum 16.53m(54.2ft)
          gpAngle: 3.0,
          papiFt: 1375,    // AIP確認値: PAPI DIST FM THR 419m
          papiMeht: 65.6,
          papiSide: 'L',   // AIP RJAA AD2.14: PAPI 3.0°/Left
          aimFt: 1610,     // G/S Follow Eye Aim: gsAntFt(1210) + 400ft
        }
      },
      "34R": {
        name: "34R",
        threshold: [35.785778, 140.392150],   // 接地閾値(LDG TH): 35°47'08.80"N 140°23'31.74"E
        elevation: 141,
        trueHeading: 329.60,   // 両閾値座標から算出した精密値（旧330.1は0.5°ズレ）
        length_m: 2500,
        displaced_ft: 0,
        opposite: "16L",
        tdze: 141,
        ils: {
          gsAntFt: 1131,   // AIP RJAA: GP 345m(1131ft) inside FM RWY34R THR
          tch: 55,          // AIP RJAA: ILS REF datum 16.7m(54.9ft)
          gpAngle: 3.0,
          papiFt: 1509,    // AIP確認値: PAPI DIST FM THR 460m
          papiMeht: 66.2,
          papiSide: 'R',   // AIP RJAA AD2.14: PAPI 3.0°/Right
          aimFt: 1531,     // G/S Follow Eye Aim: gsAntFt(1131) + 400ft
        }
      }
    }
  },
  RJFR: {
    name: "北九州空港",
    icao: "RJFR",
    elevation: 21,
    center: [33.8455, 131.0350],
    // 旋回方向は滑走路レベルで管理（海側=東のみ許可）
    vor: { ident: "SWE", lat: 33.856602, lon: 131.029007, magVar: -7 },  // 周防VOR/DME, 偏差 約7°W
    // VOR進入 フィックス座標 (SWE VOR から ラジアル/DME で算出)
    approaches: {
      vorB: {
        label: 'VOR B RWY18', courseMag: 274, legNM: 5.2,
        fixes: [
          { ident: 'FF274', role: 'FAF', lat: 33.861137, lon: 131.133099 },  // SWE R-094 / D5.2
          { ident: 'MA274', role: 'MAP', lat: 33.857474, lon: 131.049025 },  // SWE R-094 / D1.0
        ]
      },
      vorA: {
        label: 'VOR A RWY18', courseMag: 264, legNM: 9.5,
        fixes: [
          { ident: 'ASARI', role: 'IAF', lat: 33.892219, lon: 131.214540 }, // SWE R-084 / D9.5
          { ident: 'MA264', role: 'MAP', lat: 33.860351, lon: 131.048537 }, // SWE R-084 / D1.0
        ]
      }
    },
    runways: {
      "18": {
        name: "18",
        threshold: [33.85670277777778, 131.0328166666667],   // 33°51'23.92"N 131°01'57.83"E
        elevation: 20,
        trueHeading: 170.4,
        length_m: 2500,
        displaced_ft: 0,
        opposite: "36",
        tdze: 20,
        trafficDir: 'left',   // 東側（海上）のみ可。西側（陸地）禁止
        ils: {
          gpAngle: 3.0,
          tch: 54,         // AIP RJFR ILS RWY18: HGT of ILS REF datum 16.5m(54ft)
          gsAntFt: 1033,   // AIP RJFR ILS RWY18: ILS-GP ANTENNA 315m(1033ft) from TH
          papiFt: 1385,    // AIP: PAPI DIST FM THR 1385ft
          papiMeht: 60.0,  papiSide: 'L',   // ForeFlight AMM: PAPI-L 3.00°
          aimFt: 1433,     // G/S Follow Eye Aim: gsAntFt(1033) + 400ft
        }
      },
      "36": {
        name: "36",
        threshold: [33.834605555555555, 131.03731666666667],   // 33°50'04.08"N 131°02'14.17"E
        elevation: 23,
        trueHeading: 350.4,
        length_m: 2500,
        displaced_ft: 0,
        opposite: "18",
        tdze: 23,
        trafficDir: 'right',  // 東側（海上）のみ可。西側（陸地）禁止
        papi: { papiFt: 1550, side: 'L', angle: 3.0 },  // ForeFlight AMM: PAPI-L 3.00°（ILSなし）
      }
    }
  },
  PANC: {
    name: "アンカレッジ国際空港",
    icao: "PANC",
    elevation: 152,
    center: [61.1743, -149.9982],
    vor: { ident: "TED", lat: 61.1678664, lon: -149.9601442, magVar: 16 },  // ANCHORAGE VOR/DME (61-10-04.3N 149-57-36.5W), 偏差 16E(2020)
    runways: {
      // RW 15/33: 10,865ft ≈ 3312m
      "33": {
        name: "33",
        threshold: [61.172291, -149.999168],   // 接地閾値(LDG TH): 衛星画像でピアノキー始端(矢羽終端)を実測 = OurAirports末端[61.171042,-149.998469]から144m
        elevation: 122,
        trueHeading: 344.91,       // 両末端座標(OurAirports)から算出
        length_m: 3312,
        displaced_ft: 0,
        opposite: "15",
        tdze: 121,                 // FAA AIP AD2.12 TDZE: 120.8ft
        papi: { papiFt: 1290, papiMeht: 67.0, papiSide: 'R' }  // Google Earth実測: 接地閾値から393.18m
      },
      "15": {
        name: "15",
        threshold: [61.199731, -150.014531],   // 接地閾値(LDG TH): 衛星画像でピアノキー(閾値標識)始端を実測 = OurAirports le座標に一致（Displaced補正は不要だった）
        elevation: 151,            // FAA AIP AD2.12: 151.3ft
        trueHeading: 164.89,       // 両末端座標(OurAirports)から算出
        length_m: 3312,
        displaced_ft: 0,
        opposite: "33",
        tdze: 151,                 // FAA AIP AD2.12 TDZE: 151.4ft
        ils: {
          gpAngle: 3.2,            // Jeppesen PANC 10-9A: PAPI-R angle 3.2°
          papiAngle: 3.2,          // PAPI基準角度（ILS 15@PANCはPAPI 3.2°設置）
          tch: 66,                 // 1176ft × tan(3.2°) = 65.8ft ≈ 66ft
          gsAntFt: 1176,           // FAA AIP AD2.19 GS座標(61°11'46.76"N 150°00'54.42"W)→接地閾値投影距離 1176ft
          papiFt: 1542,            // FAA AIP PAPI座標(61°11'44.74"N 150°00'41.19"W)→接地閾値投影距離 1542ft
          papiMeht: 67.0,
          papiSide: 'R',           // FAA AIP AD2.14: P4R / Jeppesen PANC 10-9A: PAPI-R
          aimFt: 1576,             // G/S Follow Eye Aim: gsAntFt(1176) + 400ft
        }
      },
      // RW 7R/25L: 12,400ft=3780m (真89.9/269.9 = 磁074/254)
      "07R": {
        name: "07R",
        threshold: [61.167814, -150.042853],   // 61°10'04.13"N 150°02'34.27"W
        elevation: 132, trueHeading: 89.9, length_m: 3780, displaced_ft: 0, opposite: "25L", tdze: 132,
        ils: { gpAngle: 3.0, tch: 55, gsAntFt: 1049, papiFt: 1312, papiMeht: 67.0 }
      },
      "25L": {
        name: "25L",
        threshold: [61.167869, -149.972700],   // 61°10'04.33"N 149°58'21.72"W
        elevation: 101, trueHeading: 269.9, length_m: 3780, displaced_ft: 0, opposite: "07R", tdze: 101,
        papi: { papiFt: 1312, papiMeht: 67.0, papiSide: 'R' }
      },
      // RW 7L/25R: 10,600ft=3231m
      "07L": {
        name: "07L",
        threshold: [61.169765, -150.008333],   // 61°10'11.35"N 150°00'30.00"W
        elevation: 128, trueHeading: 89.9, length_m: 3231, displaced_ft: 0, opposite: "25R", tdze: 128,
        ils: { gpAngle: 3.0, tch: 55, gsAntFt: 1049, papiFt: 1312, papiMeht: 67.0 }
      },
      "25R": {
        name: "25R",
        threshold: [61.169808, -149.948364],   // 61°10'11.31"N 149°56'54.11"W
        elevation: 92, trueHeading: 269.9, length_m: 3231, displaced_ft: 0, opposite: "07L", tdze: 92,
        papi: { papiFt: 1312, papiMeht: 67.0, papiSide: 'R' }
      }
    }
  },
  VTBS: {
    name: "スワンナプーム(バンコク)",
    icao: "VTBS",
    elevation: 5,
    center: [13.685, 100.747],
    aimingPoint: { stripeLength: 148 },
    // 滑走路はOurAirports実測 (真方位14.3/194.3=磁015°/195°), 公式AMM呼称
    runways: {
      "02L": {
        name: "02L",
        threshold: [13.665175, 100.729244],   // 13°39'54.63"N 100°43'45.28"E
        elevation: 5, trueHeading: 14.3, length_m: 4000, displaced_ft: 0, opposite: "20R", tdze: 5,
        papi: { papiFt: 1348 /*衛星画像実測(Aiming Marking始端)*/, papiMeht: 63.82, papiSide: 'L' }
        // Jeppesen VTBS 20-9A: PAPI-L angle 2.80°
      },
      "20R": {
        name: "20R",
        threshold: [13.700189, 100.738447],   // 13°42'00.68"N 100°44'18.41"E
        elevation: 5, trueHeading: 194.3, length_m: 4000, displaced_ft: 0, opposite: "02L", tdze: 5,
        papi: { papiFt: 1358 /*衛星画像実測(Aiming Marking始端)*/, papiMeht: 63.82, papiSide: 'L' }
      },
      "02R": {
        name: "02R",
        threshold: [13.671278, 100.734664],   // 13°40'16.60"N 100°44'04.79"E
        elevation: 5, trueHeading: 14.3, length_m: 3700, displaced_ft: 0, opposite: "20L", tdze: 5,
        ils: { gpAngle: 3.0, tch: 55, gsAntFt: 1049, papiFt: 1345 /*衛星画像実測(Aiming Marking始端)*/, papiMeht: 63.82, papiSide: 'L', aimFt: 1449 }
        // Jeppesen VTBS 20-9A: PAPI-L angle 2.80°
      },
      "20L": {
        name: "20L",
        threshold: [13.703947, 100.743178],   // 13°42'13.21"N 100°44'35.44"E
        elevation: 5, trueHeading: 194.3, length_m: 3700, displaced_ft: 0, opposite: "02R", tdze: 5,
        ils: { gpAngle: 3.0, tch: 55, gsAntFt: 1049, papiFt: 1350 /*衛星画像実測(Aiming Marking始端)*/, papiMeht: 63.82, aimFt: 1449 }
      },
      "01": {
        name: "01",
        threshold: [13.656697, 100.751831],   // 13°39'24.11"N 100°45'06.59"E
        elevation: 5, trueHeading: 14.3, length_m: 4000, displaced_ft: 0, opposite: "19", tdze: 5,
        ils: { gpAngle: 3.0, tch: 55, gsAntFt: 1049, papiFt: 1344 /*衛星画像実測(Aiming Marking始端)*/, papiMeht: 63.82, papiSide: 'L', aimFt: 1449 }
        // Jeppesen VTBS 20-9A: PAPI-L angle 2.80°
      },
      "19": {
        name: "19",
        threshold: [13.691714, 100.761033],   // 13°41'30.17"N 100°45'39.72"E
        elevation: 5, trueHeading: 194.3, length_m: 4000, displaced_ft: 0, opposite: "01", tdze: 5,
        ils: { gpAngle: 3.0, tch: 55, gsAntFt: 1049, papiFt: 1352 /*衛星画像実測(Aiming Marking始端)*/, papiMeht: 63.82, aimFt: 1449 }
      }
    }
  },
  RJGG: {
    name: "中部国際(セントレア)",
    icao: "RJGG",
    elevation: 15,
    center: [34.858, 136.805],
    magVar: -8,   // 磁気偏差(CBE VOR declination 8.0°W)
    vor: { ident: "CBE", lat: 34.858333, lon: 136.803333, magVar: -8 },  // CHUBU VOR/DME 117.8 (N34°51.5' E136°48.2')

    // RWY 18/36 単一滑走路 (真方位169.5/349.5 = 磁176°/356°), 3500m
    runways: {
      "18": {
        name: "18",
        threshold: [34.87385, 136.80171666666666],   // 34°52'26.08"N 136°48'06.32"E
        elevation: 15, trueHeading: 168.90, length_m: 3500, displaced_ft: 0, opposite: "36", tdze: 15,   // trueHeading: 両閾値座標から算出
        ils: {
          gpAngle: 3.0,
          tch: 55,         // AIP RJGG AD 2.20: ILS REF datum 16.8m(55ft)
          gsAntFt: 1049,   // 55/tan(3°)≈1049ft from TH
          papiFt: 1364,    // AIP RJGG: PAPI DIST FM THR 416m(1364ft)
          papiMeht: 66.0,
        }
      },
      "36": {
        name: "36",
        threshold: [34.842939, 136.809106],   // 34°50'34.58"N 136°48'32.78"E
        elevation: 15, trueHeading: 348.90, length_m: 3500, displaced_ft: 0, opposite: "18", tdze: 15,   // trueHeading: 両閾値座標から算出
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1049,
          papiFt: 1364,    // AIP RJGG: PAPI DIST FM THR 416m(1364ft)
          papiMeht: 66.0,
        }
      }
    }
  },

  KLAX: {
    name: "ロサンゼルス国際",
    icao: "KLAX",
    elevation: 128,    // FAA AIP AD2.2.2: 127.8 ft
    center: [33.9425, -118.4081],  // FAA AD2.2.1: 33-56-32.987N / 118-24-28.975W
    magVar: 12,        // FAA AIP AD2.2.5: 12E (2020)
    vor: { ident: "LAX", lat: 33.9331, lon: -118.4320, magVar: 15 },  // FAA AD2.19: VORTAC 33-55-59.3368N/118-25-55.246W MagVar 15E

    // 4本平行滑走路: 北コンプレックス(06L/24R・06R/24L) / 南コンプレックス(07L/25R・07R/25L)
    // 全滑走路真方位 83°/263° (FAA AIP AD2.12)
    // gsAntFt: FAA AIP AD2.19 GS座標からTH投影距離を実計算
    runways: {
      "24R": {
        name: "24R",
        threshold: [33.952097, -118.402031],  // FAA AIP AD2.12: 33°57'07.55"N 118°24'07.31"W
        elevation: 119,   // TH Elev 118.9 ft
        trueHeading: 263,
        length_m: 2720,   // 8926 ft (FAA AD2.12)
        displaced_ft: 0,
        opposite: "06L",
        tdze: 122,        // TDZE 122.4 ft
        ils: {
          gpAngle: 3.0,
          tch: 73,        // Jeppesen 10-9A ❻
          gsAntFt: 1026,  // FAA AD2.19 GS 33-57-02.4082N/118-24-18.522W → TH投影距離 1026ft
          papiFt: 1371,   // gsAntFt + 350 (approx)
          papiMeht: 68.0,
          papiSide: 'L',  // FAA AD2.14: P4L
          aimFt: 1000     // FAA standard
        }
      },
      "06L": {
        name: "06L",
        threshold: [33.949127, -118.43112],  // FAA AIP AD2.12: 33°56'56.86"N 118°25'52.03"W
        elevation: 113,   // TH Elev 113.1 ft
        trueHeading: 83,
        length_m: 2720,
        displaced_ft: 0,
        opposite: "24R",
        tdze: 119,        // TDZE 118.8 ft
        ils: {
          gpAngle: 3.0,
          tch: 77,        // Jeppesen 10-9A
          gsAntFt: 1005,  // FAA AD2.19 GS 33-56-54.5859N/118-25-39.8249W → TH投影距離 1005ft
          papiFt: 1346,
          papiMeht: 68.0,
          papiSide: 'L',  // FAA AD2.14: P4L
          aimFt: 1396
        }
      },
      "24L": {
        name: "24L",
        threshold: [33.950189, -118.401753],  // FAA AIP AD2.12: 33°57'00.68"N 118°24'06.31"W
        elevation: 113,   // TH Elev 112.9 ft
        trueHeading: 263,
        length_m: 3318,   // 10885 ft (FAA AD2.12)
        displaced_ft: 0,
        opposite: "06R",
        tdze: 123,        // TDZE 122.5 ft
        ils: {
          gpAngle: 3.0,
          tch: 73,        // GS 309m=1012ft×tan(3°)+20ft ≈ 73ft
          gsAntFt: 1026,  // FAA AD2.19 GS 33-57-02.31N/118-24-18.51W → TH投影距離 1026ft
          papiFt: 1362,
          papiMeht: 68.0,
          papiSide: 'R',  // FAA AD2.14: P4R
          aimFt: 1412
        }
      },
      "06R": {
        name: "06R",
        threshold: [33.947008, -118.432867],  // FAA AIP AD2.12: 33°56'49.23"N 118°25'58.32"W
        elevation: 110,   // TH Elev 109.9 ft
        trueHeading: 83,
        length_m: 3318,
        displaced_ft: 0,
        opposite: "24L",
        tdze: 116,        // TDZE 116.2 ft
        ils: {
          gpAngle: 3.0,
          tch: 72,        // GS 300m=984ft×tan(3°)+20ft ≈ 72ft
          gsAntFt: 1017,  // FAA AD2.19 GS 33-56-53.3646N/118-25-47.3623W → TH投影距離 1017ft
          papiFt: 1334,
          papiMeht: 68.0,
          papiSide: 'L',  // FAA AD2.14: P4L
          aimFt: 1384
        }
      },
      "25L": {
        name: "25L",
        threshold: [33.937355, -118.382795],  // FAA AIP AD2.12: 33°56'14.48"N 118°22'58.06"W
        elevation: 98,    // TH Elev 97.8 ft
        trueHeading: 263,
        length_m: 3382,   // 11095 ft (FAA AD2.12)
        displaced_ft: 0,
        opposite: "07R",
        tdze: 104,        // TDZE 103.7 ft
        ils: {
          gpAngle: 3.0,
          tch: 70,        // Jeppesen 10-9A
          gsAntFt: 1000,  // FAA AD2.19 GS 33-56-17.7739N/118-23-10.2139W → TH投影距離 1000ft
          papiFt: 1348,
          papiMeht: 68.0,
          papiSide: 'R',  // FAA AD2.14: P4R
          aimFt: 1398
        }
      },
      "07R": {
        name: "07R",
        threshold: [33.933661, -118.418978],  // FAA AIP AD2.12: 33°56'01.18"N 118°25'08.32"W
        elevation: 122,   // TH Elev 121.7 ft
        trueHeading: 83,
        length_m: 3382,
        displaced_ft: 0,
        opposite: "25L",
        tdze: 128,        // TDZE 127.6 ft
        ils: {
          gpAngle: 3.0,
          tch: 57,        // Jeppesen 10-9A
          gsAntFt: 1107,  // FAA AD2.19 GS 33-55-59.9253N/118-24-55.0492W → TH投影距離 1107ft
          papiFt: 1454,
          papiMeht: 68.0,
          papiSide: 'L',  // FAA AD2.14: P4L
          aimFt: 1504
        }
      },
      "25R": {
        name: "25R",
        threshold: [33.939555, -118.382986],  // FAA AIP AD2.12: 33°56'22.40"N 118°22'58.75"W
        elevation: 94,    // TH Elev 94.3 ft
        trueHeading: 263,
        length_m: 3939,   // 12923 ft (FAA AD2.12)
        displaced_ft: 0,
        opposite: "07L",
        tdze: 104,        // TDZE 103.8 ft
        ils: {
          gpAngle: 3.0,
          tch: 74,        // GS 312m=1022ft×tan(3°)+20ft ≈ 74ft
          gsAntFt: 1064,  // FAA AD2.19 GS 33-56-17.8773N/118-23-10.1796W → TH投影距離 1064ft
          papiFt: 1372,
          papiMeht: 68.0,
          papiSide: 'L',  // FAA AD2.14: P4L
          aimFt: 1422
        }
      },
      "07L": {
        name: "07L",
        threshold: [33.935841, -118.4193],  // FAA AIP AD2.12: 33°56'09.03"N 118°25'09.48"W
        elevation: 115,   // TH Elev 114.8 ft
        trueHeading: 83,
        length_m: 3939,
        displaced_ft: 0,
        opposite: "25R",
        tdze: 128,        // TDZE 127.8 ft
        ils: {
          gpAngle: 3.0,
          tch: 76,        // GS 324m=1062ft×tan(3°)+20ft ≈ 76ft
          gsAntFt: 1064,  // FAA AD2.19 GS 33-56-07.743N/118-24-56.7237W → TH投影距離 1064ft
          papiFt: 1412,
          papiMeht: 68.0,
          papiSide: 'L',  // FAA AD2.14: P4L
          aimFt: 1462
        }
      }
    }
  },
  ZSPD: {
    name: "上海浦東国際空港",
    icao: "ZSPD",
    elevation: 13,
    center: [31.1446, 121.8050],
    runways: {
      "16L": {
        name: "16L",
        threshold: [31.160133, 121.816142],
        elevation: 12,
        trueHeading: 162,
        length_m: 3800,
        displaced_ft: 0,
        opposite: "34R",
        tdze: 12,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1027,
          papiFt: 1505 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 65.0,
          papiSide: 'L',
          aimFt: 1712,
        }
      },
      "34R": {
        name: "34R",
        threshold: [31.127658, 121.828411],
        elevation: 13,
        trueHeading: 342,
        length_m: 3800,
        displaced_ft: 0,
        opposite: "16L",
        tdze: 13,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1027,
          papiFt: 1505 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 65.0,
          papiSide: 'L',
          aimFt: 1712,
        }
      },
      "16R": {
        name: "16R",
        threshold: [31.158903, 121.811742],
        elevation: 12,
        trueHeading: 162.06,   // 両閾値座標から算出（旧164は1.9°ズレ）
        length_m: 3800,
        displaced_ft: 0,
        opposite: "34L",
        tdze: 12,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1024,
          papiFt: 1505 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 65.0,
          papiSide: 'L',
          aimFt: 1712,
        }
      },
      "34L": {
        name: "34L",
        threshold: [31.126439, 121.824020],
        elevation: 13,
        trueHeading: 342.02,
        length_m: 3800,
        displaced_ft: 0,
        opposite: "16R",
        tdze: 13,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1017,
          papiFt: 1505 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 65.0,
          papiSide: 'L',
          aimFt: 1712,
        }
      },
      "17L": {
        name: "17L",
        threshold: [31.161189, 121.785958],
        elevation: 13,
        trueHeading: 162,
        length_m: 3400,
        displaced_ft: 0,
        opposite: "35R",
        tdze: 13,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1030,
          papiFt: 1505 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 65.0,
          papiSide: 'L',
          aimFt: 1712,
        }
      },
      "35R": {
        name: "35R",
        threshold: [31.127000, 121.798855],
        elevation: 13,
        trueHeading: 342,
        length_m: 4000,
        displaced_ft: 0,
        opposite: "17L",
        tdze: 13,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1030,
          papiFt: 1494 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 65.0,
          papiSide: 'L',
          aimFt: 1712,
        }
      },
      "17R": {
        name: "17R",
        threshold: [31.154753, 121.783323],
        elevation: 13,
        trueHeading: 162,
        length_m: 3400,
        displaced_ft: 0,
        opposite: "35L",
        tdze: 13,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1017,
          papiFt: 1507 /*衛星画像実測(Aiming Marking始端)*/,  // 442.8m
          papiMeht: 65.0,
          papiSide: 'L',
          aimFt: 1505,   // 458.7m (終端 518.7m)
        }
      },
      "35L": {
        name: "35L",
        threshold: [31.125698, 121.794300],
        elevation: 13,
        trueHeading: 342,
        length_m: 3400,
        displaced_ft: 0,
        opposite: "17R",
        tdze: 13,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1017,
          papiFt: 1513 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 65.0,
          papiSide: 'L',
          aimFt: 1712,
        }
      }
    }
  },
  VHHH: {
    name: "香港国際空港",
    icao: "VHHH",
    elevation: 23,
    center: [22.309, 113.915],
    runways: {
      "07L": {
        name: "07L",
        threshold: [22.321589, 113.882295],
        elevation: 23,
        trueHeading: 70.90,
        length_m: 3800,
        displaced_ft: 0,
        opposite: "25R",
        tdze: 23.3,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1033,  // GS Antenna position
          papiFt: 1395 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 65.3,
          papiSide: 'L',
          aimFt: 1312,  // ICAO standard
        }
      },
      "25R": {
        name: "25R",
        threshold: [22.33178611111111, 113.91391666666667],
        elevation: 23,
        trueHeading: 250.90,
        length_m: 3800,
        displaced_ft: 0,
        opposite: "07L",
        tdze: 23.1,
        ils: {
          gpAngle: 3.1,
          tch: 53,
          gsAntFt: 1033,  // FAA standard
          papiFt: 1317 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 65.3,
          papiSide: 'R',
          aimFt: 1000,  // FAA standard
        }
      },
      "07C": {
        name: "07C",
        threshold: [22.31128888888889, 113.89913055555556],
        elevation: 22,
        trueHeading: 70.90,
        length_m: 3800,
        displaced_ft: 0,
        opposite: "25C",
        tdze: 22.3,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1033,  // FAA standard
          papiFt: 1365 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 72.3,
          papiSide: 'L',
          aimFt: 1000,  // FAA standard
        }
      },
      "25C": {
        name: "25C",
        threshold: [22.320236, 113.926883],
        elevation: 22,
        trueHeading: 250.90,
        length_m: 3800,
        displaced_ft: 0,
        opposite: "07C",
        tdze: 22.0,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1033,  // FAA standard
          papiFt: 1394 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 72.3,
          papiSide: 'R',
          aimFt: 1000,  // FAA standard
        }
      },
      "07R": {
        name: "07R",
        threshold: [22.296686111111114, 113.89950833333334],
        elevation: 27,
        trueHeading: 70.90,
        length_m: 3800,
        displaced_ft: 0,
        opposite: "25L",
        tdze: 27.0,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1033,  // FAA standard
          papiFt: 1281 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 71.2,
          papiSide: 'L',
          aimFt: 1000,  // FAA standard
        }
      },
      "25L": {
        name: "25L",
        threshold: [22.307422222222222, 113.93278333333333],
        elevation: 27,
        trueHeading: 250.90,
        length_m: 3800,
        displaced_ft: 0,
        opposite: "07R",
        tdze: 26.9,
        ils: {
          gpAngle: 3.0,
          tch: 53,
          gsAntFt: 1013,  // FAA standard
          papiFt: 1301 /*衛星画像実測(Aiming Marking始端)*/,
          papiMeht: 77.4,
          papiSide: 'R',
          aimFt: 1000,  // FAA standard
        }
      }
    }
  },
  KORD: {
    name: "Chicago O'Hare International",
    icao: "KORD",
    elevation: 680,
    center: [41.974259, -87.907253],  // 41-58-36.985N 87-54-29.339W
    magVar: -3,  // 3W (2010)
    runways: {
      // B747-8F 使用可能な滑走路のみ
      // ============ RW 04L/22R (7500 ft) ============
      "04L": {
        name: "04L",
        threshold: [41.98165559, -87.91392333],  // 41-58-53.9601N 87-54-50.1039W
        elevation: 656,
        trueHeading: 39.37,   // 両閾値座標から算出
        length_m: 2286,
        displaced_ft: 0,
        opposite: "22R",
        tdze: 658,
        ils: {}  // No ILS
      },
      "22R": {
        name: "22R",
        threshold: [41.9975, -87.89643055555557],
        elevation: 648,
        trueHeading: 219.38,   // 両閾値座標から算出
        length_m: 2286,
        displaced_ft: 0,
        opposite: "04L",
        tdze: 652,
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1312,
          papiMeht: 68.0,
          papiSide: 'L',
          aimFt: 1450,
        }
      },
      // ============ RW 04R/22L (8075 ft) ============
      "04R": {
        name: "04R",
        threshold: [41.953375, -87.89937777777779],
        elevation: 661,
        trueHeading: 41.39,   // 両閾値座標から算出
        length_m: 2461,
        displaced_ft: 0,
        opposite: "22L",
        tdze: 661,
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1312,
          papiMeht: 68.0,
          papiSide: 'R',
          aimFt: 1450,
        }
      },
      "22L": {
        name: "22L",
        threshold: [41.969886111111116, -87.87980277777777],
        elevation: 654,
        trueHeading: 221.41,   // 両閾値座標から算出
        length_m: 2461,
        displaced_ft: 0,
        opposite: "04R",
        tdze: 654,
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1312,
          papiMeht: 68.0,
          papiSide: 'L',
          aimFt: 1450,
        }
      },
      // ============ RW 09C/27C (11245 ft) ============
      "09C": {
        name: "09C",
        threshold: [41.988305555555556, -87.9315],
        elevation: 673,
        trueHeading: 90,
        length_m: 3427,
        displaced_ft: 0,
        opposite: "27C",
        tdze: 673,
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1439 /*Google Earth実測 438.6m（THR→PAPI）*/,
          papiMeht: 68.0,
          papiSide: 'L',
          aimFt: 1450,
        }
      },
      "27C": {
        name: "27C",
        threshold: [41.988305555555556, -87.89024166666667],   // 緯度修正: 旧値は27L列の緯度（8°ズレの原因）
        elevation: 652,
        trueHeading: 270,
        length_m: 3427,
        displaced_ft: 0,
        opposite: "09C",
        tdze: 653,
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1412,   // 衛星画像実測（z19タイル・4灯列確認）
          papiMeht: 68.0,
          papiSide: 'L',
          aimFt: 1450,
        }
      },
      // ============ RW 10C/28C (10800 ft) ============
      "10C": {
        name: "10C",
        threshold: [41.96568197, -87.93152161],  // 41-57-56.5251N 87-55-53.4778W
        elevation: 669,
        trueHeading: 89.82,   // 両閾値座標から算出
        length_m: 3292,
        displaced_ft: 0,
        opposite: "28C",
        tdze: 669,
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1490,   // 衛星画像実測（z19タイル・4灯列確認）
          papiMeht: 68.0,
          papiSide: 'L',
          aimFt: 1450,
        }
      },
      "28C": {
        name: "28C",
        threshold: [41.96576944444445, -87.89189166666668],
        elevation: 650,
        trueHeading: 269.84,   // 両閾値座標から算出
        length_m: 3292,
        displaced_ft: 0,
        opposite: "10C",
        tdze: 651,
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1500,   // 衛星画像実測（z19タイル・4灯列確認）
          papiMeht: 68.0,
          papiSide: 'L',
          aimFt: 1450,
        }
      },
      // ============ RW 10L/28R (13000 ft) ============
      "10L": {
        name: "10L",
        threshold: [41.96899489, -87.93153761],  // 41-58-08.3816N 87-55-53.5142W
        elevation: 672,
        trueHeading: 90,
        length_m: 3962,
        displaced_ft: 0,
        opposite: "28R",
        tdze: 672,
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1438 /*Google Earth実測 438.18m（THR→PAPI）*/,
          papiMeht: 68.0,
          papiSide: 'L',
          aimFt: 1450,
        }
      },
      "28R": {
        name: "28R",
        threshold: [41.969075000000004, -87.88380833333333],
        elevation: 651,
        trueHeading: 270,
        length_m: 3962,
        displaced_ft: 0,
        opposite: "10L",
        tdze: 651,
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1332,   // 衛星画像実測（z19タイル・4灯列確認、画質粗のため±30ft）
          papiMeht: 68.0,
          papiSide: 'L',
          aimFt: 1450,
        }
      },
      // ============ B747-8F 使用不可な滑走路（グレーアウト） ============
      "09L": {
        name: "09L",
        threshold: [42.00282650, -87.92667594],  // 42-00-10.1954N 87-55-36.0339W
        elevation: 668,
        trueHeading: 90,
        length_m: 2286,
        displaced_ft: 0,
        opposite: "27R",
        tdze: 668,
        disabled: true,  // B747-8F 使用不可
        ils: {}  // No ILS
      },
      "27R": {
        name: "27R",
        threshold: [42.00282525, -87.89908326],  // 42-00-10.1909N 87-53-56.6997W
        elevation: 664,
        trueHeading: 270,
        length_m: 2286,
        displaced_ft: 0,
        opposite: "09L",
        tdze: 664,
        disabled: true,  // B747-8F 使用不可
        ils: {}  // No ILS
      },
      "09R": {
        name: "09R",
        threshold: [41.98389364, -87.93129111],  // 41-59-02.0171N 87-55-53.6481W
        elevation: 668,
        trueHeading: 90,
        length_m: 3432,
        displaced_ft: 0,
        opposite: "27L",
        tdze: 668,
        disabled: true,  // B747-8F 使用不可
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1312,
          papiMeht: 68.0,
          papiSide: 'L',
          aimFt: 1450,
        }
      },
      "27L": {
        name: "27L",
        threshold: [41.98389492, -87.88959883],  // 41-59-02.0417N 87-53-24.5558W
        elevation: 650,
        trueHeading: 270,
        length_m: 3432,
        displaced_ft: 0,
        opposite: "09R",
        tdze: 654,
        disabled: true,  // B747-8F 使用不可
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1312,
          papiMeht: 68.0,
          papiSide: 'R',
          aimFt: 1450,
        }
      },
      "10R": {
        name: "10R",
        threshold: [41.95720111, -87.92786668],  // 41-57-25.924N 87-55-40.3004W
        elevation: 680,
        trueHeading: 90,
        length_m: 2286,
        displaced_ft: 0,
        opposite: "28L",
        tdze: 680,
        disabled: true,  // B747-8F 使用不可
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1312,
          papiMeht: 68.0,
          aimFt: 1450,
        }
      },
      "28L": {
        name: "28L",
        threshold: [41.95724624, -87.90028876],  // 41-57-26.0865N 87-54-01.0355W
        elevation: 658,
        trueHeading: 270,
        length_m: 2286,
        displaced_ft: 0,
        opposite: "10R",
        tdze: 667,
        disabled: true,  // B747-8F 使用不可
        ils: {
          gpAngle: 3.0,
          tch: 55,
          gsAntFt: 1050,
          papiFt: 1312,
          papiMeht: 68.0,
          aimFt: 1450,
        }
      }
    }
  }
};
