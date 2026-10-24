/* ===== Déclarations CAFAT : calculs (fonctions pures) et remplissage des formulaires officiels ===== */
const CAFAT = (() => {
  const r = (x) => (x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5));
  const dmy = (d) => (d ? d.slice(8, 10) + d.slice(5, 7) + d.slice(0, 4) : "");
  const dmyy = (d) => (d ? d.slice(8, 10) + d.slice(5, 7) + d.slice(2, 4) : "");
  const up = (s) => String(s || "").toUpperCase();

  /* ---------- Paramètres par défaut (taux CAFAT 2026, plafonds mensuels) ---------- */
  const DEFAUT = {
    plafondT1: 548600, plafondAutres: 390900, plafondFSH: 329700,
    tauxRuamm1: 14.72,   // RUAMM tranche 1 (2,85 + 11,67) + FIAF (0,20)
    tauxRetraite: 14.0,  // 4,20 + 9,80
    tauxAutres: 8.015,   // chômage (0,34 + 1,72), prestations familiales 5,63, formation 0,25, dialogue social 0,075
    tauxRuamm2: null,    // à renseigner si un salarié dépasse le plafond de la tranche 1
  };
  function params(soc) {
    const d = { ...DEFAUT, ...(soc.dnt || {}) };
    const at = (soc.cotisations || []).find((c) => /accident/i.test(c.lib));
    const fsh = (soc.cotisations || []).find((c) => /habitat|fsh/i.test(c.lib));
    d.tauxATMP = d.tauxATMP ?? (at ? at.pat : 0);
    d.tauxFSH = d.tauxFSH ?? (fsh ? fsh.pat : 2);
    d.tauxCCS = d.tauxCCS ?? (soc.ccs ?? 3);
    return d;
  }

  /* Heures payées d'un bulletin, d'après ses lignes */
  function heuresBulletin(b) {
    let h = 0;
    for (const l of b.lignes || []) {
      const nb = Number(l.nb) || 0;
      if (/^Appointements|^Heures travaillées|^Heures complémentaires|^Heures supplémentaires/i.test(l.lib)) h += nb;
      else if (/^Heures non effectuées|^Absence maladie/i.test(l.lib)) h -= nb;
    }
    return Math.max(0, Math.round(h * 100) / 100);
  }

  const trimestreDe = (mois) => { const [y, m] = mois.split("-").map(Number); return { annee: y, t: Math.ceil(m / 3) }; };
  const moisDuTrimestre = (annee, t) => [1, 2, 3].map((i) => `${annee}-${String((t - 1) * 3 + i).padStart(2, "0")}`);
  const bornes = (annee, t) => { const m = moisDuTrimestre(annee, t); const fin = new Date(Date.UTC(annee, t * 3, 0)).toISOString().slice(0, 10); return { debut: m[0] + "-01", fin }; };
  const dateLimite = (annee, t) => new Date(Date.UTC(annee, t * 3 + 1, 0)).toISOString().slice(0, 10);

  /* Déclaration nominative trimestrielle.
     clotures : { "AAAA-MM": [{ s, b }] } (bulletins figés) ; fiches : salariés actuels (pour l'état civil à jour) ;
     reprises : { idSalarie: { brut, heures } } pour les mois payés hors de l'application. */
  function calculDNT(soc, annee, t, clotures, fiches, reprises = {}) {
    const p = params(soc); const { debut, fin } = bornes(annee, t);
    const parId = {};
    const moisPresents = [], moisManquants = [];
    for (const m of moisDuTrimestre(annee, t)) {
      const liste = clotures[m];
      if (!liste) { moisManquants.push(m); continue; }
      moisPresents.push(m);
      for (const { s, b } of liste) {
        const e = parId[s.id] || (parId[s.id] = { id: s.id, brut: 0, heures: 0, mois: [] });
        e.brut += b.brut; e.heures += heuresBulletin(b); e.mois.push(m);
      }
    }
    for (const [id, rp] of Object.entries(reprises)) {
      if (!Number(rp.brut) && !Number(rp.heures)) continue;
      const e = parId[id] || (parId[id] = { id, brut: 0, heures: 0, mois: [] });
      e.brut += Number(rp.brut) || 0; e.heures += Number(rp.heures) || 0; e.reprise = true;
    }
    const lignes = Object.values(parId).map((e) => {
      const s = fiches.find((x) => x.id === e.id) || {};
      const brut = r(e.brut);
      const t1 = Math.min(brut, 3 * p.plafondT1);
      return {
        id: e.id, assure: String(s.cafat || "").replace(/\D/g, ""), nom: up(s.nom), prenoms: up(s.prenom),
        heures: Math.round(e.heures * 100) / 100, brut,
        ruamm1: t1, ruamm2: Math.max(0, brut - 3 * p.plafondT1), retraite: t1,
        autres: Math.min(brut, 3 * p.plafondAutres), fsh: Math.min(brut, 3 * p.plafondFSH), atmp: Math.min(brut, 3 * p.plafondAutres), ccs: brut,
        embauche: s.entree && s.entree >= debut && s.entree <= fin ? s.entree : "",
        rupture: s.sortie && s.sortie >= debut && s.sortie <= fin ? s.sortie : "",
        mois: e.mois, reprise: !!e.reprise, sansCafat: !s.cafat || /cours/i.test(s.cafat || ""),
      };
    }).sort((a, b) => (a.assure || "999999999").localeCompare(b.assure || "999999999", "fr", { numeric: true }));
    const sum = (k) => lignes.reduce((a, l) => a + l[k], 0);
    const postes = [
      { k: "ruamm1", lib: "RUAMM 1 et FIAF", taux: p.tauxRuamm1 },
      { k: "retraite", lib: "Retraite", taux: p.tauxRetraite },
      { k: "autres", lib: "Autres régimes et contrib. diverses", taux: p.tauxAutres },
      { k: "atmp", lib: "ATMP principal", taux: p.tauxATMP },
      { k: "ccs", lib: "CCS", taux: p.tauxCCS },
      { k: "ruamm2", lib: "RUAMM 2", taux: p.tauxRuamm2 },
      { k: "fsh", lib: "FSH", taux: p.tauxFSH },
    ].map((x) => { const assiette = sum(x.k); return { ...x, assiette, montant: x.taux == null ? null : r(assiette * x.taux / 100) }; });
    const alertes = [];
    if (moisManquants.length) alertes.push(`Mois non clôturés dans l'application : ${moisManquants.join(", ")}. Saisissez le brut et les heures de ces mois dans la colonne « Reprise » (salaires payés hors application), ou clôturez-les.`);
    if (postes.find((x) => x.k === "ruamm2").assiette > 0 && p.tauxRuamm2 == null) alertes.push("Un salarié dépasse le plafond RUAMM tranche 1 : renseignez le taux RUAMM tranche 2 dans l'onglet Société.");
    lignes.filter((l) => l.sansCafat).forEach((l) => alertes.push(`${l.prenoms} ${l.nom} : numéro d'assuré CAFAT manquant dans la fiche salarié.`));
    if (!p.tauxATMP) alertes.push("Taux accident du travail (ATMP) à 0 : renseignez-le dans les cotisations de la société.");
    return { annee, t, debut, fin, limite: dateLimite(annee, t), lignes, postes, totalBrut: sum("brut"), total: postes.reduce((a, x) => a + (x.montant || 0), 0), moisPresents, moisManquants, alertes, p };
  }

  /* ---------- Remplissage des formulaires (pdf-lib) ---------- */
  async function chargerPolice(doc) { return { f: await doc.embedFont(PDFLib.StandardFonts.Helvetica), b: await doc.embedFont(PDFLib.StandardFonts.HelveticaBold) }; }
  const pdfSafe = (s) => String(s ?? "").normalize("NFC").replace(/[’‘]/g, "'").replace(/[^\x20-\x7E -ÿ]/g, "");
  function writer(page, F) {
    const H = page.getHeight();
    const ink = PDFLib.rgb(0.05, 0.1, 0.35);
    return {
      // Une lettre par case. xs : abscisses des cases, top : haut des cases, w/h : taille. align : "left" | "right"
      cases(xs, top, w, h, texte, align = "left", size) {
        const t = pdfSafe(texte).replace(/\s/g, align === "right" ? "" : " ").split("");
        const n = xs.length; const sz = size || Math.min(h * 0.72, 10);
        const debut = align === "right" ? Math.max(0, n - t.length) : 0;
        t.slice(align === "right" ? Math.max(0, t.length - n) : 0, align === "right" ? t.length : n).forEach((c, i) => {
          const x = xs[debut + i]; const cw = F.f.widthOfTextAtSize(c, sz);
          page.drawText(c, { x: x + (w - cw) / 2, y: H - top - h / 2 - sz * 0.35, size: sz, font: F.f, color: ink });
        });
      },
      texte(x, top, h, texte, size = 9, gras = false) {
        page.drawText(pdfSafe(texte), { x, y: H - top - h / 2 - size * 0.35, size, font: gras ? F.b : F.f, color: ink });
      },
      croix(x, top, w = 8.5, h = 8.8) {
        const c = 1.2;
        page.drawLine({ start: { x: x + c, y: H - top - c }, end: { x: x + w - c, y: H - top - h + c }, thickness: 1.2, color: ink });
        page.drawLine({ start: { x: x + c, y: H - top - h + c }, end: { x: x + w - c, y: H - top - c }, thickness: 1.2, color: ink });
      },
    };
  }
  const serie = (x0, pas, n) => Array.from({ length: n }, (_, i) => Math.round((x0 + i * pas) * 10) / 10);

  /* Déclaration de rupture du contrat de travail (formulaire CAFAT 09.2024, page 1) */
  const MOTIFS = { essai: [33.3, 607.6], demission: [238.5, 607.6], fin_cdd: [33.3, 626.0], licenciement: [238.5, 626.0], autre: [33.3, 644.4], rc_employeur: [403.0, 624.3], rc_salarie: [403.0, 637.4] };
  async function remplirRupture(modele, d) {
    const doc = await PDFLib.PDFDocument.load(modele); const F = await chargerPolice(doc); const pg = doc.getPage(0); const w = writer(pg, F);
    const ridet = String(d.ridet || "").replace(/\D/g, "");
    w.cases([111.5, 125.3, 139.1, 152.9, 166.7, 180.5, 194.3], 203.9, 13.5, 14.2, ridet.slice(0, 7));
    w.cases([219.1, 232.9, 247.0], 203.9, 13.5, 14.2, ridet.slice(7, 10));
    w.cases([442.5, 456.6, 470.3, 483.6, 497.6], 203.9, 13.5, 14.2, up(d.ape));
    w.texte(212, 229.5, 14.2, up(d.denomination));
    w.texte(144, 251.9, 14.2, d.activite || "");
    if (d.cessation) w.croix(397.0, 185.0);
    w.cases([180.2, 194.0, 207.8, 221.6, 235.1, 249.1], 300.6, 13.5, 14.2, String(d.assure || "").replace(/\D/g, ""), "right");
    w.texte(72, 325.1, 14.2, up(d.nom));
    w.texte(370, 325.1, 14.2, up(d.nomMarital));
    w.texte(178, 348.4, 14.2, up(d.prenoms));
    w.cases([106.5, 119.3, 137.9, 150.8, 168.9, 181.9, 194.8, 207.6], 371.4, 12.8, 14.2, dmy(d.naissance));
    w.texte(369, 370.4, 14.2, up(d.lieuNaissance));
    w.croix(d.etranger ? 179.3 : 108.3, 400.1);
    w.cases([170.4, 183.3, 201.8, 214.7, 232.8, 245.8, 258.7, 271.5], 420.7, 12.8, 14.2, dmy(d.dateRupture));
    w.texte(175, 448.2, 14.2, up(d.metier));
    if (d.diplome) w.cases([176.0], 524.3, 13.5, 14.2, String(d.diplome));
    if (d.natureEmploi) w.cases([346.5], 524.3, 13.5, 14.2, String(d.natureEmploi));
    if (d.classification) w.cases([483.4], 524.3, 13.5, 14.2, String(d.classification));
    w.croix(d.contrat === "CDD" ? 141.5 : d.contrat === "SPEC" ? 283.1 : 412.5, 563.5);
    if (d.motif === "rc_employeur" || d.motif === "rc_salarie") w.croix(383.6, 607.6);
    if (MOTIFS[d.motif]) w.croix(...MOTIFS[d.motif], 8.5, d.motif.startsWith("rc_") ? 8.0 : 8.8);
    w.cases([184.0, 196.9, 219.1, 232.0, 255.9, 268.9, 281.8, 294.6], 733.5, 12.8, 14.2, dmy(d.dateDoc));
    w.texte(335, 742, 12, d.signataire || "", 8);
    doc.removePage(1);
    return doc.save();
  }

  /* Fiche d'immatriculation employeur personne morale (formulaire CAFAT 10.2014) */
  async function remplirImmat(modele, d) {
    const doc = await PDFLib.PDFDocument.load(modele); const F = await chargerPolice(doc); const pg = doc.getPage(0); const w = writer(pg, F);
    const formes = { sarl: [143.6, 205.4], sa: [245.3, 205.4], asso: [330.4, 205.4], snc: [424.5, 205.4], sci: [143.6, 225.8], autre: [245.3, 225.8] };
    const f = /S\.?A\.?R\.?L|EURL|SELARL/i.test(d.forme || "") ? "sarl" : /^S\.?A\.?S/i.test(d.forme || "") ? "autre" : /^S\.?A\.?$/i.test(d.forme || "") ? "sa" : /SCI|civile/i.test(d.forme || "") ? "sci" : "autre";
    w.croix(...formes[f], 8.3, 8.3);
    if (f === "autre") w.texte(340, 230.1, 12, d.forme || "", 8);
    w.texte(148, 254.4, 14, up(d.denomination));
    w.texte(148, 273.4, 14, up(d.sigle));
    w.texte(148, 293.3, 14, d.activite || "");
    w.texte(148, 313.1, 14, (d.siege || "").replace(/\n/g, ", "), 8);
    w.texte(148, 333.0, 14, (d.correspondance || d.siege || "").replace(/\n/g, ", "), 8);
    w.texte(88, 352.8, 14, d.bp || "");
    w.texte(219, 353.6, 14, d.cp || "");
    w.texte(363, 352.8, 14, up(d.commune));
    w.texte(88, 376, 14, d.tel || "");
    w.texte(290, 376, 14, d.mobile || "");
    w.texte(88, 401.6, 14, d.email || "");
    const ridet = String(d.ridet || "").replace(/\D/g, "");
    w.cases([85.8, 103.6, 122.0, 140.7, 160.6, 180.3, 199.7], 454.9, 13.9, 14, ridet.slice(0, 7));
    w.cases([224.5, 244.4, 263.1], 454.9, 13.9, 14, ridet.slice(7, 10));
    w.cases([391.9, 411.7, 430.8, 449.5, 469.5, 487.7, 507.5, 526.2, 545.2], 454.9, 13.9, 14, String(d.rc || "").replace(/\s/g, ""));
    w.cases([83.7, 103.4, 122.5, 141.3, 161.2], 490.8, 13.9, 14, up(d.ape));
    w.texte(93, 527.6, 14, (d.localisation || d.siege || "").replace(/\n/g, ", "), 8);
    w.texte(92, 550.5, 14, d.bp || "");
    w.texte(221, 550.5, 14, d.cp || "");
    w.texte(366, 550.5, 14, up(d.commune));
    w.texte(92, 574, 14, d.tel || "");
    w.texte(290, 574, 14, d.mobile || "");
    w.texte(93, 600.4, 14, d.email || "");
    if (d.dateDoc) { const [a, m, j] = d.dateDoc.split("-"); w.texte(196, 655, 10, j, 9); w.texte(234, 655, 10, m, 9); w.texte(276, 655, 10, a, 9); }
    w.texte(420, 655, 14, d.signataire || "", 8);
    return doc.save();
  }

  /* Déclaration nominative trimestrielle (formulaire « 4 pages » : page 2 = 5 salariés, page 3 = décompte) */
  const DNT = {
    assure: serie(13.5, 12.9, 6), atmpEnt: [257.3], atmpDec: [270.2, 283.1], commune: [300.5, 313.4],
    remun: serie(368.6, 12.9, 8), t1: serie(476.3, 12.9, 7), t2: serie(586.5, 12.9, 8), date: serie(694.5, 12.9, 6),
    nom: serie(13.5, 10.06, 24), et: [257.3, 270.2, 283.1], heuresEnt: [300.5, 313.4, 326.3], heuresDec: [339.2, 352.1], fsh: serie(599.8, 12.9, 7),
  };
  function entete(w, d) {
    const [cpt, et] = String(d.compte || "").split("/");
    w.cases(serie(96.4, 13.1, 6), 80.8, 11.3, 11.3, (cpt || "").replace(/\D/g, ""), "right");
    w.cases([182.6, 195.7, 208.8], 80.8, 11.3, 11.3, (et || "").replace(/\D/g, ""), "right");
    w.cases([285.4], 80.8, 11.3, 11.3, String(d.t));
    w.cases([306.0, 319.1, 332.2, 345.3], 80.8, 11.3, 11.3, String(d.annee));
    w.cases(serie(46.2, 13.1, 7), 102.0, 11.3, 11.3, String(d.ridet || "").replace(/\D/g, "").slice(0, 7));
    w.cases([197.7, 210.8, 223.9], 102.0, 11.3, 11.3, d.codeCotisation || "");
    w.cases([274.1, 287.2], 102.0, 11.3, 11.3, d.secteur || "");
    w.texte(520, 78, 12, up(d.denomination), 9, true);
    w.texte(484, 39.5, 8, d.limite.split("-").reverse().join("/"), 8, true);
    if (d.complementaire) w.croix(246.8, 30.3, 9.7, 9.7);
  }
  async function remplirDNT(modele, d) {
    const src = await PDFLib.PDFDocument.load(modele);
    const doc = await PDFLib.PDFDocument.create();
    const F = await chargerPolice(doc);
    const parPage = 5; const nPages = Math.max(1, Math.ceil(d.lignes.length / parPage));
    for (let k = 0; k < nPages; k++) {
      const [pg] = await doc.copyPages(src, [1]); doc.addPage(pg); const w = writer(pg, F);
      entete(w, d);
      d.lignes.slice(k * parPage, k * parPage + parPage).forEach((l, i) => {
        const T = 199.3 + i * 71.65;
        w.cases(DNT.assure, T, 11.3, 11.3, l.assure, "right");
        const at = (d.p.tauxATMP || 0).toFixed(2).split(".");
        w.cases(DNT.atmpEnt, T, 11.3, 11.3, at[0].slice(-1)); w.cases(DNT.atmpDec, T, 11.3, 11.3, at[1]);
        w.cases(DNT.commune, T, 11.3, 11.3, d.communeCode || "", "right");
        w.cases(DNT.remun, T, 11.3, 11.3, String(l.brut), "right");
        w.cases(DNT.t2, T, 11.3, 11.3, l.ruamm2 ? String(l.ruamm2) : "", "right");
        w.cases(DNT.date, T, 11.3, 11.3, dmyy(l.embauche));
        w.cases(DNT.nom, T + 22.7, 8.5, 11.3, l.nom, "left", 7.5);
        w.cases(DNT.et, T + 25.5, 11.3, 11.3, d.et || "", "right");
        const h = l.heures.toFixed(2).split(".");
        w.cases(DNT.heuresEnt, T + 25.5, 11.3, 11.3, h[0], "right"); w.cases(DNT.heuresDec, T + 25.5, 11.3, 11.3, h[1]);
        w.cases(DNT.date, T + 25.5, 11.3, 11.3, dmyy(l.rupture));
        w.cases(DNT.nom, T + 45.4, 8.5, 11.3, l.prenoms, "left", 7.5);
        if (d.proratisation) {
          w.cases(DNT.t1, T, 11.3, 11.3, String(l.ruamm1), "right");
          w.cases(DNT.t1, T + 22.7, 11.3, 11.3, String(l.retraite), "right");
          w.cases(DNT.t1, T + 45.4, 11.3, 11.3, String(l.autres), "right");
          w.cases(DNT.fsh, T + 45.4, 11.3, 11.3, String(l.fsh), "right");
        }
      });
      w.texte(560, 560, 10, `Page ${k + 1} / ${nPages}`, 8);
    }
    const [p3] = await doc.copyPages(src, [2]); doc.addPage(p3); const w = writer(p3, F);
    entete(w, d);
    w.cases(serie(135.0, 13.1, 10), 136.1, 11.3, 11.3, String(d.totalBrut), "right");
    const col = { ruamm1: [77.5, 74.7, 90.3, 203.5], retraite: [231.2, 228.4, 243.9, 203.5], autres: [384.9, 382.0, 397.6, 203.5], atmp: [538.5, 535.7, 551.2, 203.5], ccs: [692.2, 689.3, 704.9, 203.5], ruamm2: [77.5, 74.7, 90.3, 275.4], fsh: [692.2, 689.3, 704.9, 275.4] };
    for (const x of d.postes) {
      const [xa, xt, xm, top] = col[x.k]; if (!x.assiette && x.k === "ruamm2") continue;
      w.cases(serie(xa, 13.1, 10), top, 11.3, 11.3, String(x.assiette), "right");
      if (x.taux != null) w.texte(xt + 52, top + 19, 11, String(x.taux).replace(".", ","), 9);
      if (x.montant != null) w.cases(serie(xm, 13.1, 9), top + 40.5, 11.3, 11.3, String(x.montant), "right");
    }
    w.cases(serie(91.8, 13.1, 10), 355.4, 11.3, 11.3, String(d.total), "right");
    w.cases(serie(694.6, 13.1, 10), 402.6, 11.3, 11.3, String(d.total), "right");
    if (!d.lignes.length) w.croix(262.4, 366.8, 9.8, 9.8);
    const dd = dmy(d.dateDoc);
    w.cases([620.8, 633.6], 494.5, 11.3, 11.3, dd.slice(0, 2)); w.cases([650.0, 662.9], 494.5, 11.3, 11.3, dd.slice(2, 4)); w.cases([679.3, 692.2, 705.1, 718.0], 494.5, 11.3, 11.3, dd.slice(4));
    return doc.save();
  }

  /* Codes de la déclaration de rupture */
  const codeClassification = (s) => {
    const q = String(s.qualif || "") + " " + String(s.emploi || "");
    if (/cadre|ing[ée]nieur|\bVII\b/i.test(q)) return 7;
    if (/ma[iî]trise|\bVI\b|manager/i.test(q)) return 6;
    if (/technicien/i.test(q)) return 5;
    return 4;
  };

  return { calculDNT, heuresBulletin, remplirRupture, remplirImmat, remplirDNT, trimestreDe, moisDuTrimestre, bornes, dateLimite, codeClassification, params, DEFAUT };
})();
if (typeof module !== "undefined") module.exports = CAFAT;
