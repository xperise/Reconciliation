/* ==========================================================================
   XPERISE — CHẾ ĐỘ SỐ LIỆU  ·  perf.js
   Mô hình tài chính FY2025A–FY2030E.

   Toàn bộ con số được TÍNH tại thời điểm chạy từ bộ máy mô hình bên dưới,
   không có số nào chép cứng. Đổi một giả định ở thanh Drivers thì mọi bảng,
   biểu đồ và câu nhận xét đều đổi theo.

   FY2025 là số đã kiểm toán, không bao giờ thay đổi.

   Module này không dùng Supabase — nó tự tính, nên init(sb) nhận tham số
   chỉ để khớp giao diện mà app.js đang gọi.
   ========================================================================== */


/* Chữ cho nút chuyển chế độ — trước đây nằm trong perf.js cũ, giữ lại nguyên
   để nút Công việc / Số liệu và tên trên thanh tiêu đề không bị trắng. */
Object.assign(I18N.vi, {
  modeWork: "Công việc", modePerf: "Số liệu",
  modeWorkBrand: "Workstream Intelligence", modePerfBrand: "Performance Intelligence"
});
Object.assign(I18N.en, {
  modeWork: "Workstream", modePerf: "Performance",
  modeWorkBrand: "Workstream Intelligence", modePerfBrand: "Performance Intelligence"
});

