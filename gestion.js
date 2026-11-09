/* ===== Gestion : chiffre d'affaires journalier, factures de charges et rentabilité par restaurant ===== */
const CATEGORIES = [
  ["marchandises", "Achats marchandises (matières premières)", "variable"],
  ["emballages", "Emballages et consommables", "variable"],
  ["redevance", "Redevances franchise et marketing", "fixe"],
  ["loyer", "Loyer et charges locatives", "fixe"],
  ["energie", "Électricité, eau, gaz", "fixe"],
  ["telecom", "Téléphone, internet, logiciels, caisse", "fixe"],
  ["entretien", "Entretien, réparations, nettoyage", "fixe"],
  ["assurance", "Assurances", "fixe"],
  ["honoraires", "Honoraires (comptable, juridique…)", "fixe"],
  ["banque", "Frais bancaires et monétique", "fixe"],
  ["interets", "Intérêts d'emprunt", "fixe"],
  ["impots", "Impôts et taxes (patente…)", "fixe"],
  ["exterieur", "Personnel extérieur, prestataires", "fixe"],
  ["autres", "Autres charges", "fixe"],
];
const catLib = (k) => (CATEGORIES.find((c) => c[0] === k) || [, k])[1];
const catVariable = (k) => (CATEGORIES.find((c) => c[0] === k) || [])[2] === "variable";
const jourLocal = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const joursDuMois = (m) => { const [y, mm] = m.split("-").map(Number); const n = new Date(Date.UTC(y, mm, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`); };
const nbJours = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000) + 1;
const finMoisDe = (m) => joursDuMois(m).slice(-1)[0];
const num = (v) => { const x = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return isFinite(x) ? x : 0; };

S.gest = { caisse: {}, charges: {}, charge: {} };
function chargerGestion(soc, mois, force) {
  const k = `${soc}_${mois}`;
  if (!force && S.gest.charge[k]) return S.gest.charge[k];
  const p = Promise.all([
    S.db.doc(`caisse/${k}`).get(),
    S.db.collection("charges").where("societe", "==", soc).get(),
  ]).then(([c, q]) => {
    S.gest.caisse[k] = c.exists ? c.data() : { societe: soc, mois, jours: {} };
    S.gest.charges[soc] = q.docs.map((d) => ({ id: d.id, ...d.data() }));
  }).catch((e) => { S.gest.erreur = e.message || String(e); });
  S.gest.charge[k] = p; return p;
}
function chargesDuMois(soc, mois) {
  const deb = `${mois}-01`, fin = finMoisDe(mois);
  return (S.gest.charges[soc] || []).filter((c) => {
    if (catVariable(c.categorie)) return (c.date || "").slice(0, 7) === mois;
    return (c.periodeDebut || deb) <= fin && (c.periodeFin || fin) >= deb;
  });
}

/* ---------- Onglet « Caisse & factures » (gérant et responsables) ---------- */
function renderCaisse(v) {
  const soc = socDoc(); if (!soc) { v.innerHTML = `<div class="panel empty">Choisissez un restaurant.</div>`; return; }
  const k = cle();
  if (!S.gest.caisse[k]) { v.innerHTML = `<div class="panel"><p class="muted">Chargement…</p></div>`; chargerGestion(S.soc, S.mois).then(() => S.tab === "caisse" && render()); return; }
  const cx = S.gest.caisse[k], auj = jourLocal();
  const jours = joursDuMois(S.mois).filter((d) => d <= auj);
  const tot = jours.reduce((a, d) => { const j = cx.jours[d] || {}; a.ttc += num(j.ttc); a.ht += num(j.ht); a.t += num(j.tickets); return a; }, { ttc: 0, ht: 0, t: 0 });
  const tgc = num(soc.tauxTGC) || 0;
  const ch = chargesDuMois(S.soc, S.mois).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const jsem = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  v.innerHTML = `<div class="split">
  <div class="panel"><div class="row"><h2 class="grow">Chiffre d'affaires · ${esc(soc.enseigne || soc.nom)} · ${esc(moisLib(S.mois).toLowerCase())}</h2></div>
    <p class="small muted" style="margin:0">Reportez chaque jour le ticket Z de la caisse (${esc(soc.caisse || "Biborne, Izipass, Freebird…")}). Le montant HT suffit ; s'il manque, il est déduit du TTC${tgc ? ` avec la TGC à ${tgc} %` : " (taux de TGC à renseigner dans l'onglet Rentabilité)"}.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Jour</th><th class="num">CA TTC</th><th class="num">CA HT</th><th class="num">Tickets</th></tr></thead><tbody>
    ${jours.slice().reverse().map((d) => { const j = cx.jours[d] || {}; const w = jsem[new Date(d + "T12:00:00Z").getUTCDay()];
      return `<tr><td>${w} ${esc(frDate(d))}</td>
        <td class="num"><input class="cx" data-d="${d}" data-f="ttc" inputmode="numeric" value="${esc(j.ttc ?? "")}" style="width:8em" aria-label="CA TTC du ${frDate(d)}"></td>
        <td class="num"><input class="cx" data-d="${d}" data-f="ht" inputmode="numeric" value="${esc(j.ht ?? "")}" style="width:8em" aria-label="CA HT du ${frDate(d)}"></td>
        <td class="num"><input class="cx" data-d="${d}" data-f="tickets" inputmode="numeric" value="${esc(j.tickets ?? "")}" style="width:5em" aria-label="Tickets du ${frDate(d)}"></td></tr>`; }).join("")}
    <tr><td><b>Total du mois</b></td><td class="num"><b>${F(tot.ttc)}</b></td><td class="num"><b>${F(tot.ht)}</b></td><td class="num"><b>${F(tot.t)}</b></td></tr>
    </tbody></table></div>
    <p class="small muted" style="margin:0">Enregistrement automatique à chaque saisie.</p>
  </div>
  <div class="panel"><h2>Déposer une facture</h2>
    <div class="form" id="facForm">
      <label style="grid-column:1/-1">Fichier (PDF ou photo)<input type="file" id="fac_fic" accept="image/*,application/pdf"></label>
      <label>Fournisseur<input id="fac_four" list="fac_fours"><datalist id="fac_fours">${[...new Set((S.gest.charges[S.soc] || []).map((c) => c.fournisseur).filter(Boolean))].map((f) => `<option value="${esc(f)}">`).join("")}</datalist></label>
      <label>Catégorie<select id="fac_cat">${CATEGORIES.map(([kk, l]) => `<option value="${kk}">${esc(l)}</option>`).join("")}</select></label>
      <label>Date de la facture<input id="fac_date" type="date" value="${auj.slice(0, 7) === S.mois ? auj : S.mois + "-01"}"></label>
      <label>Montant HT (F)<input id="fac_ht" inputmode="numeric"></label>
      <label>Montant TTC (F)<input id="fac_ttc" inputmode="numeric"></label>
      <label>Période couverte : du<input id="fac_deb" type="date" value="${S.mois}-01"></label>
      <label>au<input id="fac_fin" type="date" value="${finMoisDe(S.mois)}"></label>
      <label style="grid-column:1/-1">Note<input id="fac_note" placeholder="facultatif"></label>
    </div>
    <p class="small muted" style="margin:0">Achats de marchandises et emballages : comptés au mois de la facture. Autres charges (loyer, électricité…) : réparties jour par jour sur la période couverte.</p>
    <div class="row"><button class="primary" id="fac_ok">Enregistrer la facture</button></div>
    <h3>Factures prises en compte en ${esc(moisLib(S.mois).toLowerCase())} (${ch.length})</h3>
    <div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Fournisseur</th><th>Catégorie</th><th class="num">HT</th><th></th></tr></thead><tbody>
    ${ch.map((c) => `<tr><td>${esc(frDate(c.date))}</td><td>${esc(c.fournisseur || "")}${c.note ? `<div class="small muted">${esc(c.note)}</div>` : ""}</td><td class="small">${esc(catLib(c.categorie))}${!catVariable(c.categorie) && c.periodeDebut ? `<div class="muted">${esc(frDate(c.periodeDebut))} → ${esc(frDate(c.periodeFin))}</div>` : ""}</td><td class="num">${F(num(c.ht))}</td>
      <td class="row" style="gap:6px;flex-wrap:nowrap">${c.fichier ? `<button class="link" data-facv="${esc(c.fichier)}">Voir</button>` : ""}${S.admin ? `<button class="link" data-facx="${esc(c.id)}">Supprimer</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Aucune facture pour ce mois.</td></tr>`}
    </tbody></table></div>
  </div></div>`;
  lierCaisse(v, k, cx, tgc);
}
function lierCaisse(v, k, cx, tgc) {
  let tmr;
  v.querySelectorAll(".cx").forEach((i) => (i.onchange = () => {
    const d = i.dataset.d, j = cx.jours[d] || (cx.jours[d] = {});
    j[i.dataset.f] = i.value === "" ? null : num(i.value);
    if (i.dataset.f === "ttc" && j.ttc && !j.ht && tgc) { j.ht = Math.round(j.ttc / (1 + tgc / 100)); const h = v.querySelector(`.cx[data-d="${d}"][data-f="ht"]`); if (h) h.value = j.ht; }
    j.par = S.profil.nom || ""; j.le = new Date().toISOString();
    clearTimeout(tmr); tmr = setTimeout(async () => {
      try { await S.db.doc(`caisse/${k}`).set({ societe: S.soc, mois: S.mois, jours: cx.jours }); toast("Chiffre d'affaires enregistré."); }
      catch (e) { toast("Enregistrement refusé : " + (e.message || e.code)); }
    }, 400);
  }));
  const ttc = $("#fac_ttc"), ht = $("#fac_ht");
  ttc.oninput = () => { if (!ht.dataset.touche && tgc && ttc.value) ht.value = Math.round(num(ttc.value) / (1 + tgc / 100)); };
  ht.oninput = () => (ht.dataset.touche = "1");
  $("#fac_cat").onchange = (e) => { const variable = catVariable(e.target.value); $("#fac_deb").disabled = $("#fac_fin").disabled = variable; };
  $("#fac_cat").onchange({ target: $("#fac_cat") });
  $("#fac_ok").onclick = async (e) => {
    const b = e.target, f = $("#fac_fic").files[0];
    const c = { societe: S.soc, fournisseur: $("#fac_four").value.trim(), categorie: $("#fac_cat").value, date: $("#fac_date").value,
      ht: num(ht.value), ttc: num(ttc.value) || null, note: $("#fac_note").value.trim(), par: S.profil.nom || "", le: new Date().toISOString() };
    if (!catVariable(c.categorie)) { c.periodeDebut = $("#fac_deb").value || `${S.mois}-01`; c.periodeFin = $("#fac_fin").value || finMoisDe(S.mois); if (c.periodeFin < c.periodeDebut) { toast("La fin de période précède le début."); return; } }
    if (!c.date || !c.ht) { toast("Indiquez au moins la date et le montant HT."); return; }
    b.disabled = true; b.textContent = "Enregistrement…";
    try {
      if (f) {
        const propre = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);
        const chemin = `${S.soc}/${c.date.slice(0, 7)}/${Date.now()}-${propre}`;
        const { error } = await S.sb.storage.from("factures").upload(chemin, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw error; c.fichier = chemin;
      }
      const r = await S.db.collection("charges").add(c);
      (S.gest.charges[S.soc] = S.gest.charges[S.soc] || []).push({ id: r.id, ...c });
      toast("Facture enregistrée."); render();
    } catch (e2) { toast("Enregistrement impossible : " + (e2.message || e2)); b.disabled = false; b.textContent = "Enregistrer la facture"; }
  };
  v.querySelectorAll("[data-facv]").forEach((b) => (b.onclick = async () => {
    const w = window.open("", "_blank");
    const { data, error } = await S.sb.storage.from("factures").createSignedUrl(b.dataset.facv, 120);
    if (error) { if (w) w.close(); toast("Ouverture impossible : " + error.message); return; }
    if (w) w.location = data.signedUrl; else location.assign(data.signedUrl);
  }));
  v.querySelectorAll("[data-facx]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Confirmer ?"; return; }
    const c = (S.gest.charges[S.soc] || []).find((x) => x.id === b.dataset.facx); if (!c) return;
    try {
      await S.db.doc(`charges/${c.id}`).delete();
      if (c.fichier) await S.sb.storage.from("factures").remove([c.fichier]);
      S.gest.charges[S.soc] = S.gest.charges[S.soc].filter((x) => x.id !== c.id); toast("Facture supprimée."); render();
    } catch (e) { toast("Suppression impossible : " + (e.message || e.code)); }
  }));
}

