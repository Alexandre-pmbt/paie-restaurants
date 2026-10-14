/* ===== Moteur de paie (fonctions pures) ===== */
const PAIE = (() => {
  const r = (x) => (x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5));
  const normNom = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const dow = (s) => new Date(s + "T00:00:00Z").getUTCDay(); // 0 = dimanche

  // Valeur Excel (fraction de jour, éventuellement > 1 pour minuit passé) -> heures
  function toHours(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v * 24;
    if (v instanceof Date) return v.getUTCHours() + v.getUTCMinutes() / 60;
    return null;
  }
  function excelDate(v) {
    if (typeof v === "number" && v > 30000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return iso(d); }
    if (v instanceof Date) return iso(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())));
    return null;
  }
  // Couleurs de remplissage du planning
  const COUL = { FF9900: "cp", FF00FF: "mal", FF0000: "ne" };
  function fillOf(cell) {
    const c = cell && cell.s && cell.s.fgColor && cell.s.fgColor.rgb;
    if (!c) return null;
    return COUL[String(c).toUpperCase().slice(-6)] || null;
  }

  /* Lit le planning (feuille SheetJS lue avec cellStyles:true).
     Structure : ligne d'en-tête (col. A = OK/HI..., col. B = lundi), puis ligne nom + ligne suivante,
     7 jours x (début, fin, durée) à partir de la colonne B. */
  function parsePlanning(ws, XLSX) {
    const ref = XLSX.utils.decode_range(ws["!ref"]);
    const get = (r0, c0) => ws[XLSX.utils.encode_cell({ r: r0, c: c0 })];
    const blocs = {}; const alertes = []; let lundi = null; const freq = {};
    for (let R = ref.s.r; R <= ref.e.r; R++) {
      const a = get(R, 0); const av = a ? String(a.v || "").trim() : "";
      const b = get(R, 1);
      const d = b ? excelDate(b.v) : null;
      if (d && (!av || /^(OK|HI)\b/i.test(av) || av.length <= 6)) { lundi = d; continue; }
      if (!av || /^(OK|HI)\b/i.test(av) || !lundi) continue;
      const nom = normNom(av);
      (blocs[nom] = blocs[nom] || { libelle: av, b: [] }).b.push({ R, lundi });
      freq[lundi] = (freq[lundi] || 0) + 1;
      R++; // la ligne suivante appartient au même salarié
    }
    // Semaines du planning : les dates d'en-tête les plus fréquentes
    const semainesRef = Object.keys(freq).sort();
    const out = {};
    for (const nom in blocs) {
      const { libelle, b } = blocs[nom];
      const dates = b.map((x) => x.lundi);
      const doublon = new Set(dates).size < dates.length || dates.some((x, i) => i && x <= dates[i - 1]);
      if (doublon) {
        const ok = semainesRef.length >= b.length ? semainesRef.slice(-b.length) : null;
        if (ok && (ok.length === b.length)) {
          alertes.push(`${libelle} : dates de semaines incohérentes dans le planning (${dates.join(", ")}), réalignées sur ${ok.join(", ")}.`);
          b.forEach((x, i) => (x.lundi = ok[i]));
        } else alertes.push(`${libelle} : dates de semaines incohérentes dans le planning, à vérifier.`);
      }
      const jours = {};
      for (const { R, lundi: debut } of b) {
        for (let j = 0; j < 7; j++) {
          const date = addDays(debut, j);
          const jour = jours[date] || (jours[date] = { d: date, h: 0, ne: 0, mal: 0, cp: false });
          for (const rr of [R, R + 1]) {
            const c0 = 1 + j * 3;
            const s = toHours((get(rr, c0) || {}).v), e = toHours((get(rr, c0 + 1) || {}).v);
            const fl = [get(rr, c0), get(rr, c0 + 1), get(rr, c0 + 2)].map(fillOf).filter(Boolean);
            let dur = 0;
            if (s !== null && e !== null) { let ee = e; if (ee < s) ee += 24; dur = Math.round((ee - s) * 4) / 4; }
            if (fl.includes("cp")) jour.cp = true;
            if (fl.includes("mal")) jour.malJour = true;
            if (fl.includes("ne")) jour.ne += dur;
            else if (fl.includes("mal")) jour.mal += dur;
            else jour.h += dur;
            const fc = get(rr, c0 + 2);
            if (dur > 0 && !(fc && fc.f)) alertes.push(`${libelle} le ${date.split("-").reverse().join("/")} : durée absente du planning (${hh(dur)}), recalculée.`);
          }
        }
      }
      out[nom] = { libelle, semaines: b.map((x) => x.lundi), jours: Object.values(jours).sort((x, y) => x.d.localeCompare(y.d)) };
    }
    return { salaries: out, alertes, semaines: semainesRef };
  }

  // Fusionne les blocs d'un même salarié écrit de plusieurs façons dans le planning
  function planPour(planning, noms) {
    const keys = [...new Set((noms || []).map(normNom))].filter((k) => planning && planning[k]);
    if (!keys.length) return null;
    const jours = {};
    for (const k of keys) for (const j of planning[k].jours) {
      const x = jours[j.d] || (jours[j.d] = { d: j.d, h: 0, ne: 0, mal: 0, cp: false });
      x.h += j.h; x.ne += j.ne; x.mal += j.mal; x.cp = x.cp || j.cp; x.malJour = x.malJour || j.malJour;
    }
    return { jours: Object.values(jours).sort((x, y) => x.d.localeCompare(y.d)), cles: keys };
  }

  const fmt = (x) => r(x).toLocaleString("fr-FR").replace(/ | /g, " ");
  const n2 = (x) => x.toFixed(2).replace(".", ",");
  const hh0 = 0; const hh = (h) => { const m = Math.round(h * 60); return Math.floor(m / 60) + "h" + (m % 60 ? String(m % 60).padStart(2, "0") : ""); };
  const ansRevolus = (entree, fin) => { const a = new Date(entree + "T00:00:00Z"), b = new Date(fin + "T00:00:00Z"); let y = b.getUTCFullYear() - a.getUTCFullYear(); if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) y--; return y; };

  /* Calcule un bulletin.
     soc : paramètres société ; s : fiche salarié ; plan : planning du salarié (ou null) ;
     v : variables du mois { repas, acompte, primeExc, oa:{lib,montant}, autres:[{lib,montant}], assiduite: true/false/null, valeurJourCP } ;
     mois : "2026-09" */
  function calcul(soc, s, plan, v, mois) {
    v = v || {};
    const [Y, M] = mois.split("-").map(Number);
    const debM = `${mois}-01`, finM = iso(new Date(Date.UTC(Y, M, 0)));
    const lignes = []; const notes = []; let brut = 0, baseAnc = 0;
    const add = (lib, base, nb, taux, mt, opts = {}) => { lignes.push({ lib, base, nb, taux, mt }); if (!opts.horsBrut) brut += mt; if (opts.anc) baseAnc += mt; };
    const base = Number(s.base) || 0, hm = Number(s.heuresMois) || 169;
    const th = Math.max(base / hm, soc.smg);
    const baseM = Math.max(base, r(hm * soc.smg));
    if (base && base < r(hm * soc.smg) - 1) notes.push(`Salaire du contrat (${fmt(base)} F) inférieur au SMG : porté à ${fmt(baseM)} F.`);
    const entree = s.entree || "1900-01-01", sortie = s.sortie || "2999-12-31";
    const reel = entree > debM || (sortie >= debM && sortie < finM);
    const jours = (plan && plan.jours ? plan.jours : []).filter((j) => j.d >= entree && j.d <= sortie);
    const feries = new Set(soc.feries || []);
    // Semaines
    const sem = {};
    for (const j of jours) { const l = addDays(j.d, -((dow(j.d) + 6) % 7)); (sem[l] = sem[l] || []).push(j); }
    let hc = 0, hs25 = 0, hs50 = 0, ne = 0, mal = 0, fer = 0, cpJ = 0, trav = 0;
    const hebdo = Number(s.hebdo) || 39;
    for (const l of Object.keys(sem).sort()) {
      const w = sem[l].reduce((a, j) => a + j.h, 0); trav += w;
      if (!reel) {
        if (hebdo < 39) hc += Math.max(Math.min(w, 39) - hebdo, 0);
        hs25 += Math.min(Math.max(w - 39, 0), 8); hs50 += Math.max(w - 47, 0);
      }
    }
    for (const j of jours) {
      if (j.d < debM && reel) continue;
      ne += j.ne; mal += j.mal; if (feries.has(j.d)) fer += j.h;
      if (j.cp && dow(j.d) !== 0) cpJ++;
    }
    if (reel) {
      const h = jours.filter((j) => j.d >= debM && j.d <= finM).reduce((a, j) => a + j.h, 0);
      add("Heures travaillées (payées au réel)", th, h, null, r(h * th), { anc: true });
      notes.push(`Entrée ou sortie dans le mois : ${hh(h)} payées au réel.`);
    } else {
      add("Appointements mensuels", th, hm, null, baseM, { anc: true });
      if (ne) add("Heures non effectuées", th, ne, null, -r(ne * th), { anc: true });
      if (mal) add("Absence maladie", th, mal, null, -r(mal * th), { anc: true });
      if (hc) add("Heures complémentaires", th, hc, null, r(hc * th), { anc: true });
      if (hs25) add("Heures supplémentaires à 25%", th, hs25, "125,0000", r(hs25 * th * 1.25), { anc: true });
      if (hs50) add("Heures supplémentaires à 50 %", th, hs50, "150,0000", r(hs50 * th * 1.5), { anc: true });
    }
    if (fer) add(`Heures majorées jour férié/chômé (${[...feries].filter((d) => d.startsWith(mois)).map((d) => d.slice(8) + "/" + d.slice(5, 7)).join(", ")})`, th, fer, "50,0000", r(fer * th * 0.5), { anc: true });
    let cpN1 = 0;
    if (cpJ && !reel) {
      const vj = baseM / 26; const vi = Math.max(vj, Number(v.valeurJourCP) || 0);
      cpN1 = Math.min(cpJ, Number(s.cpN1) || 0);
      add(`Congés payés pris (${cpJ} j ouvrables)`, vi, cpJ, null, r(vi * cpJ));
      add("Retenue pour congés payés", vj, cpJ, null, -r(vj * cpJ));
      if (!v.valeurJourCP) notes.push("Congés valorisés au maintien de salaire : saisir la valeur jour au dixième si elle est plus favorable.");
    }
    const repas = Number(v.repas) || 0;
    if (repas) add("Avantage en nature titre repas", repas, 1, null, repas);
    const anc = Number(s.anc) || 0;
    if (anc) add("Prime d'ancienneté", baseAnc, null, n2(anc) + "00", r(baseAnc * anc / 100));
    const ans = ansRevolus(entree === "1900-01-01" ? debM : (s.ancienneteDepuis || entree), finM);
    if (ans >= 2 && !anc) notes.push(`${ans} ans d'ancienneté : prime d'ancienneté à mettre sur la fiche salarié.`);
    const assidAuto = !reel && !ne && !mal && !jours.some((j) => j.malJour);
    const assid = v.assiduite === true || v.assiduite === false ? v.assiduite : assidAuto;
    if (assid && soc.assiduite) add("Prime d'assiduité", soc.assiduite, 1, null, soc.assiduite);
    const pex = Number(v.primeExc) || 0;
    if (pex) add("Prime exceptionnelle", pex, 1, null, pex);
    let finCdd = 0;
    if (s.contrat === "CDD" && s.sortie && s.sortie >= debM && s.sortie <= finM) {
      const tot = (Number(s.brutAnterieur) || 0) + brut;
      const prec = r(tot * 0.05); add("Indemnité de fin de contrat (5 %)", tot, null, "5,0000", prec);
      const iccp = r((tot + prec) * 0.10); add("Indemnité compensatrice de congés payés (10 %)", tot + prec, null, "10,0000", iccp);
      finCdd = 1; notes.push("Fin de CDD : indemnités calculées sur le brut de tout le contrat (brut antérieur de la fiche + ce mois).");
    }
    // Cotisations
    const cot = []; let ts = 0, tp = 0;
    for (const c of soc.cotisations) {
      const b = c.plafond ? Math.min(brut, c.plafond) : brut;
      const ms = r(b * c.sal / 100), mp = r(b * c.pat / 100); ts += ms; tp += mp;
      cot.push({ lib: c.lib, base: b, ts: c.sal, ms, tp: c.pat, mp });
    }
    const mut = Number(s.mutuelle) || 0;
    if (mut >= 2) { cot.push({ lib: "Mutuelle du Commerce AYD", base: soc.mutAyd, ms: soc.mutAyd, mp: 0, forfait: true }); ts += soc.mutAyd; }
    if (mut >= 1) { cot.push({ lib: "Mutuelle du Commerce", base: soc.mutSal, ms: soc.mutSal, mp: soc.mutPat, forfait: true }); ts += soc.mutSal; tp += soc.mutPat; }
    const ccs = r(brut * soc.ccs / 100); ts += ccs; cot.push({ lib: "CCS", base: brut, ts: soc.ccs, ms: ccs, mp: 0 });
    const net = brut - ts;
    const apres = [];
    if (repas) apres.push({ lib: "Reprise avantage en nature titre repas", mt: -repas });
    if (v.oa && Number(v.oa.montant)) apres.push({ lib: v.oa.lib || "Opposition administrative", mt: -Number(v.oa.montant) });
    for (const a of v.autres || []) if (Number(a.montant)) apres.push({ lib: a.lib || "Retenue", mt: -Number(a.montant) });
    if (Number(v.acompte)) apres.push({ lib: "Acompte sur salaire", mt: -Number(v.acompte) });
    const part = s.repasOfferts ? 0 : r(repas * soc.repasPct / 100);
    if (part) apres.push({ lib: `Repas - Part salarié ${soc.repasPct}%`, mt: -part });
    const nap = net + apres.reduce((a, x) => a + x.mt, 0);
    // Congés
    const acq = finCdd ? 0 : (reel ? Math.round(2.5 * Math.min(1, trav / Math.max(hebdo * 4.33, 1)) * 2) / 2 : 2.5);
    const cp = { acquis: acq, pris: cpJ && !reel ? cpJ : 0, solde: finCdd ? 0 : (Number(s.cpSolde) || 0) + acq - (cpJ && !reel ? cpJ : 0), n1: Math.max((Number(s.cpN1) || 0) - cpN1, 0) };
    return { lignes, brut, cot, ts, tp, net, apres, nap, cout: brut + tp, notes, cp, th, baseM, reel, assid, assidAuto, trav, repas, part };
  }

  return { parsePlanning, planPour, calcul, normNom, fmt, n2, hh, r, ansRevolus };
})();