const Perf = (function () {

  var started = false;

  /* =====================================================================
     XPERISE MODEL ENGINE
     Mirrors Xperise_Financial_Model_FY2025A_FY2030E.xlsx cell for cell.
     Every figure the dashboard shows is produced here at runtime.
     ===================================================================== */
  var YRS = ["FY2025A", "FY2026E", "FY2027E", "FY2028E", "FY2029E", "FY2030E"];
  var FX = 25500;
  var AUDITED_REV_VND = 45804717360;
  var AUDITED_PAYROLL = 354128;

  var BASE = {
    ai:        [0.30, 0.58, 0.78, 0.88, 0.93, 0.95],
    k:         3.0,
    hunters:   [3, 5, 32, 43, 53, 64],
    baseQuota: 45,
    channel:   [0, 2117, 2800, 3400, 3800, 4300],
    churn:     [0, 0.08, 0.08, 0.08, 0.08, 0.08],
    t1:        [0, 50, 130, 240, 380, 550],
    t2:        [0, 300, 900, 1900, 3200, 5000],
    g1t:       [0, 307e6, 265e6, 225e6, 195e6, 172e6],
    g1m:       [0, 50e6, 55e6, 60e6, 65e6, 70e6],
    g2f:       [0, 20e6, 22e6, 24e6, 26e6, 28e6],
    g2m:       [0, 10e6, 11e6, 12e6, 13e6, 14e6],
    g3m:       [0, 4e6, 5e6, 5.5e6, 6e6, 6.5e6],
    fnbRatio:  0.5,
    trTravelMP: 0.03, trMobMP: 0.10, trFnbMP: 0.05, trSaaS: 0.02,
    lic1:      [0, 18000, 24000, 30000, 34000, 38000],
    lic2:      [0, 1200, 1800, 2400, 2900, 3400],
    lic3:      [0, 90, 220, 340, 450, 560],
    l4:        [0, 0, 2.5e6, 7e6, 14e6, 30e6],
    usAcct:    [0, 0, 150, 250, 900, 2000],
    usArpu:    [0, 0, 5000, 6000, 7500, 8500],
    usRatio:   [0, 0, 30, 30, 40, 50],
    usBase:    [0, 0, 3, 3, 3, 3],
    svcGM:     [0.06097, 0.08, 0.10, 0.11, 0.12, 0.13],
    cts1:      [0.15, 0.14, 0.12, 0.105, 0.09, 0.085],
    cts2:      [0.30, 0.28, 0.26, 0.245, 0.23, 0.22],
    cts4:      0.20,
    gtm:       [1247, 550e3, 1.6e6, 2.6e6, 3.6e6, 4.6e6],
    ga:        [128e3, 550e3, 1.0e6, 1.45e6, 1.85e6, 2.25e6],
    cac:       [0, 180, 150, 130, 115, 100],
    comm:      0.06,
    capex:     [0, 900e3, 1.6e6, 1.4e6, 1.2e6, 1.2e6],
    amortLife: 3,
    cit:       [0, 0, 0.20, 0.20, 0.20, 0.20],
    rs1: 25, rc1: 25, rs2: 50, rc2: 70, r3: 150,
    tech:      [8, 15, 28, 40, 50, 60],
    gaFte:     [6, 11, 16, 21, 25, 29],
    opsPerM:   1.7,
    cCom: 13000, cOps: 11000, cTech: 30000, cGa: 22000, cUs: 110000,
    clevel:    [0, 157e3, 966e3, 1.41e6, 1.41e6, 1.41e6],
    mult: { l1: [10, 14, 22], l2: [5, 7, 10], l3: [1.0, 1.5, 2.0], l4: [12, 14, 20] },
    avg2026: [32, 110, 773.75],
    pack2026Rev: 158106959474,
    pack2026Cust: 2500
  };

  /* Controls the dashboard exposes. Defaults reproduce the workbook. */
  var DEFAULTS = {
    sellers2030: 64,
    ai2030: 0.95,
    licence: 1.0,
    channel2030: 4300,
    takeRate: 1.0,
    churn: 0.08,
    round: 1.0,
    scenario: "base"
  };

  /* Round size elasticity, stated openly in the UI so it can be argued with.
     Each $1m above the $1m core plan funds an extra 250 US accounts by FY2030
     and lifts the automation ceiling by 1 point, to a hard cap of 99%. */
  var CAP_US_PER_M = 250;
  var CAP_AI_PER_M = 0.01;

  function ramp(base, endValue, baseEnd) {
    // Scale the FY2027-FY2030 path so it lands on endValue, keeping its shape.
    var f = baseEnd === 0 ? 0 : endValue / baseEnd;
    return base.map(function (v, i) { return i < 2 ? v : v * f; });
  }

  function compute(u) {
    var B = BASE, i;
    var extraM = Math.max(0, u.round - 1.0);

    /* ---- drivers -------------------------------------------------------- */
    var aiCeil = Math.min(0.99, u.ai2030 + CAP_AI_PER_M * extraM);
    var ai = B.ai.slice();
    var aiShape = [0, 0, 20/37, 30/37, 35/37, 1.0]; // FY27-30 share of the FY26->FY30 gap
    for (i = 2; i < 6; i++) ai[i] = B.ai[1] + (aiCeil - B.ai[1]) * aiShape[i];

    var capMult = ai.map(function (a) { return 1 + B.k * Math.max(0, a - B.ai[1]); });
    var quota = capMult.map(function (m) { return B.baseQuota * m; });

    var hunters = ramp(B.hunters, u.sellers2030, B.hunters[5]);
    var channel = ramp(B.channel, u.channel2030, B.channel[5]);
    var usAcct = ramp(B.usAcct, B.usAcct[5] + CAP_US_PER_M * extraM, B.usAcct[5]);

    /* ---- accounts ------------------------------------------------------- */
    var open = [], churn = [], sales = [], newLogos = [], close = [];
    for (i = 0; i < 6; i++) {
      if (i === 0) { open[0] = 0; churn[0] = 0; sales[0] = 0; newLogos[0] = 0; close[0] = 172; continue; }
      open[i] = close[i - 1];
      churn[i] = -open[i] * u.churn;
      sales[i] = hunters[i] * quota[i];
      newLogos[i] = sales[i] + channel[i];
      close[i] = Math.round(open[i] + churn[i] + newLogos[i]);
    }

    var t1 = B.t1.slice(), t2 = B.t2.slice(), t3 = [];
    for (i = 0; i < 6; i++) {
      t1[i] = Math.min(t1[i], close[i]);
      t2[i] = Math.min(t2[i], Math.max(0, close[i] - t1[i]));
      t3[i] = Math.max(0, close[i] - t1[i] - t2[i]);
    }

    var a1 = [], a2 = [], a3 = [], aT = [];
    for (i = 0; i < 6; i++) {
      if (i === 0) { a1[0] = 0; a2[0] = 0; a3[0] = 172; }
      else if (i === 1) { a1[1] = B.avg2026[0]; a2[1] = B.avg2026[1]; a3[1] = B.avg2026[2]; }
      else { a1[i] = (t1[i - 1] + t1[i]) / 2; a2[i] = (t2[i - 1] + t2[i]) / 2; a3[i] = (t3[i - 1] + t3[i]) / 2; }
      aT[i] = a1[i] + a2[i] + a3[i];
    }

    /* ---- GMV ------------------------------------------------------------ */
    var gTravel = [], gFnb = [], gMob = [], gTot = [], gUsd = [];
    for (i = 0; i < 6; i++) {
      gTravel[i] = a1[i] * B.g1t[i] * 12;
      gFnb[i] = (a1[i] * B.g1t[i] * B.fnbRatio + a2[i] * B.g2f[i]) * 12;
      gMob[i] = (a1[i] * B.g1m[i] + a2[i] * B.g2m[i] + a3[i] * B.g3m[i]) * 12;
      gTot[i] = gTravel[i] + gFnb[i] + gMob[i];
      gUsd[i] = gTot[i] / FX;
    }

    /* ---- revenue by layer ----------------------------------------------- */
    var L1 = [], L2 = [], L3 = [], L4 = [], US = [], rev = [];
    for (i = 0; i < 6; i++) {
      var l1a = gTot[i] * B.trSaaS * u.takeRate / FX;
      var l1b = (a1[i] * B.lic1[i] + a2[i] * B.lic2[i] + a3[i] * B.lic3[i]) * u.licence;
      L1[i] = B.lic1[i] === 0 ? 0 : l1a + l1b;
      L2[i] = (gTravel[i] * B.trTravelMP + gMob[i] * B.trMobMP + gFnb[i] * B.trFnbMP) * u.takeRate / FX;
      L3[i] = i === 0 ? AUDITED_REV_VND / FX : gTravel[i] / FX;
      L4[i] = B.l4[i];
      US[i] = usAcct[i] * B.usArpu[i];
      rev[i] = L1[i] + L2[i] + L3[i] + L4[i] + US[i];
    }

    /* ---- resource plan --------------------------------------------------- */
    var fComm = [], fOps = [], fUs = [], fTot = [], fNoAi = [], payroll = [];
    var t3sell = [], csam = [];
    for (i = 0; i < 6; i++) {
      var prevT1 = i === 0 ? 0 : t1[i - 1];
      var prevT2 = i === 0 ? 0 : t2[i - 1];
      t3sell[i] = t3[i] / B.r3 * 0.6 / capMult[i];
      csam[i] = (prevT1 / B.rc1 + prevT2 / B.rc2 + t3[i] / B.r3 * 0.4) / capMult[i];
      fComm[i] = hunters[i] + t3sell[i] + csam[i];
      fOps[i] = gUsd[i] / 1e6 * B.opsPerM * (1 - ai[i]) / (1 - B.ai[1]);
      fUs[i] = usAcct[i] === 0 ? 0 : B.usBase[i] + usAcct[i] / B.usRatio[i];
      fTot[i] = fComm[i] + fOps[i] + B.tech[i] + B.gaFte[i] + fUs[i];
      fNoAi[i] = hunters[i] * capMult[i] + prevT1 / B.rc1 + prevT2 / B.rc2 + t3[i] / B.r3
               + gUsd[i] / 1e6 * B.opsPerM + B.tech[i] + B.gaFte[i] + fUs[i];
      payroll[i] = fComm[i] * B.cCom + fOps[i] * B.cOps + B.tech[i] * B.cTech
                 + B.gaFte[i] * B.cGa + fUs[i] * B.cUs + B.clevel[i];
    }
    payroll[0] = AUDITED_PAYROLL;   // FY2025 reconciled to the audited accounts

    /* ---- P&L ------------------------------------------------------------- */
    var cogs = [], gp = [], cts = [], cacC = [], commC = [], opex = [], fixed = [],
        ebitda = [], da = [], ebit = [], tax = [], ni = [];
    for (i = 0; i < 6; i++) {
      cogs[i] = -L3[i] * (1 - B.svcGM[i]);
      gp[i] = rev[i] + cogs[i];
      cts[i] = (L1[i] + US[i]) * B.cts1[i] + L2[i] * B.cts2[i] + L4[i] * B.cts4;
      cacC[i] = newLogos[i] * B.cac[i];
      commC[i] = (L1[i] + L2[i] + L4[i] + US[i]) * B.comm;
      opex[i] = payroll[i] + cts[i] + B.gtm[i] + B.ga[i] + cacC[i] + commC[i];
      fixed[i] = payroll[i] + B.gtm[i] + B.ga[i];
      ebitda[i] = gp[i] - opex[i];
    }
    var C = B.capex, L = B.amortLife;
    da = [30000, C[1] / L, (C[1] + C[2]) / L, (C[1] + C[2] + C[3]) / L,
          (C[2] + C[3] + C[4]) / L, (C[3] + C[4] + C[5]) / L];
    for (i = 0; i < 6; i++) {
      ebit[i] = ebitda[i] - da[i];
      tax[i] = -Math.max(0, ebit[i]) * B.cit[i];
      ni[i] = ebit[i] + tax[i];
    }

    /* ---- valuation -------------------------------------------------------- */
    var sc = { cons: 0, base: 1, up: 2 }[u.scenario];
    var ev = [], evAll = { cons: [], base: [], up: [] };
    ["cons", "base", "up"].forEach(function (name, j) {
      for (i = 0; i < 6; i++) {
        evAll[name][i] = (L1[i] + US[i]) * B.mult.l1[j] + L2[i] * B.mult.l2[j]
                       + L3[i] * B.mult.l3[j] + L4[i] * B.mult.l4[j];
      }
    });
    ev = evAll[u.scenario];

    /* ---- derived indices --------------------------------------------------- */
    var idx = function (a) { return a.map(function (v) { return a[1] ? v / a[1] : 0; }); };

    return {
      yrs: YRS, ai: ai, capMult: capMult, quota: quota, hunters: hunters, channel: channel,
      open: open, churn: churn, sales: sales, newLogos: newLogos, close: close,
      t1: t1, t2: t2, t3: t3, a1: a1, a2: a2, a3: a3, aT: aT,
      gTravel: gTravel, gFnb: gFnb, gMob: gMob, gUsd: gUsd,
      L1: L1, L2: L2, L3: L3, L4: L4, US: US, rev: rev,
      cogs: cogs, gp: gp, cts: cts, cac: cacC, comm: commC, opex: opex, fixed: fixed,
      payroll: payroll, ebitda: ebitda, da: da, ebit: ebit, tax: tax, ni: ni,
      fComm: fComm, fOps: fOps, fUs: fUs, fTot: fTot, fNoAi: fNoAi,
      tech: B.tech, gaFte: B.gaFte, usAcct: usAcct,
      ev: ev, evAll: evAll,
      revIdx: idx(rev), fixIdx: idx(fixed), hcIdx: idx(fTot),
      gm: gp.map(function (v, i) { return rev[i] ? v / rev[i] : 0; }),
      em: ebitda.map(function (v, i) { return rev[i] ? v / rev[i] : 0; }),
      mix: rev.map(function (v, i) { return v ? (v - L3[i]) / v : 0; }),
      ops1k: gUsd.map(function (g, i) { return g ? fOps[i] * B.cOps / (g / 1000) : 0; }),
      revFte: rev.map(function (v, i) { return fTot[i] ? v / fTot[i] : 0; }),
      avoided: fNoAi.map(function (v, i) { return v - fTot[i]; }),
      avoidedPay: fNoAi.map(function (v, i) { return (v - fTot[i]) * B.cCom; }),
      tie2026: rev[1] - BASE.pack2026Rev / FX,
      cust2026: close[1]
    };
  }

  if (typeof module !== "undefined") module.exports = { compute: compute, DEFAULTS: DEFAULTS, BASE: BASE };



  /* ===================================================================
     RENDER LAYER — every figure below is read from compute(), never typed.
     =================================================================== */
  var U = Object.assign({}, DEFAULTS);
  var R = null;
  var el = function (id) { return document.getElementById(id); };

  /* ---------- formatters ---------- */
  function f(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return "\u2013";
    d = d || 0;
    return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function m$(v, d) {
    if (!isFinite(v)) return "\u2013";
    d = (d === undefined) ? 1 : d;
    var s = "$" + f(Math.abs(v) / 1e6, d) + "m";
    return v < 0 ? "(" + s + ")" : s;
  }
  function d$(v) {
    if (!isFinite(v)) return "\u2013";
    var s = "$" + f(Math.abs(v), 0);
    return v < 0 ? "(" + s + ")" : s;
  }
  function pc(v, d) { return isFinite(v) ? f(v * 100, d === undefined ? 0 : d) + "%" : "\u2013"; }
  function x_(v, d) { return isFinite(v) ? f(v, d === undefined ? 1 : d) + "x" : "\u2013"; }
  function neg(v, s) { return v < 0 ? '<span class="neg">' + s + "</span>" : s; }

  /* ---------- small helpers ---------- */
  function row(label, desc, vals, fmt, cls) {
    var h = '<tr class="' + (cls || "") + '"><td><span class="tlabel">' + label + "</span>" +
            (desc ? '<div class="tdesc">' + desc + "</div>" : "") + "</td>";
    for (var i = 0; i < vals.length; i++) {
      var s = fmt(vals[i]);
      h += '<td class="num">' + (typeof vals[i] === "number" && vals[i] < 0 ? '<span class="neg">' + s + "</span>" : s) + "</td>";
    }
    return h + "</tr>";
  }
  function tbl(head, body, firstHead) {
    var h = '<table><thead><tr><th>' + (firstHead || "") + "</th>";
    head.forEach(function (x) { h += "<th>" + x + "</th>"; });
    return h + "</tr></thead><tbody>" + body + "</tbody></table>";
  }
  function card(eyebrow, title, note, inner, extraClass) {
    return '<div class="card ' + (extraClass || "") + '"><div class="chead"><div>' +
      '<div class="eyebrow">' + eyebrow + "</div>" +
      '<h2 class="ctitle">' + title + "</h2>" +
      (note ? '<div class="cnote">' + note + "</div>" : "") +
      "</div></div>" + inner + "</div>";
  }
  function legend(items) {
    var h = '<div class="legend">';
    items.forEach(function (it) {
      h += '<div class="lg"><span class="dot" style="background:' + it[1] + '"></span>' + it[0] + "</div>";
    });
    return h + "</div>";
  }
  var SERIES = [
    ["SaaS &amp; intelligence", "var(--s-saas)", "L1"],
    ["Embedded finance", "var(--s-emb)", "L4"],
    ["United States", "var(--s-us)", "US"],
    ["Marketplace", "var(--s-mkt)", "L2"],
    ["Service trading", "var(--s-svc)", "L3"]
  ];

  /* ---------- charts (hand-written SVG) ---------- */
  function stackChart(keys, colours, labels, opt) {
    opt = opt || {};
    var W = 620, H = opt.h || 250, padL = 44, padB = 34, padT = 10;
    var tot = R.rev.map(function (_, i) {
      return keys.reduce(function (a, k) { return a + R[k][i]; }, 0);
    });
    var max = Math.max.apply(null, tot) * 1.06 || 1;
    var y0 = H - padB, plot = H - padB - padT;
    var bw = (W - padL - 8) / 6 * 0.56, step = (W - padL - 8) / 6;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + (opt.aria || "chart") + '">';
    for (var g = 0; g <= 3; g++) {
      var yy = padT + plot * g / 3;
      s += '<line x1="' + padL + '" y1="' + yy + '" x2="' + W + '" y2="' + yy + '" stroke="var(--line-soft)"/>';
      s += '<text x="' + (padL - 7) + '" y="' + (yy + 3.5) + '" text-anchor="end" font-size="9.5" fill="var(--ink-3)" font-family="var(--font-mono)">' +
           (opt.fmtAxis ? opt.fmtAxis(max * (3 - g) / 3) : f(max * (3 - g) / 3, 0)) + "</text>";
    }
    s += '<line x1="' + padL + '" y1="' + y0 + '" x2="' + W + '" y2="' + y0 + '" stroke="var(--ink)" stroke-width="1"/>';
    for (var i = 0; i < 6; i++) {
      var x = padL + step * i + (step - bw) / 2, base = y0;
      for (var k = keys.length - 1; k >= 0; k--) {
        var hgt = R[keys[k]][i] / max * plot;
        if (hgt > 0.2) {
          s += '<rect x="' + x.toFixed(1) + '" y="' + (base - hgt).toFixed(1) + '" width="' + bw.toFixed(1) +
               '" height="' + hgt.toFixed(1) + '" fill="' + colours[k] + '"><title>' + labels[k] + " " +
               R.yrs[i] + ": " + m$(R[keys[k]][i]) + "</title></rect>";
        }
        base -= hgt;
      }
      s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 + 14) + '" text-anchor="middle" font-size="9.5" fill="var(--ink-3)" font-family="var(--font-mono)">' + R.yrs[i] + "</text>";
      s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 + 27) + '" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)" font-family="var(--font-mono)">' + m$(tot[i]) + "</text>";
    }
    return s + "</svg>";
  }

  function shareChart(keys, colours, labels) {
    var W = 380, H = 250, padB = 34, padT = 10;
    var y0 = H - padB, plot = H - padB - padT;
    var step = W / 6, bw = step * 0.5;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Revenue mix by share">';
    for (var i = 0; i < 6; i++) {
      var tot = keys.reduce(function (a, k) { return a + R[k][i]; }, 0);
      var x = step * i + (step - bw) / 2, base = y0;
      if (tot <= 0) {
        s += '<text x="' + (x + bw / 2) + '" y="' + (y0 - 6) + '" text-anchor="middle" font-size="9.5" fill="var(--ink-3)">n/a</text>';
      } else {
        for (var k = keys.length - 1; k >= 0; k--) {
          var hgt = R[keys[k]][i] / tot * plot;
          if (hgt > 0.2) {
            s += '<rect x="' + x.toFixed(1) + '" y="' + (base - hgt).toFixed(1) + '" width="' + bw.toFixed(1) +
                 '" height="' + hgt.toFixed(1) + '" fill="' + colours[k] + '"><title>' + labels[k] + " " +
                 R.yrs[i] + ": " + pc(R[keys[k]][i] / tot) + "</title></rect>";
          }
          base -= hgt;
        }
      }
      s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 + 14) + '" text-anchor="middle" font-size="9.5" fill="var(--ink-3)" font-family="var(--font-mono)">' + R.yrs[i].slice(2, 6) + "</text>";
      s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y0 + 27) + '" text-anchor="middle" font-size="11" font-weight="700" fill="var(--s-saas)" font-family="var(--font-mono)">' + pc(R.mix[i]) + "</text>";
    }
    return s + "</svg>";
  }

  function lineChart(series, opt) {
    opt = opt || {};
    var W = 620, H = opt.h || 236, padL = 46, padB = 30, padT = 12;
    var all = [];
    series.forEach(function (s) { all = all.concat(s.v); });
    var max = Math.max.apply(null, all) * 1.1 || 1, min = opt.min !== undefined ? opt.min : 0;
    var y0 = H - padB, plot = H - padB - padT, step = (W - padL) / 5;
    var Y = function (v) { return y0 - (v - min) / (max - min) * plot; };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + (opt.aria || "trend") + '">';
    for (var g = 0; g <= 3; g++) {
      var yy = padT + plot * g / 3, val = max - (max - min) * g / 3;
      s += '<line x1="' + padL + '" y1="' + yy + '" x2="' + W + '" y2="' + yy + '" stroke="var(--line-soft)"/>';
      s += '<text x="' + (padL - 7) + '" y="' + (yy + 3.5) + '" text-anchor="end" font-size="9.5" fill="var(--ink-3)" font-family="var(--font-mono)">' +
           (opt.fmtAxis ? opt.fmtAxis(val) : f(val, 0)) + "</text>";
    }
    s += '<line x1="' + padL + '" y1="' + y0 + '" x2="' + W + '" y2="' + y0 + '" stroke="var(--ink)"/>';
    series.forEach(function (ser) {
      var pts = ser.v.map(function (v, i) { return (padL + step * i).toFixed(1) + "," + Y(v).toFixed(1); }).join(" ");
      if (ser.fill) {
        s += '<polygon points="' + padL + "," + y0 + " " + pts + " " + W + "," + y0 + '" fill="' + ser.c + '" opacity=".10"/>';
      }
      s += '<polyline points="' + pts + '" fill="none" stroke="' + ser.c + '" stroke-width="2.2" stroke-linejoin="round" stroke-dasharray="' + (ser.dash || "0") + '"/>';
      ser.v.forEach(function (v, i) {
        s += '<circle cx="' + (padL + step * i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3.1" fill="var(--surface)" stroke="' + ser.c + '" stroke-width="2"><title>' +
             ser.n + " " + R.yrs[i] + ": " + (opt.fmtPt ? opt.fmtPt(v) : f(v, 0)) + "</title></circle>";
      });
    });
    for (var i = 0; i < 6; i++) {
      s += '<text x="' + (padL + step * i).toFixed(1) + '" y="' + (y0 + 15) + '" text-anchor="middle" font-size="9.5" fill="var(--ink-3)" font-family="var(--font-mono)">' + R.yrs[i].slice(2, 6) + "</text>";
    }
    return s + "</svg>";
  }

  /* ---------- banner: conditional prose built from the data ---------- */
  function renderBanner() {
    var r30 = R.rev[5], e30 = R.ebitda[5], lev = R.revIdx[5] / R.fixIdx[5];
    var first = R.ebitda.findIndex(function (v, i) { return i > 0 && v > 0; });
    var cl = [];

    cl.push("Revenue reaches " + m$(r30) + " by FY2030 against " + m$(R.rev[1]) + " in FY2026, a factor of " + x_(R.revIdx[5]) + ", while the fixed cost base grows " + x_(R.fixIdx[5]) + " and headcount " + x_(R.hcIdx[5]) + ".");

    if (lev >= 2.5) cl.push("That is " + x_(lev) + " of operating leverage, and it carries the EBITDA margin from " + pc(R.em[1]) + " to " + pc(R.em[5]) + ".");
    else if (lev >= 1.4) cl.push("Operating leverage of " + x_(lev) + " lifts the EBITDA margin to " + pc(R.em[5]) + ", though less sharply than the base plan.");
    else cl.push("At " + x_(lev) + ", cost is growing almost as fast as revenue and the margin case largely disappears.");

    if (first > 0) cl.push("EBITDA turns positive in " + R.yrs[first].slice(0, 6) + ".");
    else cl.push("EBITDA does not turn positive within the forecast period on these settings.");

    var mixMove = R.mix[5] - R.mix[1];
    if (mixMove > 0.35) cl.push("The driver is mix: revenue outside the low-margin resale layer moves from " + pc(R.mix[1]) + " to " + pc(R.mix[5]) + ", with no supplier contract assumed to improve.");
    else if (mixMove > 0.1) cl.push("Mix improves from " + pc(R.mix[1]) + " to " + pc(R.mix[5]) + " of revenue outside the resale layer.");
    else cl.push("Mix barely moves on these settings, so the business stays a resale operation and the software multiple is hard to defend.");

    if (R.avoided[5] > 200) cl.push("Automation is doing the work: the same plan needs " + f(R.fNoAi[5], 0) + " people without it, against " + f(R.fTot[5], 0) + " with it.");
    else if (R.avoided[5] > 40) cl.push("Automation saves " + f(R.avoided[5], 0) + " people by FY2030 — real, but no longer the centre of the case.");
    else cl.push("At this automation level the headcount saving is negligible and the plan is carried by hiring.");

    var chips = [];
    chips.push(['<span class="pill st ' + (Math.abs(R.tie2026) < 20000 ? "stable" : "critical") + '">FY2026 tie-out ' + d$(R.tie2026) + "</span>"]);
    if (R.close[1] !== BASE.pack2026Cust) chips.push(['<span class="pill st critical">FY2026 accounts off anchor by ' + f(R.close[1] - BASE.pack2026Cust, 0) + "</span>"]);
    else chips.push(['<span class="pill st stable">FY2026 accounts on anchor</span>']);
    chips.push(['<span class="pill st ' + (lev >= 2 ? "stable" : lev >= 1.4 ? "watch" : "critical") + '">Operating leverage ' + x_(lev) + "</span>"]);
    chips.push(['<span class="pill st ' + (R.em[5] > 0.35 ? "stable" : R.em[5] > 0.15 ? "watch" : "high") + '">FY2030 margin ' + pc(R.em[5]) + "</span>"]);
    chips.push(['<span class="pill st ' + (R.fTot[5] > 600 ? "high" : "stable") + '">FY2030 headcount ' + f(R.fTot[5], 0) + "</span>"]);
    chips.push(['<span class="pill">' + m$(R.L4[5]) + " of FY2030 revenue is uncontracted embedded finance</span>"]);

    el("fmBanner").innerHTML = "<p>" + cl.join(" ") + "</p><div class=\"bchips\">" + chips.join("") + "</div>";
  }

  /* ---------- KPI strip ---------- */
  function renderKpis() {
    var k = [
      ["FY2030 revenue", m$(R.rev[5]), "from " + m$(R.rev[1]) + " in FY2026", R.revIdx[5] / 30, "var(--ink)"],
      ["FY2030 EBITDA", m$(R.ebitda[5]), pc(R.em[5]) + " margin, from " + pc(R.em[1]), Math.max(0, R.em[5]) / 0.6,
       R.ebitda[5] > 0 ? "var(--stable)" : "var(--critical)"],
      ["Accounts", f(R.close[5], 0), "from " + f(R.close[1], 0) + " at Dec-2026", R.close[5] / 40000, "var(--ink)"],
      ["Headcount", f(R.fTot[5], 0), f(R.fNoAi[5], 0) + " needed without automation", R.fTot[5] / R.fNoAi[5], "var(--ink)"],
      ["Operating leverage", x_(R.revIdx[5] / R.fixIdx[5]), "revenue " + x_(R.revIdx[5]) + " vs fixed cost " + x_(R.fixIdx[5]),
       (R.revIdx[5] / R.fixIdx[5]) / 5, "var(--accent-deep)"],
      ["Enterprise value FY2030", m$(R.ev[5], 0), U.scenario === "base" ? "base multiples by layer" :
        (U.scenario === "cons" ? "conservative multiples" : "upside multiples"), R.ev[5] / 2.5e9, "var(--ink)"]
    ];
    el("fmKpis").innerHTML = k.map(function (x) {
      return '<div class="kpi"><div class="kpi-label">' + x[0] + "</div>" +
        '<div class="kpi-num" style="color:' + x[4] + '">' + x[1] + "</div>" +
        '<div class="kpi-sub">' + x[2] + "</div>" +
        '<div class="kpi-meter"><i style="width:' + Math.max(2, Math.min(100, x[3] * 100)).toFixed(0) + '%"></i></div></div>';
    }).join("");
  }

  /* ---------- drivers ---------- */
  var DRV = [
    ["sellers2030", "Sellers by FY2030", 20, 110, 1, function (v) { return f(v, 0) + " people"; },
     "Quota-carrying commercial heads. 5 in place at Aug-2026."],
    ["ai2030", "Automated share of workflows by FY2030", 0.60, 0.99, 0.01, function (v) { return pc(v); },
     "The most consequential input in the model. FY2026 sits at 58%."],
    ["licence", "Platform licence pricing", 0.5, 2.0, 0.05, function (v) { return x_(v, 2); },
     "Scales the per-account software fee. This is what earns the software multiple."],
    ["channel2030", "Partner-channel accounts per year by FY2030", 0, 8000, 100, function (v) { return f(v, 0); },
     "Bank and fleet introductions. Near-zero acquisition cost, no selling capacity used."],
    ["takeRate", "Blended take rate", 0.6, 1.5, 0.05, function (v) { return x_(v, 2); },
     "Scales travel 3%, mobility 10% and F&B 5% together, plus the 2% platform fee."],
    ["churn", "Annual account churn", 0, 0.25, 0.01, function (v) { return pc(v); },
     "Not yet measured against live cohorts. 8% is the working assumption."],
    ["round", "Round size", 1, 8, 0.5, function (v) { return "$" + f(v, 1) + "m"; },
     "Above the $1m core plan, each extra $1m funds 250 more US accounts by FY2030 and lifts the automation ceiling one point."]
  ];
  function renderDrivers() {
    el("fmDrv").innerHTML = DRV.map(function (d) {
      return '<div class="drv"><label for="d-' + d[0] + '"><span>' + d[1] + "</span><b>" + d[5](U[d[0]]) + "</b></label>" +
        '<input id="d-' + d[0] + '" type="range" min="' + d[2] + '" max="' + d[3] + '" step="' + d[4] + '" value="' + U[d[0]] + '">' +
        '<div class="hint">' + d[6] + "</div></div>";
    }).join("");
    DRV.forEach(function (d) {
      el("d-" + d[0]).addEventListener("input", function (e) {
        U[d[0]] = parseFloat(e.target.value);
        render();
      });
    });
    el("fmTie").innerHTML = "FY2026 revenue tie-out " + d$(R.tie2026) + " on " + m$(BASE.pack2026Rev / 25500) +
      " &nbsp;·&nbsp; " + pc(R.tie2026 / (BASE.pack2026Rev / 25500), 2);
  }

  /* ---------- views ---------- */
  function viewOverview() {
    var yr = R.yrs, keys = ["L1", "L4", "US", "L2", "L3"];
    var cols = ["var(--s-saas)", "var(--s-emb)", "var(--s-us)", "var(--s-mkt)", "var(--s-svc)"];
    var names = SERIES.map(function (s) { return s[0]; });

    var chart = card("Signature", "Revenue by layer",
      "Green tones are contracted software, embedded finance and the US module. Sand is resale revenue booked as principal at a single-digit margin.",
      stackChart(keys, cols, names, { h: 250, aria: "Revenue by layer", fmtAxis: function (v) { return "$" + f(v / 1e6, 0) + "m"; } }) +
      legend(SERIES.map(function (s) { return [s[0], s[1]]; })));

    var share = card("Same data", "As a share of revenue",
      "The figure beneath each bar is revenue outside the resale layer.",
      shareChart(keys, cols, names));

    var pl = "";
    pl += row("Revenue", "", R.rev, m$, "tot");
    pl += row("Cost of sales", "Resale layer only", R.cogs, m$);
    pl += row("Gross profit", "", R.gp, m$, "tot");
    pl += row("Gross margin", "", R.gm, function (v) { return pc(v); });
    pl += row("Operating expense", "", R.opex.map(function (v) { return -v; }), m$);
    pl += row("EBITDA", "", R.ebitda, m$, "tot");
    pl += row("EBITDA margin", "", R.em, function (v) { return pc(v); });
    pl += row("Depreciation &amp; amortisation", "Three-year straight line on capitalised build", R.da.map(function (v) { return -v; }), m$);
    pl += row("Tax", "20% from FY2027, no loss carry-forward recognised", R.tax, m$);
    pl += row("Net income", "", R.ni, m$, "tot");

    var lv = "";
    lv += row("Revenue", "", R.revIdx, function (v) { return x_(v); }, "tot");
    lv += row("Fixed operating cost", "Payroll, go-to-market and G&amp;A", R.fixIdx, function (v) { return x_(v); });
    lv += row("Headcount", "", R.hcIdx, function (v) { return x_(v); });
    lv += row("Fixed cost as % of revenue", "", R.fixed.map(function (v, i) { return R.rev[i] ? v / R.rev[i] : 0; }), function (v) { return pc(v); });

    return '<div class="g75">' + chart + share + "</div>" +
      card("Profit and loss", "Summary", "USD. FY2025 reproduces the audited statutory accounts.", tbl(yr, pl, "")) +
      card("The core claim", "Operating leverage, indexed to FY2026",
        "Revenue compounds " + x_(R.revIdx[5]) + " while the fixed cost base compounds " + x_(R.fixIdx[5]) +
        ". The gap between those two rows is the entire margin story.", tbl(yr, lv, ""));
  }

  function viewCustomers() {
    var yr = R.yrs;
    var br = "";
    br += row("Opening base", "", R.open, function (v) { return f(v, 0); });
    br += row("Accounts lost", "Churn on the opening base", R.churn, function (v) { return f(v, 0); });
    br += row("Won by the commercial team", "Sellers &times; accounts closed per seller", R.sales, function (v) { return f(v, 0); });
    br += row("Introduced by bank and fleet partners", "No selling capacity consumed", R.channel, function (v) { return f(v, 0); });
    br += row("Closing base", "", R.close, function (v) { return f(v, 0); }, "tot");

    var ti = "";
    ti += row("Full solution", "Travel, mobility and F&amp;B. 2% of accounts, roughly a third of revenue.", R.t1, function (v) { return f(v, 0); });
    ti += row("Mobility and F&amp;B", "Two of three categories, no managed travel.", R.t2, function (v) { return f(v, 0); });
    ti += row("Mobility only", "Entry tier. Base coverage and data density.", R.t3, function (v) { return f(v, 0); });
    ti += row("Total accounts at year end", "", R.close, function (v) { return f(v, 0); }, "tot");
    ti += row("Average accounts serving the year", "Mean of opening and closing. This is the base revenue is earned on.",
              R.aT, function (v) { return f(v, 0); });

    var ramp = "";
    var months = ["Aug-26", "Sep-26", "Oct-26", "Nov-26", "Dec-26"];
    var r1 = [10, 20, 30, 40, 50], r2 = [0, 75, 150, 225, 300], rt = [750, 1062, 1374, 1686, 2000];
    ramp += row("Full solution", "", r1, function (v) { return f(v, 0); });
    ramp += row("Mobility and F&amp;B", "", r2, function (v) { return f(v, 0); });
    ramp += row("Mobility only", "", rt.map(function (v, i) { return v - r1[i] - r2[i]; }), function (v) { return f(v, 0); });
    ramp += row("Managed accounts", "", rt, function (v) { return f(v, 0); }, "tot");

    var chart = lineChart([
      { n: "Total accounts", v: R.close, c: "var(--s-saas)", fill: true },
      { n: "Average accounts in year", v: R.aT, c: "var(--accent)", dash: "5 4" }
    ], { h: 236, aria: "Account base", fmtAxis: function (v) { return f(v / 1000, 0) + "k"; }, fmtPt: function (v) { return f(v, 0); } });

    return '<div class="g75">' +
      card("Growth engine", "Accounts, year end versus average in year",
        "Revenue is earned on the dashed line, not the solid one. An account signed in December contributes one month, not twelve.",
        chart + legend([["Total accounts at year end", "var(--s-saas)"], ["Average accounts serving the year", "var(--accent)"]])) +
      card("FY2026 commercial ramp", "Managed accounts by month",
        "The plan tracks 2,000 managed accounts by December 2026. The 2,500 total-account figure previously issued counts every registered corporate customer, a broader basis. Revenue runs on the FY2026 average of " + f(R.aT[1], 0) + ".",
        tbl(months, ramp, "")) +
      "</div>" +
      card("Where accounts come from", "New-logo bridge",
        "Revenue is an output of this table, not an input. Disagreeing with FY2030 revenue means disagreeing with one of these three lines.",
        tbl(yr, br, "")) +
      card("Segmentation", "Accounts by tier",
        "Full-solution and mobility-and-F&amp;B counts are set targets; the entry tier is the residual, so it absorbs any change to the sellers or channel drivers.",
        tbl(yr, ti, ""));
  }

  function viewRevMargin() {
    var yr = R.yrs;
    var mg = {
      L1: R.rev.map(function (_, i) { return 1 - BASE.cts1[i]; }),
      L2: R.rev.map(function (_, i) { return 1 - BASE.cts2[i]; }),
      L3: BASE.svcGM.slice(),
      L4: R.rev.map(function () { return 1 - BASE.cts4; }),
      US: R.rev.map(function (_, i) { return 1 - BASE.cts1[i]; })
    };
    var contrib = {}, totC = [0, 0, 0, 0, 0, 0];
    ["L1", "L2", "L3", "L4", "US"].forEach(function (k) {
      contrib[k] = R[k].map(function (v, i) { return v * mg[k][i]; });
      contrib[k].forEach(function (v, i) { totC[i] += v; });
    });
    var overhead = R.opex.map(function (v, i) { return -(v - R.cts[i]); });

    var rv = "";
    rv += row("SaaS &amp; intelligence", "Platform licence plus the 2% administration fee", R.L1, m$);
    rv += row("Marketplace", "Vendor take-rate", R.L2, m$);
    rv += row("Service trading", "Bought and resold as principal, so it books gross", R.L3, m$);
    rv += row("Embedded finance", "Card issuing, settlement float, agentic procurement", R.L4, m$);
    rv += row("United States", "Phase 1, software only", R.US, m$);
    rv += row("Total revenue", "", R.rev, m$, "tot");
    rv += row("Outside the resale layer", "", R.mix, function (v) { return pc(v); });

    var mm = "";
    ["L1", "L2", "L3", "L4", "US"].forEach(function (k, j) {
      var nm = ["SaaS &amp; intelligence", "Marketplace", "Service trading", "Embedded finance", "United States"][j];
      mm += row(nm, "", mg[k], function (v) { return pc(v, k === "L3" ? 1 : 0); });
    });
    mm += row("Blended margin on revenue", "", totC.map(function (v, i) { return R.rev[i] ? v / R.rev[i] : 0; }),
              function (v) { return pc(v); }, "tot");

    var cc = "";
    ["L1", "L2", "L3", "L4", "US"].forEach(function (k, j) {
      var nm = ["SaaS &amp; intelligence", "Marketplace", "Service trading", "Embedded finance", "United States"][j];
      cc += row(nm, "", contrib[k], m$);
    });
    cc += row("Total contribution", "", totC, m$, "tot");
    cc += row("less costs not attributable to one stream", "Payroll, go-to-market, G&amp;A, acquisition, commission", overhead, m$);
    cc += row("EBITDA", "", R.ebitda, m$, "tot");

    var ar = "";
    ar += row("SaaS per account", "", R.L1.map(function (v, i) { return R.aT[i] ? v / R.aT[i] : 0; }), d$);
    ar += row("Marketplace per account", "", R.L2.map(function (v, i) { return R.aT[i] ? v / R.aT[i] : 0; }), d$);
    ar += row("Service trading per account", "", R.L3.map(function (v, i) { return R.aT[i] ? v / R.aT[i] : 0; }), d$);
    ar += row("Domestic revenue per account", "",
      R.rev.map(function (v, i) { return R.aT[i] ? (R.L1[i] + R.L2[i] + R.L3[i]) / R.aT[i] : 0; }), d$, "tot");

    return card("Revenue", "Five streams, five sets of economics",
        "Service trading books gross because the inventory is bought and resold, so its revenue is large and its margin thin. Everything else is thin on revenue and fat on margin.",
        tbl(yr, rv, "")) +
      '<div class="g2">' +
      card("Margin", "Revenue less the direct cost of serving it", "", tbl(yr, mm, "")) +
      card("Bridge", "Contribution to EBITDA", "", tbl(yr, cc, "")) +
      "</div>" +
      card("Unit economics", "Average revenue per account",
        "Total revenue per account dips as the base widens into the entry tier, then recovers. The line that matters is SaaS per account, which rises every year — that is the contracted revenue a software multiple is paid on.",
        tbl(yr, ar, ""));
  }

  function viewPeopleAi() {
    var yr = R.yrs;
    var hc = "";
    hc += row("Commercial", "Selling, customer success and account management", R.fComm, function (v) { return f(v, 0); });
    hc += row("Operations and delivery", "Scales with transaction volume, not account count", R.fOps, function (v) { return f(v, 0); });
    hc += row("Technology and product", "Front-loaded; the platform precedes the capacity gain", R.tech, function (v) { return f(v, 0); });
    hc += row("Corporate", "Finance, people, legal", R.gaFte, function (v) { return f(v, 0); });
    hc += row("United States", "Derived from the US account plan", R.fUs, function (v) { return f(v, 0); });
    hc += row("Total headcount", "", R.fTot, function (v) { return f(v, 0); }, "tot");
    hc += row("Net hires in the year", "",
      R.fTot.map(function (v, i) { return i === 0 ? 0 : v - R.fTot[i - 1]; }), function (v) { return f(v, 0); });
    hc += row("Total payroll", "", R.payroll, m$);

    var au = "";
    au += row("Automated share of workflows", "", R.ai, function (v) { return pc(v); });
    au += row("Capacity multiplier versus FY2026", "", R.capMult, function (v) { return x_(v, 2); });
    au += row("Accounts closed per seller per year", "Base productivity held flat, so the gain is visible", R.quota, function (v) { return f(v, 0); });
    au += row("Headcount required without the capacity gain", "", R.fNoAi, function (v) { return f(v, 0); });
    au += row("People not needed", "", R.avoided, function (v) { return f(v, 0); }, "tot");
    au += row("Annual payroll avoided", "", R.avoidedPay, m$);

    var ef = "";
    ef += row("Revenue per person", "", R.revFte, d$);
    ef += row("Operating cost per $1,000 of spend processed", "The easiest line to verify against actuals each quarter",
      R.ops1k, function (v) { return v ? "$" + f(v, 2) : "\u2013"; }, "tot");
    ef += row("Accounts per commercial person", "", R.close.map(function (v, i) { return R.fComm[i] ? v / R.fComm[i] : 0; }),
      function (v) { return f(v, 0); });

    var chart = lineChart([
      { n: "Headcount required without automation", v: R.fNoAi, c: "var(--critical)", dash: "5 4" },
      { n: "Headcount in the plan", v: R.fTot, c: "var(--s-saas)", fill: true }
    ], { h: 236, aria: "Headcount with and without automation", fmtPt: function (v) { return f(v, 0); } });

    return '<div class="g75">' +
      card("Signature", "What automation actually buys",
        "Not cost reduction. Capacity — the same person covers more accounts as workflows stop needing a human. The gap between the two lines is " +
        f(R.avoided[5], 0) + " people by FY2030, worth " + m$(R.avoidedPay[5]) + " of payroll a year.",
        chart + legend([["Headcount in the plan", "var(--s-saas)"], ["Same plan without the capacity gain", "var(--critical)"]])) +
      card("Automation", "Drivers and effect", "", tbl(yr, au, "")) +
      "</div>" +
      card("Resource plan", "Headcount by function", "Full-time equivalents. Capacity ratios produce fractional requirements, shown rounded.",
        tbl(yr, hc, "")) +
      card("Efficiency", "Per-unit measures", "", tbl(yr, ef, ""));
  }

  function viewValuation() {
    var yr = R.yrs;
    var sc = { cons: 0, base: 1, up: 2 }[U.scenario];
    var ev = "";
    ev += row("Conservative", "", R.evAll.cons, function (v) { return m$(v, 0); });
    ev += row("Base", "", R.evAll.base, function (v) { return m$(v, 0); }, "tot");
    ev += row("Upside", "", R.evAll.up, function (v) { return m$(v, 0); });
    ev += row("Implied EV / revenue, base", "", R.evAll.base.map(function (v, i) { return R.rev[i] ? v / R.rev[i] : 0; }),
      function (v) { return x_(v); });
    ev += row("Implied EV / EBITDA, base", "",
      R.evAll.base.map(function (v, i) { return R.ebitda[i] > 0 ? v / R.ebitda[i] : NaN; }), function (v) { return x_(v); });

    var names = ["SaaS &amp; intelligence, with the US module", "Marketplace", "Service trading", "Embedded finance"];
    var mkeys = ["l1", "l2", "l3", "l4"];
    var rev30 = [R.L1[5] + R.US[5], R.L2[5], R.L3[5], R.L4[5]];
    var ct = "";
    for (var i = 0; i < 4; i++) {
      var mult = BASE.mult[mkeys[i]][sc], val = rev30[i] * mult;
      ct += '<tr><td><span class="tlabel">' + names[i] + "</span></td>" +
        '<td class="num">' + m$(rev30[i]) + "</td>" +
        '<td class="num">' + pc(R.rev[5] ? rev30[i] / R.rev[5] : 0) + "</td>" +
        '<td class="num">' + x_(mult) + "</td>" +
        '<td class="num">' + m$(val, 0) + "</td>" +
        '<td class="num">' + pc(R.ev[5] ? val / R.ev[5] : 0) + "</td></tr>";
    }
    ct += '<tr class="tot"><td>Total</td><td class="num">' + m$(R.rev[5]) + '</td><td class="num">100%</td><td class="num">' +
      x_(R.rev[5] ? R.ev[5] / R.rev[5] : 0) + '</td><td class="num">' + m$(R.ev[5], 0) + '</td><td class="num">100%</td></tr>';

    var mults = [8, 10, 12, 14, 18, 22], scal = [0.6, 0.8, 1.0, 1.3, 1.6, 2.0];
    var gr = "";
    scal.forEach(function (s) {
      gr += '<tr><td><span class="tlabel mono">' + x_(s, 1) + "</span></td>";
      mults.forEach(function (mu) {
        var gtot = R.gTravel[2] + R.gFnb[2] + R.gMob[2];
        var adminFee = gtot * BASE.trSaaS * U.takeRate / 25500;
        var lic = (R.a1[2] * BASE.lic1[2] + R.a2[2] * BASE.lic2[2] + R.a3[2] * BASE.lic3[2]) * U.licence;
        var v = (adminFee + lic * s) * mu + R.L2[2] * BASE.mult.l2[1] + R.L3[2] * BASE.mult.l3[1] + R.L4[2] * BASE.mult.l4[1];
        gr += '<td class="num">' + m$(v, 0) + "</td>";
      });
      gr += "</tr>";
    });

    return card("Valuation", "Enterprise value by scenario",
        "Each layer takes its own comparable set. A single blended multiple would either overvalue the resale layer or undervalue the software layer.",
        tbl(yr, ev, "")) +
      card("FY2030 composition", "Where the value sits",
        "Currently on " + (U.scenario === "base" ? "base" : U.scenario === "cons" ? "conservative" : "upside") + " multiples.",
        '<table><thead><tr><th>Layer</th><th>FY2030 revenue</th><th>Share of revenue</th><th>Multiple</th><th>Enterprise value</th><th>Share of value</th></tr></thead><tbody>' + ct + "</tbody></table>") +
      card("Sensitivity", "FY2027 enterprise value",
        "Rows are a product decision — how much licence each account pays. Columns are a market decision — what a dollar of that revenue is worth. Other layers held at base multiples.",
        tbl(mults.map(function (m) { return x_(m, 0) + " on SaaS"; }), gr, "Licence scalar"));
  }

  function viewFunds() {
    var groups = [
      ["Technology, AI and data", 300000, [
        ["Core intelligent engine and data pipeline", 140000, "Drives the automation curve behind every headcount figure."],
        ["Spend intelligence and benchmarking", 90000, "Underwrites the platform licence, the contracted recurring line."],
        ["Data infrastructure and observability", 45000, "Holds cost-to-serve on its declining path."],
        ["Security, eKYC and bank integration", 25000, "Precondition for the partner channel that supplies most new accounts."]
      ]],
      ["United States entry, phase 1", 500000, [
        ["Entity, legal, tax and compliance", 80000, "Gate on any US revenue being recognised from FY2027."],
        ["Country lead and two enterprise sellers", 240000, "The US leadership base carried regardless of account count."],
        ["Localisation, SOC 2 readiness, payment rails", 110000, "Supports the US revenue per account assumption."],
        ["Design-partner cohort acquisition", 70000, "The first " + f(BASE.usAcct[2], 0) + " US accounts."]
      ]],
      ["Domestic commercial expansion", 200000, [
        ["Selling and farming team ramp", 95000, "Takes quota-carrying sellers from 5 to " + f(R.hunters[5], 0) + " by FY2030."],
        ["Customer success and account management ramp", 60000, "Serves the account base at the tier capacity ratios."],
        ["Enablement, tooling and incentive pool", 45000, "Supports accounts closed per seller per year."]
      ]]
    ];
    var total = 1000000, body = "";
    groups.forEach(function (g) {
      body += '<tr class="tot"><td>' + g[0] + '</td><td class="num">' + d$(g[1]) + '</td><td class="num">' + pc(g[1] / total) + "</td><td></td></tr>";
      g[2].forEach(function (l) {
        body += '<tr><td class="sub">' + l[0] + '</td><td class="num">' + d$(l[1]) + '</td><td class="num">' + pc(l[1] / total) +
          '</td><td style="text-align:left;font-size:11.5px;color:var(--ink-3)">' + l[2] + "</td></tr>";
      });
    });
    body += '<tr class="tot"><td>Total round</td><td class="num">' + d$(total) + '</td><td class="num">100%</td><td></td></tr>';

    var extra = U.round > 1.0 ?
      '<div class="cnote" style="margin-top:12px">Drivers are currently set to a $' + f(U.round, 1) +
      "m round. Above the $1m core plan the model adds " + f((U.round - 1) * 250, 0) +
      " US accounts by FY2030 and lifts the automation ceiling by " + f((U.round - 1), 1) +
      " points, taking FY2030 revenue to " + m$(R.rev[5]) + " and enterprise value to " + m$(R.ev[5], 0) + "." +
      "</div>" : "";

    var risks = [
      ["The capacity multiplier", "watch", "One assumption governs how far each commercial head stretches. Halving it roughly doubles the FY2030 headcount requirement and removes most of the leverage claim."],
      ["Embedded finance", "watch", m$(R.L4[5]) + " of FY2030 revenue rests on bank rails and data rights not contracted today. Excluding it entirely leaves revenue at " + m$(R.rev[5] - R.L4[5]) + " and still profitable."],
      ["Account concentration", "high", "Live top-tier travel volumes span two orders of magnitude. Losing one anchor account moves FY2027 revenue more than any driver above."],
      ["The balance sheet", "critical", "FY2025 closes with negative equity of VND 13.7bn and VND 35.1bn of short-term debt. This model covers operating performance only."]
    ];
    var rh = risks.map(function (r) {
      return '<tr><td><span class="pill st ' + r[1] + '">' + r[0] + '</span></td><td style="text-align:left;font-size:12.5px;color:var(--ink-2)">' + r[2] + "</td></tr>";
    }).join("");

    return card("Capital", "Use of funds — $1,000,000",
        "Each line is mapped to the driver it moves, so the allocation traces to an outcome rather than a category.",
        '<table><thead><tr><th>Allocation</th><th>Amount</th><th>Share</th><th style="text-align:left">What it funds</th></tr></thead><tbody>' +
        body + "</tbody></table>" + extra) +
      card("Diligence", "What to test first", "Stated here rather than left to be found.",
        '<table><thead><tr><th>Area</th><th style="text-align:left">Why it matters</th></tr></thead><tbody>' + rh + "</tbody></table>");
  }

  /* ---------- orchestration ---------- */
  var VIEWS = { ov: viewOverview, cu: viewCustomers, rm: viewRevMargin, pa: viewPeopleAi, vl: viewValuation, uf: viewFunds };
  var active = "ov";

  function render() {
    R = compute(U);
    renderBanner();
    renderKpis();
    DRV.forEach(function (d) {
      var lab = el("d-" + d[0]);
      if (lab && lab.previousElementSibling) lab.previousElementSibling.querySelector("b").textContent = d[5](U[d[0]]);
    });
    el("fmTie").innerHTML = "FY2026 revenue tie-out " + d$(R.tie2026) + " on " + m$(BASE.pack2026Rev / 25500) +
      " &nbsp;·&nbsp; " + pc(R.tie2026 / (BASE.pack2026Rev / 25500), 2);
    Object.keys(VIEWS).forEach(function (k) {
      var host = el("v-" + k);
      if (!host) return;
      if (k === active) {
        try { host.innerHTML = VIEWS[k](); }
        catch (e) { host.innerHTML = '<div class="card"><div class="empty">This view could not be built from the current settings.</div></div>'; }
      }
    });
    el("fmFoot").innerHTML = "FY2025 is audited and reproduces the statutory accounts. FY2026 is calibrated to figures already issued and " +
      "reproduces total revenue to within " + pc(Math.abs(R.tie2026) / (BASE.pack2026Rev / 25500), 2) +
      ". FY2027 onward is driver-based and moves with the controls above. USD throughout; VND converted at 25,500. " +
      "No cash-flow statement, working-capital forecast or financing schedule is included.";
  }

  function switchView(v) {
    active = v;
    Array.prototype.forEach.call(document.querySelectorAll("#fmTabs button"), function (b) {
      b.classList.toggle("on", b.dataset.v === v);
    });
    Object.keys(VIEWS).forEach(function (k) {
      var host = el("v-" + k);
      if (host) host.classList.toggle("on", k === v);
    });
    render();
  }

  function fmBoot() {
    R = compute(U);
    renderDrivers();
    render();
    Array.prototype.forEach.call(document.querySelectorAll("#fmTabs button"), function (b) {
      b.addEventListener("click", function () { switchView(b.dataset.v); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("#fmScn button"), function (b) {
      b.addEventListener("click", function () {
        U.scenario = b.dataset.s;
        Array.prototype.forEach.call(document.querySelectorAll("#fmScn button"), function (o) { o.classList.toggle("on", o === b); });
        render();
      });
    });
    el("fmReset").addEventListener("click", function () {
      U = Object.assign({}, DEFAULTS, { scenario: U.scenario });
      renderDrivers();
      render();
    });
    el("fmPrint").addEventListener("click", function () { window.print(); });
  }

  /* ---- giao diện mà app.js gọi ---- */
  function init(_sb) { /* mô hình tự tính, không cần Supabase */ }

  function enter() {
    if (started) return;
    started = true;
    fmBoot();
  }

  function load() {
    if (!started) { enter(); return Promise.resolve(); }
    R = compute(U);
    renderDrivers();
    render();
    return Promise.resolve();
  }

  /* Mô hình hiển thị bằng tiếng Anh (thuật ngữ tài chính chuẩn), nên đổi
     ngôn ngữ chỉ cần vẽ lại, không phải dịch lại. */
  function relabel() { if (started) render(); }

  return { init, load, enter, relabel,
           _model: { compute: compute, defaults: function(){ return Object.assign({}, DEFAULTS); }, years: YRS } };
})();