/* ---------- Onglet « Rentabilité » (gérant) ---------- */
function masseSalariale(soc) {
  // Coût employeur du mois : clôture si elle existe, sinon calcul en cours ; montant manuel pour un restaurant hors paie
  if (soc.horsPaie || num(soc.masseManuelle)) return { total: num(soc.masseManuelle), source: "montant mensuel saisi dans les paramètres" };
  if (S.cloture && S.cloture.bulletins) return { total: S.cloture.bulletins.reduce((a, x) => a + (x.b.cout || 0), 0), source: "paie clôturée du mois" };
  const act = actifsDuMois(); if (!act.length) return { total: 0, source: "aucun salarié ce mois-ci" };
  return { total: act.reduce((a, s) => a + (calculer(s).cout || 0), 0), source: "paie du mois en cours (non clôturée)" };
}
function calculRentab(soc) {
  const k = cle(), cx = S.gest.caisse[k] || { jours: {} }, auj = jourLocal();
  const tous = joursDuMois(S.mois), n = tous.length, jours = tous.filter((d) => d <= auj);
  const ca = (d) => { const j = cx.jours[d] || {}; return num(j.ht) || (num(j.ttc) && num(soc.tauxTGC) ? num(j.ttc) / (1 + num(soc.tauxTGC) / 100) : num(j.ttc)); };
  const caMois = jours.reduce((a, d) => a + ca(d), 0);
  const ch = chargesDuMois(S.soc, S.mois);
  const achats = ch.filter((c) => catVariable(c.categorie)).reduce((a, c) => a + num(c.ht), 0);
  const moisPasse = S.mois < auj.slice(0, 7);
  const tauxTheo = num(soc.tauxMatiere) || 30;
  const reel = moisPasse && achats > 0 && caMois > 0;
  const tauxMat = reel ? achats / caMois * 100 : tauxTheo;
  const fixeJour = (d) => ch.filter((c) => !catVariable(c.categorie)).reduce((a, c) => {
    const deb = c.periodeDebut || `${S.mois}-01`, fin = c.periodeFin || finMoisDe(S.mois);
    return d >= deb && d <= fin ? a + num(c.ht) / nbJours(deb, fin) : a;
  }, 0);
  const ms = masseSalariale(soc), persoJour = ms.total / n, redev = num(soc.redevancePct);
  const lignes = jours.map((d) => {
    const c = ca(d), mat = c * tauxMat / 100, red = c * redev / 100, fx = fixeJour(d);
    return { d, ca: c, mat, red, fx, perso: persoJour, res: c - mat - red - fx - persoJour, saisi: !!(cx.jours[d] && (cx.jours[d].ht || cx.jours[d].ttc)) };
  });
  const t = lignes.reduce((a, l) => { for (const x of ["ca", "mat", "red", "fx", "perso", "res"]) a[x] += l[x]; return a; }, { ca: 0, mat: 0, red: 0, fx: 0, perso: 0, res: 0 });
  const saisis = lignes.filter((l) => l.saisi), manquants = lignes.filter((l) => !l.saisi).map((l) => l.d);
  const projCA = saisis.length ? t.ca / saisis.length * n : 0;
  const fixeMois = tous.reduce((a, d) => a + fixeJour(d), 0);
  const projRes = projCA - projCA * (tauxMat + redev) / 100 - fixeMois - ms.total;
  return { lignes, t, tauxMat, reel, tauxTheo, achats, ms, redev, manquants, projCA, projRes, fixeMois, n, nbFactures: ch.length };
}
function renderRentab(v) {
  const soc = socDoc(); if (!soc) { v.innerHTML = `<div class="panel empty">Choisissez un restaurant.</div>`; return; }
  const k = cle();
  if (!S.gest.caisse[k]) { v.innerHTML = `<div class="panel"><p class="muted">Chargement…</p></div>`; chargerGestion(S.soc, S.mois).then(() => S.tab === "rentab" && render()); return; }
  const r = calculRentab(soc), t = r.t, hier = r.lignes.filter((l) => l.saisi).slice(-1)[0];
  const cls = (x) => (x >= 0 ? "pos" : "neg");
  const kpi = (lib, val, sous, c = "") => `<div class="kpi"><span class="small muted">${lib}</span><b class="${c}">${val}</b><span class="small muted">${sous || ""}</span></div>`;
  const max = Math.max(1, ...r.lignes.map((l) => Math.abs(l.res)));
  const W = 640, H = 150, bw = W / Math.max(1, r.n);
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Résultat par jour">
    <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--line,#ccd)"/>
    ${r.lignes.map((l, i) => { const h = Math.abs(l.res) / max * (H / 2 - 6); return `<rect x="${i * bw + 1}" y="${l.res >= 0 ? H / 2 - h : H / 2}" width="${Math.max(1, bw - 2)}" height="${h}" fill="${l.res >= 0 ? "#2f8f5b" : "#c0392b"}" opacity="${l.saisi ? 1 : 0.35}"><title>${frDate(l.d)} : ${F(Math.round(l.res))} F</title></rect>`; }).join("")}
  </svg>`;
  v.innerHTML = `<div class="panel"><div class="row"><h2 class="grow">Rentabilité · ${esc(soc.enseigne || soc.nom)} · ${esc(moisLib(S.mois).toLowerCase())}</h2></div>
    <div class="kpis">
      ${kpi("Résultat du dernier jour saisi", hier ? F(Math.round(hier.res)) + " F" : "—", hier ? frDate(hier.d) + " · CA HT " + F(Math.round(hier.ca)) + " F" : "aucun CA saisi", hier ? cls(hier.res) : "")}
      ${kpi("Résultat cumulé du mois", F(Math.round(t.res)) + " F", `sur ${r.lignes.length} jour(s)`, cls(t.res))}
      ${kpi("CA HT cumulé", F(Math.round(t.ca)) + " F", r.projCA ? "projection fin de mois " + F(Math.round(r.projCA)) + " F" : "")}
      ${kpi("Projection résultat fin de mois", r.projCA ? F(Math.round(r.projRes)) + " F" : "—", "au rythme actuel", r.projCA ? cls(r.projRes) : "")}
    </div>
    ${svg}
    <ul class="alerts">
      ${r.manquants.length ? `<li class="bad">CA non saisi pour ${r.manquants.length} jour(s) : ${r.manquants.slice(-6).map(frDate).join(", ")}${r.manquants.length > 6 ? "…" : ""} (onglet Caisse & factures).</li>` : ""}
      <li>Coût matière : ${r.reel ? `<b>réel ${r.tauxMat.toFixed(1).replace(".", ",")} %</b> (achats du mois ${F(Math.round(r.achats))} F HT / CA)` : `<b>théorique ${r.tauxTheo} %</b> du CA${r.achats ? ` (achats déjà saisis : ${F(Math.round(r.achats))} F HT ; le taux réel s'appliquera une fois le mois terminé)` : " (aucune facture de marchandises saisie)"}`}.</li>
      <li>Personnel : ${F(Math.round(r.ms.total))} F de coût employeur sur le mois (${esc(r.ms.source)}), soit ${F(Math.round(r.ms.total / r.n))} F par jour.</li>
      <li>Charges fixes : ${r.nbFactures ? `${F(Math.round(r.fixeMois))} F HT sur le mois, réparties par jour` : "aucune facture saisie pour ce mois : le résultat est surestimé"}.${r.redev ? ` Redevance franchise : ${r.redev} % du CA.` : ""}</li>
    </ul>
    <div class="tbl-wrap"><table><thead><tr><th>Jour</th><th class="num">CA HT</th><th class="num">Matières</th>${r.redev ? `<th class="num">Redevance</th>` : ""}<th class="num">Personnel</th><th class="num">Charges fixes</th><th class="num">Résultat</th></tr></thead><tbody>
    ${r.lignes.slice().reverse().map((l) => `<tr${l.saisi ? "" : ' class="muted"'}><td>${esc(frDate(l.d))}${l.saisi ? "" : ' <span class="chip">CA non saisi</span>'}</td><td class="num">${F(Math.round(l.ca))}</td><td class="num">${F(Math.round(l.mat))}</td>${r.redev ? `<td class="num">${F(Math.round(l.red))}</td>` : ""}<td class="num">${F(Math.round(l.perso))}</td><td class="num">${F(Math.round(l.fx))}</td><td class="num ${cls(l.res)}"><b>${F(Math.round(l.res))}</b></td></tr>`).join("")}
    <tr><td><b>Total</b></td><td class="num"><b>${F(Math.round(t.ca))}</b></td><td class="num"><b>${F(Math.round(t.mat))}</b></td>${r.redev ? `<td class="num"><b>${F(Math.round(t.red))}</b></td>` : ""}<td class="num"><b>${F(Math.round(t.perso))}</b></td><td class="num"><b>${F(Math.round(t.fx))}</b></td><td class="num ${cls(t.res)}"><b>${F(Math.round(t.res))}</b></td></tr>
    </tbody></table></div>
  </div>
  <div class="panel"><h2>Paramètres de calcul · ${esc(soc.enseigne || soc.nom)}</h2>
    <div class="form" id="rbForm">
      <label>Logiciel de caisse<input name="caisse" value="${esc(soc.caisse || "")}" placeholder="Biborne, Izipass, Freebird…"></label>
      <label>Taux de TGC sur les ventes (%)<input name="tauxTGC" type="number" step="0.1" value="${esc(soc.tauxTGC ?? "")}" placeholder="à vérifier avec votre comptable"></label>
      <label>Coût matière théorique (% du CA HT)<input name="tauxMatiere" type="number" step="0.1" value="${esc(soc.tauxMatiere ?? 30)}"></label>
      <label>Redevance franchise (% du CA HT)<input name="redevancePct" type="number" step="0.1" value="${esc(soc.redevancePct ?? "")}" placeholder="si non facturée à part"></label>
      <label>Coût du personnel mensuel (si hors logiciel de paie)<input name="masseManuelle" type="number" value="${esc(soc.masseManuelle ?? "")}" placeholder="${soc.horsPaie ? "obligatoire pour ce restaurant" : "laisser vide : repris de la paie"}"></label>
    </div>
    <div class="row"><button class="primary" id="rbSave">Enregistrer les paramètres</button><span class="small muted grow">Si la redevance est facturée chaque mois, saisissez plutôt la facture (catégorie « Redevances ») et laissez ce taux vide.</span></div>
  </div>`;
  $("#rbSave").onclick = async () => {
    const f = $("#rbForm"), d = {};
    for (const el of f.querySelectorAll("input")) d[el.name] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value.trim();
    try { await S.db.doc("societes/" + S.soc).update(d); toast("Paramètres enregistrés."); }
    catch (e) { toast("Enregistrement refusé : " + (e.message || e.code)); }
  };
}
