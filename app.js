
(() => {
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const F = PAIE.fmt, n2 = PAIE.n2, hh = PAIE.hh;
const frDate = (d) => d ? d.split("-").reverse().join("/") : "";
const moisLib = (m) => { const [y, mm] = m.split("-"); return ["JANVIER","FÉVRIER","MARS","AVRIL","MAI","JUIN","JUILLET","AOÛT","SEPTEMBRE","OCTOBRE","NOVEMBRE","DÉCEMBRE"][Number(mm) - 1] + " " + y; };
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3500); }
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

const S = { db: null, user: null, admin: false, socs: [], soc: null, mois: null, tab: "saisie", salaries: [], saisie: null, ajust: {}, cloture: null, sel: null, unsub: [], parsed: null, confirm: null };

function defaultMois() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); }
S.mois = store.get("paie.mois") || defaultMois();
$("#selMois").value = S.mois;

const TABS_ADMIN = [["saisie", "Saisie du mois"], ["bulletins", "Bulletins"], ["contrats", "Contrats"], ["cafat", "CAFAT"], ["salaries", "Salariés"], ["societe", "Société"], ["equipe", "Équipe"]];
const TABS_RESP = [["saisie", "Saisie du mois"]];
function renderTabs() {
  const tabs = S.admin ? TABS_ADMIN : TABS_RESP;
  $("#tabs").innerHTML = tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join("");
  $("#tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; S.tab = b.dataset.tab; S.confirm = null; S.cfData = {}; S.cloCache = {}; render(); renderTabs(); };
}

const socDoc = () => S.socs.find((x) => x.id === S.soc);
const cle = () => `${S.soc}_${S.mois}`;

/* ---------- Données ---------- */
function resub() {
  S.unsub.forEach((u) => u()); S.unsub = [];
  if (!S.db || !S.soc) { render(); return; }
  S.saisie = null; S.ajust = {}; S.cloture = null; S.parsed = null; S.sel = null;
  S.unsub.push(S.db.doc("saisies/" + cle()).onSnapshot((d) => { S.saisie = d.exists ? d.data() : null; render(); }, err));
  if (S.admin) {
    S.unsub.push(S.db.collection("salaries").where("societe", "==", S.soc).onSnapshot((q) => { S.salaries = q.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99) || a.nom.localeCompare(b.nom)); render(); }, err));
    S.unsub.push(S.db.doc("ajustements/" + cle()).onSnapshot((d) => { S.ajust = d.exists ? (d.data().par || {}) : {}; render(); }, err));
    S.unsub.push(S.db.collection("documents").where("societe", "==", S.soc).onSnapshot((q) => { S.docs = q.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.le || "").localeCompare(a.le || "")); if (S.tab === "contrats") render(); }, err));
    S.unsub.push(S.db.collection("salaries").onSnapshot((q) => { S.tous = q.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, err));
    S.unsub.push(S.db.doc("clotures/" + cle()).onSnapshot((d) => { S.cloture = d.exists ? d.data() : null; render(); }, err));
  }
}
function err(e) { console.warn(e); toast("Lecture impossible : " + (e && e.message || "erreur")); }

/* ---------- Calcul ---------- */
function actifsDuMois() {
  const deb = S.mois + "-01";
  return S.salaries.filter((s) => s.statut !== "futur" && (!s.sortie || s.sortie >= deb) && (!s.entree || s.entree <= finMois()));
}
function finMois() { const [y, m] = S.mois.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
function varsPour(s) {
  const sv = (S.saisie && S.saisie.variables) || {};
  const noms = (s.planningNoms && s.planningNoms.length ? s.planningNoms : [s.prenom]).map(PAIE.normNom);
  let repas = 0, acompte = 0;
  for (const k of noms) if (sv[k]) { repas += Number(sv[k].repas) || 0; acompte += Number(sv[k].acompte) || 0; }
  return { repas, acompte, ...(S.ajust[s.id] || {}) };
}
function calculer(s) {
  const soc = socDoc();
  const plan = S.saisie && S.saisie.planning ? PAIE.planPour(S.saisie.planning, s.planningNoms && s.planningNoms.length ? s.planningNoms : [s.prenom]) : null;
  const b = PAIE.calcul(soc, s, plan, varsPour(s), S.mois);
  if (!plan && !s.sansPlanning) b.notes.unshift("Absent du planning : salaire de base versé sans variable.");
  return b;
}
function resultats() {
  if (S.cloture && S.cloture.bulletins) return S.cloture.bulletins;
  return actifsDuMois().map((s) => ({ s, b: calculer(s) }));
}

/* ---------- Vues ---------- */
function render() {
  renderVue();
  if (S.admin && S.profil && S.tab !== "equipe") insererAlertes($("#view"));
}
/* ---- Alertes : fins de CDD et de périodes d'essai, toutes sociétés ---- */
function alertesContrats() {
  const auj = today(), jours = (d) => Math.round((new Date(d + "T00:00:00Z") - new Date(auj + "T00:00:00Z")) / 86400000);
  const nomSoc = (id) => (S.socs.find((x) => x.id === id) || {}).nom || id;
  const out = [];
  for (const s of S.tous || []) {
    if (s.statut === "futur") continue;
    const qui = `${s.prenom || ""} ${s.nom || ""}`.trim(), soc = nomSoc(s.societe);
    if (s.sortie && s.sortie <= auj && s.sortie >= "2026-09-01" && !s.sortieCafat) {
      const soc2 = S.socs.find((x) => x.id === s.societe) || {};
      out.push({ niv: "bad", s, j: jours(s.sortie) - 100, cafat: true, txt: `${qui} (${soc}) : sortie du ${frDate(s.sortie)} à déclarer à la CAFAT (délai de 48 h). ${soc2.cafat ? "Déclaration en ligne sur l'espace Pro CAFAT" : "Formulaire papier (onglet Contrats → Fin de contrat → Déclaration de rupture)"}, puis cliquez « Déclarée ».` });
    }
    if (s.statut === "archive") continue;
    if (s.contrat === "CDD") {
      if (!s.sortie) out.push({ niv: "bad", s, txt: `${qui} (${soc}) : CDD sans date de fin dans la fiche. Vérifiez le contrat signé.` });
      else {
        const j = jours(s.sortie);
        if (j >= 0 && j <= 15) out.push({ niv: j <= 5 ? "bad" : "", s, j, txt: `${qui} (${soc}) : le CDD se termine le ${frDate(s.sortie)} (${j === 0 ? "aujourd'hui" : j === 1 ? "demain" : "dans " + j + " jours"}). Pour le garder, faites signer un avenant de renouvellement avant cette date ; sinon préparez la fin de contrat.` });
        else if (j < 0 && j >= -10 && !s.motifSortie) out.push({ niv: "bad", s, j, txt: `${qui} (${soc}) : CDD terminé le ${frDate(s.sortie)}. S'il ou elle travaille encore, le contrat est devenu un CDI ; sinon éditez la fin de contrat (onglet Contrats).` });
      }
    }
    if (s.finEssai) {
      const j = jours(s.finEssai);
      if (j >= 0 && j <= 15) out.push({ niv: "", s, j, txt: `${qui} (${soc}) : la période d'essai se termine le ${frDate(s.finEssai)} (${j === 0 ? "aujourd'hui" : "dans " + j + " jours"}).` });
    }
  }
  return out.sort((a, b) => (a.j ?? -99) - (b.j ?? -99));
}
function insererAlertes(v) {
  const al = alertesContrats(); if (!al.length || !v) return;
  const box = document.createElement("div"); box.className = "panel alertes-contrats"; box.style.marginBottom = "12px";
  const urgent = al.some((a) => a.niv === "bad");
  box.innerHTML = `<details ${urgent || S.alertesOuvertes ? "open" : ""}><summary><b>Contrats à surveiller (${al.length})</b>${urgent ? ' <span class="chip bad">urgent</span>' : ""}</summary>
    <ul class="alerts" style="margin-top:8px">${al.map((a, i) => `<li class="${a.niv}"><span>${esc(a.txt)}</span> <button class="link" data-al="${i}">Ouvrir la fiche</button>${a.cafat ? ` <button class="link" data-decl="${i}">Déclarée</button>` : ""}</li>`).join("")}</ul></details>`;
  v.prepend(box);
  box.querySelector("details").ontoggle = (e) => (S.alertesOuvertes = e.target.open);
  box.querySelectorAll("[data-decl]").forEach((b) => (b.onclick = async () => {
    const s = al[b.dataset.decl].s;
    try { await S.db.doc("salaries/" + s.id).update({ sortieCafat: today() }); toast(`Sortie de ${s.prenom} ${s.nom} notée comme déclarée à la CAFAT.`); }
    catch (e) { toast("Modification refusée : " + (e.message || e.code)); }
  }));
  box.querySelectorAll("[data-al]").forEach((b) => (b.onclick = () => {
    const s = al[b.dataset.al].s;
    S.tab = "salaries"; renderTabs();
    if (S.soc !== s.societe) { S.soc = s.societe; store.set("paie.soc", S.soc); $("#selSoc").value = S.soc; resub(); }
    S.sel = s.id; S.editNew = false; render();
  }));
}
function renderVue() {
  const v = $("#view");
  if (!S.profil) return;
  if (S.admin) store.set("paie.tab", S.tab);
  if (S.admin && S.tab === "equipe") return renderEquipe(v);
  if (!S.socs.length) { if (S.admin) return renderDemarrage(v); v.innerHTML = `<div class="empty">Aucune société ne vous est attribuée pour l'instant. Demandez au gérant de vous donner accès.</div>`; return; }
  if (S.tab === "saisie") return renderSaisie(v);
  if (!S.admin) return renderSaisie(v);
  if (S.tab === "bulletins") return renderBulletins(v);
  if (S.tab === "salaries") return renderSalaries(v);
  if (S.tab === "contrats") return renderContrats(v);
  if (S.tab === "cafat") return renderCafat(v);
  if (S.tab === "equipe") return renderEquipe(v);
  if (S.tab === "societe") { renderSociete(v); return ajouterOutilsSociete(v); }
}

/* ---- Saisie du mois (gérant + responsables) ---- */
function renderSaisie(v) {
  const sa = S.parsed || S.saisie;
  const plan = sa && sa.planning ? sa.planning : null;
  const vars = (S.parsed ? S.parsed.variables : sa && sa.variables) || {};
  const noms = plan ? Object.keys(plan) : Object.keys(vars);
  const clos = S.cloture || (S.saisie && S.saisie.cloture);
  v.innerHTML = `
  <div class="panel">
    <div class="row"><h2 class="grow">Planning de ${esc(moisLib(S.mois).toLowerCase())} — ${esc(socDoc()?.nom || "")}</h2>
      ${S.saisie ? `<span class="chip ok">Enregistré${S.saisie.majParNom ? " par " + esc(S.saisie.majParNom) : ""}${S.saisie.majLe ? " le " + esc(frDate(S.saisie.majLe.slice(0, 10))) : ""}</span>` : `<span class="chip warn">Pas encore de planning</span>`}
      ${clos ? `<span class="chip info">Mois clôturé</span>` : ""}</div>
    <div class="drop" id="drop">
      <div><b>Déposer le planning Excel</b><div class="small muted">Le fichier habituel : orange = congés, mauve = maladie, rouge = heures non effectuées.</div></div>
      <div class="row"><input type="file" id="fic" accept=".xlsx,.xls" ${clos ? "disabled" : ""}><label for="fic" class="small muted" hidden>Fichier</label></div>
    </div>
    ${(sa && sa.alertes && sa.alertes.length) ? `<ul class="alerts">${sa.alertes.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
    ${noms.length ? `
    <div class="tbl-wrap"><table>
      <thead><tr><th>Nom au planning</th><th class="num">Heures</th><th class="num">Non effect.</th><th class="num">Maladie</th><th class="num">Jours CP</th><th class="num">Repas (total F)</th><th class="num">Acompte (F)</th></tr></thead>
      <tbody>${noms.map((k) => {
        const p = plan && plan[k]; const j = p ? p.jours : [];
        const t = (f) => j.reduce((a, x) => a + (x[f] || 0), 0);
        const cp = j.filter((x) => x.cp && new Date(x.d + "T00:00:00Z").getUTCDay() !== 0).length;
        const vv = vars[k] || {};
        return `<tr><td>${esc(p ? p.libelle : k)}</td><td class="num">${p ? hh(t("h")) : "—"}</td><td class="num">${t("ne") ? hh(t("ne")) : ""}</td><td class="num">${t("mal") ? hh(t("mal")) : ""}</td><td class="num">${cp || ""}</td>
        <td><input type="number" min="0" step="1" id="rep_${k}" data-k="${k}" data-f="repas" value="${vv.repas ?? ""}" ${clos ? "disabled" : ""} aria-label="Repas ${esc(k)}"></td>
        <td><input type="number" min="0" step="1000" id="acp_${k}" data-k="${k}" data-f="acompte" value="${vv.acompte ?? ""}" ${clos ? "disabled" : ""} aria-label="Acompte ${esc(k)}"></td></tr>`;
      }).join("")}</tbody></table></div>
    <div class="row"><span class="small muted grow">Saisir le total des repas du mois : la part salarié est calculée automatiquement.</span>
      <button class="primary" id="saveSaisie" ${clos ? "disabled" : ""}>${S.parsed ? "Enregistrer le planning et les variables" : "Enregistrer les variables"}</button></div>` : `<div class="empty">Déposez le planning du mois pour voir les heures de chaque salarié et saisir repas et acomptes.</div>`}
  </div>`;
  const fic = $("#fic"); if (fic) fic.onchange = (e) => e.target.files[0] && lirePlanning(e.target.files[0]);
  const drop = $("#drop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); if (!clos && e.dataTransfer.files[0]) lirePlanning(e.dataTransfer.files[0]); };
  const sv = $("#saveSaisie"); if (sv) sv.onclick = enregistrerSaisie;
}
function lirePlanning(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const wb = XLSX.read(fr.result, { type: "array", cellStyles: true, cellFormula: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const res = PAIE.parsePlanning(ws, XLSX);
      if (!Object.keys(res.salaries).length) { toast("Aucun salarié trouvé dans ce fichier : vérifiez qu'il s'agit du planning."); return; }
      // Mois couvert par le planning (mois majoritaire des jours datés)
      const cpt = {};
      for (const p of Object.values(res.salaries)) for (const j of p.jours || []) if (j.d) cpt[j.d.slice(0, 7)] = (cpt[j.d.slice(0, 7)] || 0) + 1;
      const dom = Object.keys(cpt).sort((x, y) => cpt[y] - cpt[x])[0];
      let bascule = "";
      if (dom && dom !== S.mois) {
        bascule = `Le planning couvre ${moisLib(dom).toLowerCase()} : le mois sélectionné (${moisLib(S.mois).toLowerCase()}) a été changé automatiquement.`;
        S.mois = dom; $("#selMois").value = dom; store.set("paie.mois", dom); resub();
      }
      const alertes = [...res.alertes];
      if (bascule) alertes.unshift(bascule);
      // Noms du planning absents des fiches de la société (gérant)
      if (S.admin && S.salaries.length) {
        const connus = new Set(S.salaries.flatMap((x) => (x.planningNoms && x.planningNoms.length ? x.planningNoms : [x.prenom]).map(PAIE.normNom)));
        const inconnus = Object.keys(res.salaries).filter((k) => !connus.has(PAIE.normNom(k)) && !/^TOTAL/i.test(k));
        if (inconnus.length) {
          const autre = (S.tous || []).filter((x) => x.societe !== S.soc && inconnus.some((k) => (x.planningNoms || [x.prenom]).map(PAIE.normNom).includes(PAIE.normNom(k))));
          const socAutre = autre.length ? (S.socs.find((x) => x.id === autre[0].societe) || {}).nom : "";
          alertes.unshift(`Noms inconnus pour ${socDoc().nom} : ${inconnus.join(", ")}.${inconnus.length > Object.keys(res.salaries).length / 2 && socAutre ? ` Ce planning semble être celui de ${socAutre} : vérifiez la société sélectionnée en haut de page avant d'enregistrer.` : " Ajoutez ces noms dans la fiche du salarié (champ « Noms au planning »), sinon leurs heures ne seront pas payées."}`);
        }
      }
      const old = (S.saisie && S.saisie.variables) || {};
      S.parsed = { planning: res.salaries, alertes, semaines: res.semaines, variables: { ...old }, fichier: file.name };
      render(); toast(bascule || `${Object.keys(res.salaries).length} salariés lus dans le planning. Vérifiez puis enregistrez.`);
    } catch (e) { console.error(e); toast("Lecture du fichier impossible : " + e.message); }
  };
  fr.readAsArrayBuffer(file);
}
async function enregistrerSaisie() {
  const vars = {};
  document.querySelectorAll("input[data-k]").forEach((i) => { const k = i.dataset.k; vars[k] = vars[k] || {}; if (i.value !== "") vars[k][i.dataset.f] = Number(i.value); });
  const base = S.parsed || S.saisie || {};
  const me = S.profil.uid;
  const doc = { societe: S.soc, mois: S.mois, planning: base.planning || {}, alertes: base.alertes || [], semaines: base.semaines || [], fichier: base.fichier || "", variables: vars, majPar: me, majParNom: S.profil.nom || "", majLe: new Date().toISOString(), cloture: !!(S.saisie && S.saisie.cloture) };
  try { await S.db.doc("saisies/" + cle()).set(doc); S.parsed = null; toast("Planning et variables enregistrés."); }
  catch (e) { toast("Enregistrement refusé : " + (e.message || e.code)); }
}

/* ---- Bulletins (gérant) ---- */
function renderBulletins(v) {
  const res = resultats(); const clos = S.cloture;
  if (!S.salaries.length) { v.innerHTML = `<div class="empty">Aucun salarié pour ${esc(socDoc().nom)}. Ajoutez-les dans l'onglet Salariés.</div>`; return; }
  const plan = S.saisie && S.saisie.planning ? S.saisie.planning : {};
  const reconnus = new Set(); S.salaries.forEach((s) => (s.planningNoms || []).forEach((n) => reconnus.add(PAIE.normNom(n))));
  const orphelins = Object.keys(plan).filter((k) => !reconnus.has(k));
  const tot = res.reduce((a, { b }) => ({ brut: a.brut + b.brut, net: a.net + b.net, nap: a.nap + b.nap, cout: a.cout + b.cout }), { brut: 0, net: 0, nap: 0, cout: 0 });
  if (!S.sel || !res.find((x) => x.s.id === S.sel)) S.sel = res[0] && res[0].s.id;
  const cur = res.find((x) => x.s.id === S.sel);
  v.innerHTML = `
  <div class="panel">
    <div class="row"><h2 class="grow">Bulletins de ${esc(moisLib(S.mois).toLowerCase())}</h2>
      ${clos ? `<span class="chip info">Clôturé le ${esc(frDate(clos.le.slice(0, 10)))}</span>` : (S.saisie ? `<span class="chip ok">Planning importé</span>` : `<span class="chip warn">Planning manquant</span>`)}</div>
    <div class="kpis">
      <div class="kpi"><b>${F(tot.brut)}</b><span>Brut total (F)</span></div>
      <div class="kpi"><b>${F(tot.nap)}</b><span>Net à payer total (F)</span></div>
      <div class="kpi"><b>${F(tot.cout)}</b><span>Coût employeur (F)</span></div>
      <div class="kpi"><b>${res.length}</b><span>Bulletins</span></div>
    </div>
    ${orphelins.length && !clos ? `<ul class="alerts">${orphelins.map((k) => `<li class="bad">« ${esc(plan[k].libelle)} » figure au planning mais n'est rattaché à aucun salarié. Ajoutez ce nom dans sa fiche (onglet Salariés, champ « Noms au planning »).</li>`).join("")}</ul>` : ""}
    <div class="row">
      <button class="primary" id="pdfAll">Télécharger les bulletins (PDF)</button>
      <button id="csv">Télécharger le récapitulatif (Excel)</button>
      <span class="grow"></span>
      ${clos ? `<button class="danger" id="rouvrir">Rouvrir le mois</button>` : `<button id="clore" ${S.saisie ? "" : "disabled"}>Clôturer le mois</button>`}
    </div>
    ${S.confirm ? `<div class="confirm"><span class="grow">${esc(S.confirm.msg)}</span><button id="cfNo">Annuler</button><button class="primary" id="cfYes">${esc(S.confirm.ok)}</button></div>` : ""}
    <div class="tbl-wrap"><table>
      <thead><tr><th>Salarié</th><th class="num">Brut</th><th class="num">Net imposable</th><th class="num">Net à payer</th><th>À vérifier</th></tr></thead>
      <tbody>${res.map(({ s, b }) => `<tr class="click ${s.id === S.sel ? "sel" : ""}" data-id="${esc(s.id)}"><td>${esc(s.civ || "")} ${esc(s.prenom)} ${esc(s.nom)}</td><td class="num">${F(b.brut)}</td><td class="num">${F(b.net)}</td><td class="num"><b>${F(b.nap)}</b></td>
        <td>${b.notes.length ? `<span class="chip warn">${b.notes.length} point${b.notes.length > 1 ? "s" : ""}</span>` : `<span class="chip ok">OK</span>`}</td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="num">${F(tot.brut)}</td><td class="num">${F(tot.net)}</td><td class="num">${F(tot.nap)}</td><td></td></tr></tbody></table></div>
  </div>
  ${cur ? `<div class="split">${ajustPanel(cur)}${slipHtml(cur)}</div>` : ""}`;
  document.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => { S.sel = tr.dataset.id; render(); }));
  $("#pdfAll").onclick = () => exporterPdf(res);
  $("#csv").onclick = () => exporterRecap(res);
  if ($("#clore")) $("#clore").onclick = () => { S.confirm = { msg: `Clôturer ${moisLib(S.mois).toLowerCase()} : les bulletins sont figés et les compteurs de congés et cumuls des salariés sont mis à jour.`, ok: "Clôturer", go: cloturer }; render(); };
  if ($("#rouvrir")) $("#rouvrir").onclick = () => { S.confirm = { msg: "Rouvrir le mois : les compteurs des salariés reviennent à leur état d'avant la clôture.", ok: "Rouvrir", go: rouvrir }; render(); };
  if ($("#cfNo")) $("#cfNo").onclick = () => { S.confirm = null; render(); };
  if ($("#cfYes")) $("#cfYes").onclick = () => { const g = S.confirm.go; S.confirm = null; g(); };
  const fa = $("#ajForm");
  if (fa) fa.onsubmit = async (e) => {
    e.preventDefault(); const fd = new FormData(fa); const id = fa.dataset.id;
    const num = (k) => (fd.get(k) === "" ? undefined : Number(fd.get(k)));
    const a = { primeExc: num("primeExc"), valeurJourCP: num("valeurJourCP"), assiduite: fd.get("assid") === "auto" ? null : fd.get("assid") === "oui",
      oa: num("oaMt") ? { lib: fd.get("oaLib") || "Opposition administrative", montant: num("oaMt") } : null,
      autres: num("autMt") ? [{ lib: fd.get("autLib") || "Retenue", montant: num("autMt") }] : [] };
    Object.keys(a).forEach((k) => a[k] === undefined && delete a[k]);
    try { await S.db.doc("ajustements/" + cle()).set({ par: { ...S.ajust, [id]: a } }); toast("Ajustements enregistrés."); }
    catch (e2) { toast("Enregistrement refusé : " + (e2.message || e2.code)); }
  };
}
function ajustPanel({ s, b }) {
  const a = S.ajust[s.id] || {}; const clos = !!S.cloture;
  return `<div class="panel">
    <h2>${esc(s.prenom)} ${esc(s.nom)}</h2>
    ${b.notes.length ? `<ul class="alerts">${b.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : `<p class="small muted" style="margin:0">Rien à signaler sur ce bulletin.</p>`}
    <h3>Éléments du mois</h3>
    <form class="form" id="ajForm" data-id="${esc(s.id)}">
      <label>Prime exceptionnelle (F)<input name="primeExc" id="aj_pex" type="number" step="1" value="${a.primeExc ?? ""}" ${clos ? "disabled" : ""}></label>
      <label>Prime d'assiduité<select name="assid" id="aj_assid" ${clos ? "disabled" : ""}><option value="auto" ${a.assiduite == null ? "selected" : ""}>Automatique (${b.assidAuto ? "oui" : "non"})</option><option value="oui" ${a.assiduite === true ? "selected" : ""}>Oui</option><option value="non" ${a.assiduite === false ? "selected" : ""}>Non</option></select></label>
      <label>Valeur jour CP au dixième (F)<input name="valeurJourCP" id="aj_vj" type="number" step="0.01" value="${a.valeurJourCP ?? ""}" ${clos ? "disabled" : ""}></label>
      <label>Saisie / opposition : libellé<input name="oaLib" id="aj_oal" value="${esc(a.oa?.lib ?? "")}" ${clos ? "disabled" : ""}></label>
      <label>Saisie / opposition : montant (F)<input name="oaMt" id="aj_oam" type="number" step="1" value="${a.oa?.montant ?? ""}" ${clos ? "disabled" : ""}></label>
      <label>Autre retenue : libellé<input name="autLib" id="aj_aul" value="${esc(a.autres?.[0]?.lib ?? "")}" ${clos ? "disabled" : ""}></label>
      <label>Autre retenue : montant (F)<input name="autMt" id="aj_aum" type="number" step="1" value="${a.autres?.[0]?.montant ?? ""}" ${clos ? "disabled" : ""}></label>
      <div class="row" style="align-self:end"><button class="primary" type="submit" ${clos ? "disabled" : ""}>Enregistrer</button></div>
    </form>
    <h3>Congés payés</h3>
    <p class="small" style="margin:0">Acquis ${n2(b.cp.acquis)} · Pris ${n2(b.cp.pris)} · Solde après ce mois <b>${String(b.cp.solde).replace(".", ",")} j</b>${b.cp.n1 ? ` dont ${String(b.cp.n1).replace(".", ",")} j de l'année précédente` : ""}</p>
  </div>`;
}
function slipRows(b) {
  const L = b.lignes.map((l) => `<tr><td>${esc(l.lib)}</td><td class="num">${l.base != null ? n2(l.base) : ""}</td><td class="num">${l.nb != null ? n2(l.nb) : ""}</td><td class="num">${l.taux || ""}</td><td class="num">${F(l.mt)}</td><td></td><td></td></tr>`).join("");
  const C = b.cot.map((c) => `<tr><td>${esc(c.lib)}</td><td class="num">${n2(c.base)}</td><td class="num">${c.forfait ? "1,00" : ""}</td><td class="num">${c.ts ? n2(c.ts) : ""}</td><td class="num">${c.ms ? F(-c.ms) : ""}</td><td class="num">${c.tp ? n2(c.tp) : ""}</td><td class="num">${c.mp ? F(-c.mp) : ""}</td></tr>`).join("");
  const A = b.apres.map((x) => `<tr><td>${esc(x.lib)}</td><td></td><td></td><td></td><td class="num">${F(x.mt)}</td><td></td><td></td></tr>`).join("");
  return `${L}<tr class="strong"><td>SALAIRE BRUT</td><td></td><td></td><td></td><td class="num">${F(b.brut)}</td><td></td><td></td></tr>${C}
  <tr class="strong"><td>TOTAL DES RETENUES SUR LE BRUT</td><td></td><td></td><td></td><td class="num">${F(-b.ts)}</td><td></td><td class="num">${F(-b.tp)}</td></tr>
  <tr class="strong"><td>NET IMPOSABLE</td><td></td><td></td><td></td><td class="num">${F(b.net)}</td><td></td><td></td></tr>${A}
  <tr class="nap"><td>NET A PAYER</td><td></td><td></td><td></td><td class="num">${F(b.nap)} FCFP</td><td></td><td></td></tr>`;
}
function slipHtml({ s, b }) {
  const soc = socDoc();
  return `<div class="panel slip">
    <div class="row"><h2 class="grow">Bulletin de paye - ${esc(moisLib(S.mois))}</h2></div>
    <div class="slip-head">
      <div class="small"><b>${esc(soc.nom)}</b><br>${esc(soc.adresse || "").replace(/\n/g, "<br>")}<br>RIDET ${esc(soc.ridet || "")} · APE ${esc(soc.ape || "")} · CAFAT ${esc(soc.cafat || "")}</div>
      <div class="who small"><b>${esc(s.civ || "")} ${esc(s.prenom)} ${esc(s.nom)}</b><br>Matricule ${esc(s.matricule || "—")} · Entrée ${esc(frDate(s.entree))}${s.sortie ? " · Sortie " + esc(frDate(s.sortie)) : ""}<br>CAFAT ${esc(s.cafat || "à compléter")} · ${esc(s.qualif || "")}<br>${esc(s.emploi || "")} · ${b.reel ? "payé(e) au réel" : `${F(b.baseM)} XPF pour ${n2(Number(s.heuresMois) || 169)} h`}</div>
    </div>
    <div class="tbl-wrap"><table><thead><tr><th>Rubrique</th><th class="num">Base</th><th class="num">Nombre</th><th class="num">Taux</th><th class="num">Montant</th><th class="num">Taux pat.</th><th class="num">Montant pat.</th></tr></thead><tbody>${slipRows(b)}</tbody></table></div>
    <p class="small muted" style="margin:0">Coût employeur ${F(b.cout)} F · Congés : solde ${String(b.cp.solde).replace(".", ",")} jours</p>
  </div>`;
}

/* ---- Clôture ---- */
async function cloturer() {
  const res = actifsDuMois().map((s) => ({ s, b: calculer(s) }));
  const avant = {}; const an = S.mois.slice(0, 4);
  try {
    for (const { s, b } of res) {
      avant[s.id] = { cpSolde: s.cpSolde ?? 0, cpN1: s.cpN1 ?? 0, cumAnnee: s.cumAnnee ?? an, cumBrut: s.cumBrut ?? 0, cumNet: s.cumNet ?? 0, brutAnterieur: s.brutAnterieur ?? 0 };
      const same = (s.cumAnnee || an) === an;
      await S.db.doc("salaries/" + s.id).update({ cpSolde: b.cp.solde, cpN1: b.cp.n1, cumAnnee: an, cumBrut: (same ? Number(s.cumBrut) || 0 : 0) + b.brut, cumNet: (same ? Number(s.cumNet) || 0 : 0) + b.net, brutAnterieur: (Number(s.brutAnterieur) || 0) + b.brut, dernierMois: S.mois });
    }
    await S.db.doc("clotures/" + cle()).set({ le: new Date().toISOString(), avant, bulletins: res.map(({ s, b }) => ({ s, b })) });
    if (S.saisie) await S.db.doc("saisies/" + cle()).update({ cloture: true });
    toast("Mois clôturé : bulletins figés et compteurs mis à jour.");
  } catch (e) { toast("Clôture interrompue : " + (e.message || e.code)); }
}
async function rouvrir() {
  const c = S.cloture; if (!c) return;
  try {
    for (const id in c.avant) await S.db.doc("salaries/" + id).update(c.avant[id]);
    await S.db.doc("clotures/" + cle()).delete();
    if (S.saisie) await S.db.doc("saisies/" + cle()).update({ cloture: false });
    toast("Mois rouvert : compteurs restaurés.");
  } catch (e) { toast("Réouverture interrompue : " + (e.message || e.code)); }
}

/* ---- Exports ---- */
async function enregistrerFichier(filename, data) {
  try {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  } catch (e) { toast("Téléchargement impossible : " + e.message); }
}
function exporterPdf(res) {
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4" }); const soc = socDoc();
  const fm = (x) => F(x); const t = (x) => (x == null ? "" : String(x));
  res.forEach(({ s, b }, i) => {
    if (i) doc.addPage();
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(`BULLETIN DE PAYE - ${moisLib(S.mois)}`, 196, 16, { align: "right" });
    doc.setFontSize(10); doc.text(soc.nom, 14, 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text((soc.adresse || "").split("\n"), 14, 21);
    doc.text([`Période du ${frDate(S.mois + "-01")} au ${frDate(finMois())}`, `RIDET ${soc.ridet || ""}`, `APE ${soc.ape || ""}`, `CAFAT ${soc.cafat || ""}`], 120, 22);
    doc.text([`Matricule  ${s.matricule || ""}`, `Entrée  ${frDate(s.entree)}${s.sortie ? "   Sortie  " + frDate(s.sortie) : ""}`, `CAFAT  ${s.cafat || ""}`, `Convention  ${soc.convention || "Hôtels, Bars, Cafés, Restaurants"}`, `Qualificat.  ${s.qualif || ""}`, `Emploi  ${s.emploi || ""}`, `Salaire base  ${b.reel ? "payé au réel" : fm(b.baseM) + " XPF pour " + n2(Number(s.heuresMois) || 169) + " heures"}`], 14, 44);
    doc.setDrawColor(150); doc.rect(118, 40, 78, 22);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(`${s.civ || ""} ${s.prenom} ${s.nom}`.trim(), 122, 47);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text((s.adresse || "").split("\n"), 122, 52);
    const body = [];
    b.lignes.forEach((l) => body.push([l.lib, l.base != null ? n2(l.base) : "", l.nb != null ? n2(l.nb) : "", t(l.taux), fm(l.mt), "", ""]));
    body.push([{ content: "SALAIRE BRUT", styles: { fontStyle: "bold" } }, "", "", "", { content: fm(b.brut), styles: { fontStyle: "bold" } }, "", ""]);
    b.cot.forEach((c) => body.push([c.lib, n2(c.base), c.forfait ? "1,00" : "", c.ts ? n2(c.ts) : "", c.ms ? fm(-c.ms) : "", c.tp ? n2(c.tp) : "", c.mp ? fm(-c.mp) : ""]));
    body.push([{ content: "TOTAL DES RETENUES SUR LE BRUT", styles: { fontStyle: "bold" } }, "", "", "", { content: fm(-b.ts), styles: { fontStyle: "bold" } }, "", { content: fm(-b.tp), styles: { fontStyle: "bold" } }]);
    body.push([{ content: "NET IMPOSABLE", styles: { fontStyle: "bold" } }, "", "", "", { content: fm(b.net), styles: { fontStyle: "bold" } }, "", ""]);
    b.apres.forEach((x) => body.push([x.lib, "", "", "", fm(x.mt), "", ""]));
    doc.autoTable({ startY: 76, head: [["Rubrique", "Base", "Nombre", "Taux", "Montant", "Taux pat.", "Montant pat."]], body, theme: "plain",
      styles: { fontSize: 7.5, cellPadding: 1.2 }, headStyles: { fillColor: [21, 35, 43], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 70 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
      didDrawCell: (d) => { if (d.section === "body") { doc.setDrawColor(225); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } } });
    let y = doc.lastAutoTable.finalY + 6;
    doc.setFillColor(232, 238, 241); doc.rect(118, y - 5, 78, 9, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("NET A PAYER", 121, y + 1); doc.text(`${fm(b.nap)} FCFP`, 194, y + 1, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text("Payé par virement", 14, y + 1);
    y += 10;
    const cb = s.cumAnnee === S.mois.slice(0, 4) && !S.cloture ? (Number(s.cumBrut) || 0) + b.brut : null;
    doc.text(`Congés payés   Acquis ${n2(b.cp.acquis)}   Pris ${n2(b.cp.pris)}   Solde ${String(b.cp.solde).replace(".", ",")} jours${b.cp.n1 ? "   dont année précédente " + String(b.cp.n1).replace(".", ",") + " jours" : ""}`, 14, y);
    if (cb != null) doc.text(`Cumuls ${S.mois.slice(0, 4)}   Salaire brut ${fm(cb)} F   Net imposable ${fm((Number(s.cumNet) || 0) + b.net)} F`, 14, y + 4.5);
    doc.text(`Coût employeur : ${fm(b.cout)} F`, 14, y + 9);
    doc.setFontSize(6.5); doc.setTextColor(120); doc.text("Dans votre intérêt et pour faire valoir vos droits, conservez ce bulletin sans limitation de durée.", 105, 290, { align: "center" }); doc.setTextColor(0);
  });
  const out = doc.output("arraybuffer");
  enregistrerFichier(`Bulletins_${S.soc}_${S.mois}.pdf`, out);
}
function exporterRecap(res) {
  const rows = res.map(({ s, b }) => ({ Salarié: `${s.prenom} ${s.nom}`, Matricule: s.matricule || "", Brut: b.brut, "Retenues salariales": b.ts, "Net imposable": b.net, "Avantage repas": b.repas, "Part repas": b.part, "Net à payer": b.nap, "Charges patronales": b.tp, "Coût employeur": b.cout, "CP pris": b.cp.pris, "Solde CP": b.cp.solde }));
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Récap " + S.mois);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  enregistrerFichier(`Recap_paie_${S.soc}_${S.mois}.xlsx`, out);
}


/* ---- Contrats et avenants (gérant) ---- */
const ROM = ["", "I", "II", "III", "IV", "V", "VI", "VII"];
const hMois = (h) => Math.round(Number(h) * 52 / 12 * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
function initCt(s) {
  const soc = socDoc(); const smg = soc.smg || 1000.08;
  const cat = Number(String(s.qualif || "").match(/(VII|VI|V|IV|III|II|I)\b/)?.[1] ? ROM.indexOf(String(s.qualif).match(/(VII|VI|V|IV|III|II|I)\b/)[1]) : 1) || 1;
  return { sal: s.id, type: s.contrat === "CDD" ? "CDD" : "CDI", sous: "renouvellement", numero: 1, emploi: s.emploi || "Employé(e) polyvalent(e)", categorie: cat,
    hebdo: s.hebdo || 39, heuresMois: s.heuresMois || hMois(s.hebdo || 39), salaire: Math.max(Number(s.base) || 0, Math.round((s.heuresMois || 169) * smg)),
    debut: s.entree || today(), fin: s.sortie || "", motif: "surcroit", motifDetail: "", essaiJours: 0, finEssai: "", ancienneteDepuis: s.ancienneteDepuis || s.entree || "",
    cddDebut: "", cddFin: "", lieu: "", miseADisposition: "", netConvenu: "", signature: today(), effet: today(), dateContrat: s.entree || "", ancienTerme: s.sortie || "", nouveauTerme: "",
    motifTxt: "", probatoireMois: 0, finProbatoire: "", texteLibre: "", majFiche: true };
}
function paramsCt(c) {
  const p = { ...c, hebdo: Number(c.hebdo), heuresMois: Number(c.heuresMois), salaire: Number(c.salaire), categorie: Number(c.categorie), essaiJours: Number(c.essaiJours) || 0, probatoireMois: Number(c.probatoireMois) || 0, netConvenu: Number(c.netConvenu) || 0 };
  if (c.cddDebut) p.cddPrecedent = { debut: c.cddDebut, fin: c.cddFin };
  if (p.essaiJours && !c.finEssai && c.debut) { const d = new Date(c.debut + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + p.essaiJours - 1); p.finEssai = d.toISOString().slice(0, 10); }
  if (p.probatoireMois && !c.finProbatoire && c.effet) { const d = new Date(c.effet + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + p.probatoireMois); d.setUTCDate(d.getUTCDate() - 1); p.finProbatoire = d.toISOString().slice(0, 10); }
  return p;
}
function blocsCt() {
  const s = S.salaries.find((x) => x.id === S.ct.sal); if (!s) return { blocs: [], warn: [] };
  const soc = socDoc(); const p = paramsCt(S.ct);
  if (S.ct.type === "FIN") return blocsFin(soc, s, p);
  const blocs = S.ct.type === "AVENANT" ? CONTRATS.avenant(soc, s, p) : CONTRATS.contrat(soc, s, p);
  return { blocs, warn: CONTRATS.controles(soc, s, { ...p, type: S.ct.type === "AVENANT" ? "" : S.ct.type, sous: S.ct.type === "AVENANT" ? S.ct.sous : "" }), s, p };
}
function renderContrats(v) {
  if (!S.salaries.length) { v.innerHTML = `<div class="empty">Ajoutez d'abord les salariés dans l'onglet Salariés : les contrats sont rédigés à partir de leur fiche.</div>`; return; }
  if (!S.ct || !S.salaries.find((x) => x.id === S.ct.sal)) S.ct = initCt(S.salaries.find((x) => x.statut !== "archive") || S.salaries[0]);
  const c = S.ct; const fld = (k, l, type = "text", attrs = "") => `<label>${esc(l)}<input id="ct_${k}" data-ct="${k}" type="${type}" ${attrs} value="${esc(c[k] ?? "")}"></label>`;
  const sel = (k, l, opts) => `<label>${esc(l)}<select id="ct_${k}" data-ct="${k}">${opts.map(([val, lab]) => `<option value="${esc(val)}" ${String(c[k]) === String(val) ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select></label>`;
  const cats = [1, 2, 3, 4, 5, 6, 7].map((n) => [n, "Catégorie " + ROM[n]]);
  let champs = "";
  const sCt = S.salaries.find((x) => x.id === c.sal);
  if (c.type === "FIN") champs = champsFin(c, sCt, fld, sel);
  else if (c.type !== "AVENANT") {
    champs = fld("emploi", "Emploi") + sel("categorie", "Catégorie", cats) + fld("hebdo", "Durée hebdomadaire (h)", "number", 'step="0.01"') + fld("heuresMois", "Heures par mois", "number", 'step="0.01"') + fld("salaire", "Salaire mensuel brut (F)", "number") + fld("netConvenu", "Net convenu (facultatif)", "number") + fld("debut", "Date de début", "date");
    if (c.type === "CDD") champs += fld("fin", "Date de fin", "date") + sel("motif", "Motif", [["surcroit", "Surcroît temporaire d'activité"], ["remplacement", "Remplacement d'un salarié absent"], ["saisonnier", "Emploi saisonnier"]]) + fld("motifDetail", c.motif === "remplacement" ? "Nom de la personne remplacée" : "Précision du motif (facultatif)");
    else champs += fld("cddDebut", "CDD précédent : début", "date") + fld("cddFin", "CDD précédent : fin", "date") + fld("ancienneteDepuis", "Ancienneté depuis", "date");
    champs += fld("essaiJours", "Période d'essai (jours, 0 = aucune)", "number") + fld("lieu", "Lieu de travail (facultatif)") + fld("miseADisposition", "Renfort possible chez (facultatif)") + fld("signature", "Date de signature", "date");
  } else {
    champs = sel("sous", "Objet de l'avenant", [["renouvellement", "Renouvellement de CDD"], ["duree", "Durée du travail et salaire"], ["promotion", "Promotion / changement de poste"], ["remuneration", "Rémunération"], ["libre", "Autre modification (texte libre)"]]) + fld("numero", "N° d'avenant", "number");
    if (c.sous === "renouvellement") champs += fld("dateContrat", "Date du contrat initial", "date") + fld("ancienTerme", "Terme actuel du CDD", "date") + fld("nouveauTerme", "Nouveau terme", "date") + fld("motifTxt", "Motif du CDD (facultatif)");
    else champs += fld("effet", "Date d'effet", "date");
    if (c.sous === "duree") champs += fld("hebdo", "Nouvelle durée hebdomadaire (h)", "number", 'step="0.01"') + fld("heuresMois", "Heures par mois", "number", 'step="0.01"') + fld("salaire", "Nouveau salaire brut (F)", "number");
    if (c.sous === "promotion") champs += fld("emploi", "Nouvel emploi") + sel("categorie", "Nouvelle catégorie", cats) + fld("heuresMois", "Heures par mois", "number", 'step="0.01"') + fld("salaire", "Nouveau salaire brut (F)", "number") + fld("probatoireMois", "Période probatoire (mois, 0 = aucune)", "number");
    if (c.sous === "remuneration") champs += fld("heuresMois", "Heures par mois", "number", 'step="0.01"') + fld("salaire", "Nouveau salaire brut (F)", "number") + fld("netConvenu", "Net convenu (facultatif)", "number");
    if (c.sous === "remuneration" || c.sous === "libre") champs += `<label style="grid-column:1/-1">Texte ${c.sous === "libre" ? "de la modification" : "complémentaire (facultatif)"}<textarea id="ct_texteLibre" data-ct="texteLibre" rows="4">${esc(c.texteLibre)}</textarea></label>`;
    champs += fld("signature", "Date de signature", "date");
  }
  const hist = (S.docs || []).filter((d) => d.salarie === c.sal);
  v.innerHTML = `<div class="split">
    <div class="panel"><h2>Contrats, avenants et fins de contrat</h2>
      <div class="form">
        <label>Salarié<select id="ct_sal">${(() => { const o = (s) => `<option value="${esc(s.id)}" ${s.id === c.sal ? "selected" : ""}>${esc(s.prenom)} ${esc(s.nom)}</option>`; const a = S.salaries.filter((s) => s.statut === "archive"); return S.salaries.filter((s) => s.statut !== "archive").map(o).join("") + (a.length ? `<optgroup label="Anciens salariés (archivés)">${a.map(o).join("")}</optgroup>` : ""); })()}</select></label>
        <label>Document<select id="ct_type">${[["CDI", "Contrat CDI"], ["CDD", "Contrat CDD"], ["AVENANT", "Avenant"], ["FIN", "Fin de contrat"]].map(([val, l]) => `<option value="${val}" ${c.type === val ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <p class="small muted" style="margin:0">Pour une embauche, créez d'abord la fiche dans l'onglet Salariés (état civil, adresse, n° CAFAT), puis revenez ici.</p>
      <h3>Clauses</h3>
      <div class="form" id="ctForm">${champs}</div>
      <ul class="alerts" id="ctWarn"></ul>
      <label class="check small"><input type="checkbox" id="ct_maj" ${c.majFiche ? "checked" : ""}> ${c.type === "FIN" ? "Inscrire la date et le motif de sortie dans la fiche salarié" : "Mettre à jour la fiche salarié (contrat, horaires, salaire) après l'édition"}</label>
      ${c.type === "FIN" ? `<label class="check small"><input type="checkbox" id="ct_archiver" data-ct="archiver" ${c.archiver !== false ? "checked" : ""}> Archiver le salarié après l'édition (retiré de la liste des salariés ; son dernier bulletin reste calculé jusqu'à la date de sortie)</label>` : ""}
      <div class="row"><button class="primary" id="ctWord">${c.type === "FIN" && c.finDoc === "rupture" ? "Télécharger le formulaire CAFAT (PDF)" : "Télécharger en Word"}</button></div>
      <h3>Documents édités pour ce salarié</h3>
      ${hist.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Document</th><th></th></tr></thead><tbody>${hist.map((d) => `<tr><td>${esc(frDate(d.le.slice(0, 10)))}</td><td>${esc(d.libelle)}</td><td><button class="link" data-redo="${esc(d.id)}">Rééditer</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="small muted" style="margin:0">Aucun document édité depuis l'application.</p>`}
    </div>
    <div class="panel"><div class="row"><h2 class="grow">Aperçu</h2><span class="small muted">${c.type === "FIN" && c.finDoc === "rupture" ? "Données reportées sur le formulaire officiel." : "Le fichier Word reprend ce texte, modifiable avant signature."}</span></div><div class="docprev" id="ctPrev"></div></div>
  </div>`;
  $("#ct_sal").onchange = (e) => { const t = S.ct.type, ns = S.salaries.find((x) => x.id === e.target.value); S.ct = initCt(ns); if (t === "FIN") Object.assign(S.ct, initFin(ns), { type: "FIN" }); render(); };
  $("#ct_type").onchange = (e) => { S.ct.type = e.target.value; if (S.ct.type === "FIN") Object.assign(S.ct, initFin(sCt), { type: "FIN" }); if (S.ct.type === "CDD" && !S.ct.essaiJours) S.ct.essaiJours = 0; render(); };
  document.querySelectorAll("[data-ct]").forEach((el) => {
    el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", () => {
      const k = el.dataset.ct; S.ct[k] = el.type === "checkbox" ? el.checked : el.value;
      if (k === "hebdo") { S.ct.heuresMois = hMois(el.value); const smg = socDoc().smg || 1000.08; S.ct.salaire = Math.round(S.ct.heuresMois * smg); const a = $("#ct_heuresMois"), b = $("#ct_salaire"); if (a) a.value = S.ct.heuresMois; if (b) b.value = S.ct.salaire; }
      if (k === "debut" || k === "fin") { if (S.ct.type === "CDD" && S.ct.debut && S.ct.fin) { const sem = Math.ceil(((new Date(S.ct.fin) - new Date(S.ct.debut)) / 86400000 + 1) / 7); S.ct.essaiJours = Math.min(sem, 14); const e2 = $("#ct_essaiJours"); if (e2) e2.value = S.ct.essaiJours; } }
      if (k === "sous" || k === "motif" || k === "finDoc" || (S.ct.type === "FIN" && k === "sortie")) return render();
      apercuCt();
    });
  });
  $("#ct_maj").onchange = (e) => (S.ct.majFiche = e.target.checked);
  $("#ctWord").onclick = editerCt;
  document.querySelectorAll("[data-redo]").forEach((b) => (b.onclick = () => { const d = (S.docs || []).find((x) => x.id === b.dataset.redo); if (d) { S.ct = { ...d.params }; render(); toast("Paramètres du document rechargés."); } }));
  apercuCt();
}
function apercuCt() {
  const { blocs, warn, html } = blocsCt();
  $("#ctPrev").innerHTML = html || DOCX.html(blocs, esc);
  $("#ctWarn").innerHTML = warn.map((w) => `<li>${esc(w)}</li>`).join("");
}
function libelleCt(c, s) {
  const L = { renouvellement: "Avenant de renouvellement de CDD", duree: "Avenant durée du travail et salaire", promotion: "Avenant de promotion", remuneration: "Avenant de rémunération", libre: "Avenant" };
  if (c.type === "FIN") return { certificat: "Certificat de travail", solde: "Reçu pour solde de tout compte", rupture: "Déclaration de rupture CAFAT" }[c.finDoc] + ` (sortie du ${frDate(c.sortie)})`;
  return c.type === "AVENANT" ? `${L[c.sous]} n°${c.numero}` : `${c.type} ${Number(c.hebdo) < 39 ? "temps partiel" : "temps complet"} du ${frDate(c.debut)}`;
}
async function editerCt() {
  const { blocs, s, p } = blocsCt(); if (!s) return;
  const c = S.ct; const lib = libelleCt(c, s);
  if (c.type === "FIN") return editerFin(c, s, lib);
  try {
    const buf = await DOCX.build(blocs);
    const nomF = `${lib.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_")}_${s.nom}_${s.prenom}.docx`.normalize("NFD").replace(/[̀-ͯ]/g, "");
    await enregistrerFichier(nomF, buf);
    await S.db.collection("documents").add({ societe: S.soc, salarie: s.id, libelle: lib, le: new Date().toISOString(), params: { ...c } });
    if (c.majFiche) {
      const m = {};
      if (c.type !== "AVENANT") Object.assign(m, { finEssai: p.essaiJours ? p.finEssai : null, statut: "actif", contrat: c.type, entree: c.cddDebut || c.debut, sortie: c.type === "CDD" ? c.fin || null : null, hebdo: p.hebdo, heuresMois: p.heuresMois, base: p.salaire, emploi: c.emploi, qualif: "Catégorie " + ROM[p.categorie], ancienneteDepuis: c.type === "CDI" ? (c.ancienneteDepuis || null) : (s.ancienneteDepuis || null) });
      else if (c.sous === "renouvellement") m.sortie = c.nouveauTerme || s.sortie;
      else if (c.sous === "duree") Object.assign(m, { hebdo: p.hebdo, heuresMois: p.heuresMois, base: p.salaire });
      else if (c.sous === "promotion") Object.assign(m, { emploi: c.emploi, qualif: "Catégorie " + ROM[p.categorie], heuresMois: p.heuresMois, base: p.salaire });
      else if (c.sous === "remuneration") Object.assign(m, { heuresMois: p.heuresMois, base: p.salaire });
      if (Object.keys(m).length) { await S.db.doc("salaries/" + s.id).update(m); toast("Document enregistré et fiche salarié mise à jour."); }
    } else toast("Document enregistré dans l'historique.");
  } catch (e) { toast("Édition impossible : " + (e.message || e.code)); }
}

/* ---- Fin de contrat : certificat de travail, solde de tout compte, déclaration de rupture CAFAT ---- */
const MOTIFS_FIN = [["fin_cdd", "Fin de CDD"], ["demission", "Démission"], ["essai", "Rupture de la période d'essai"], ["licenciement", "Licenciement"], ["rc_employeur", "Rupture conventionnelle (initiative employeur)"], ["rc_salarie", "Rupture conventionnelle (initiative salarié)"], ["autre", "Autre motif"]];
const DIPLOMES = [["1", "1 - Aucun diplôme"], ["2", "2 - BEPC"], ["3", "3 - CAP ou BEP"], ["4", "4 - Bac"], ["5", "5 - Bac +2"], ["6", "6 - Bac +3 / +4"], ["7", "7 - Bac +5 et plus"]];
function initFin(s) {
  if (!s) return {};
  const emp = `${s.emploi || "Employé(e) polyvalent(e)"}${s.qualif ? " - " + s.qualif : ""}`;
  return { finDoc: "certificat", sortie: s.sortie || today(), dateDoc: today(), emplois: emp, motifFin: s.motifSortie || (s.contrat === "CDD" ? "fin_cdd" : "demission"),
    diplome: s.diplome || "1", natureEmploi: Number(s.hebdo || 39) < 39 ? "2" : "1", classification: String(CAFAT.codeClassification(s)), metier: s.emploi || "", nomMarital: s.nomMarital || "",
    etranger: !!(s.nationalite && !/fran/i.test(s.nationalite)), cessation: false, signataire: "", majFiche: true };
}
function champsFin(c, s, fld, sel) {
  if (c.finDoc == null) Object.assign(c, initFin(s));
  let h = sel("finDoc", "Document", [["certificat", "Certificat de travail (Word)"], ["solde", "Reçu pour solde de tout compte (Word)"], ["rupture", "Déclaration de rupture à la CAFAT (PDF)"]])
    + fld("sortie", "Dernier jour du contrat", "date") + fld("dateDoc", "Date du document", "date");
  if (c.finDoc === "certificat") h += `<label style="grid-column:1/-1">Emplois occupés (un par ligne, avec les périodes si plusieurs)<textarea id="ct_emplois" data-ct="emplois" rows="3">${esc(c.emplois)}</textarea></label>`;
  if (c.finDoc === "rupture") {
    h += sel("motifFin", "Motif de la rupture", MOTIFS_FIN) + fld("metier", "Métier exercé") + sel("diplome", "Plus haut diplôme", DIPLOMES)
      + sel("natureEmploi", "Nature de l'emploi", [["1", "1 - Temps complet"], ["2", "2 - Temps partiel"], ["3", "3 - Intermittent (saisonnier)"]])
      + sel("classification", "Classification", [["1", "1 - Non précisé"], ["2", "2 - Manœuvre"], ["3", "3 - Ouvrier qualifié"], ["4", "4 - Employé"], ["5", "5 - Technicien"], ["6", "6 - Agent de maîtrise"], ["7", "7 - Ingénieur / Cadre"]])
      + fld("nomMarital", "Nom marital (facultatif)") + fld("signataire", "Nom et qualité du signataire")
      + `<label class="check"><input type="checkbox" id="ct_etranger" data-ct="etranger" ${c.etranger ? "checked" : ""}> Nationalité étrangère</label>`
      + `<label class="check"><input type="checkbox" id="ct_cessation" data-ct="cessation" ${c.cessation ? "checked" : ""}> Cessation d'activité de l'entreprise</label>`;
  }
  if (c.finDoc === "solde") h += `<p class="small muted" style="grid-column:1/-1;margin:0">Le détail des sommes est repris du bulletin du mois de sortie (clôturé, sinon calculé). Vérifiez ce bulletin avant de faire signer.</p>`;
  return h;
}
S.cloCache = {};
function bulletinSortie(s, sortie) {
  const mois = (sortie || "").slice(0, 7); if (!mois) return { b: null, source: "Indiquez la date de sortie." };
  if (mois === S.mois) {
    if (S.cloture && S.cloture.bulletins) { const x = S.cloture.bulletins.find((r) => r.s.id === s.id); return x ? { b: x.b, source: `bulletin clôturé de ${moisLib(mois).toLowerCase()}` } : { b: null, source: `Le salarié n'est pas dans la clôture de ${moisLib(mois).toLowerCase()}.` }; }
    return { b: calculer({ ...s, sortie }), source: `bulletin de ${moisLib(mois).toLowerCase()} calculé (mois non clôturé)` };
  }
  const key = `${S.soc}_${mois}`;
  if (!(key in S.cloCache)) { S.cloCache[key] = undefined; S.db.doc("clotures/" + key).get().then((d) => { S.cloCache[key] = d.exists ? d.data() : null; if (S.tab === "contrats") render(); }).catch(() => { S.cloCache[key] = null; }); return { b: null, source: "Chargement du bulletin…" }; }
  const clo = S.cloCache[key];
  if (clo === undefined) return { b: null, source: "Chargement du bulletin…" };
  const x = clo && (clo.bulletins || []).find((r) => r.s.id === s.id);
  return x ? { b: x.b, source: `bulletin clôturé de ${moisLib(mois).toLowerCase()}` } : { b: null, source: `Aucun bulletin pour ${moisLib(mois).toLowerCase()} : sélectionnez ce mois en haut de page pour le calculer, ou clôturez-le.` };
}
function donneesRupture(soc, s, c) {
  return { ridet: soc.ridet, ape: soc.ape, denomination: soc.nom, activite: soc.activite || "Restauration de type rapide", cessation: !!c.cessation,
    assure: s.cafat, nom: s.nom, nomMarital: c.nomMarital, prenoms: s.prenom, naissance: s.naissance, lieuNaissance: s.lieuNaissance, etranger: !!c.etranger,
    dateRupture: c.sortie, metier: c.metier || s.emploi, diplome: c.diplome, natureEmploi: c.natureEmploi, classification: c.classification,
    contrat: s.contrat === "CDD" ? "CDD" : "CDI", motif: c.motifFin, dateDoc: c.dateDoc, signataire: c.signataire || `${(soc.representant || "").replace(/^(Monsieur|Madame)\s+/, "")}, ${soc.qualiteRep || "gérant"}` };
}
function blocsFin(soc, s, p) {
  const c = S.ct; const warn = [];
  if (!c.sortie) warn.push("Indiquez le dernier jour du contrat.");
  if (s.entree && c.sortie && c.sortie < s.entree) warn.push("La date de sortie est antérieure à la date d'entrée.");
  if (c.finDoc === "certificat") return { blocs: CONTRATS.certificat(soc, s, { sortie: c.sortie, emplois: c.emplois, dateDoc: c.dateDoc }), warn, s, p };
  if (c.finDoc === "solde") {
    const { b, source } = bulletinSortie(s, c.sortie);
    if (!b) warn.push(source); else warn.push("Montants repris du " + source + ".");
    if (b && s.contrat !== "CDD") warn.push("CDI : ajoutez au bulletin de sortie (ajustements du mois) l'indemnité compensatrice de congés payés, et le cas échéant le préavis et l'indemnité de licenciement, avant d'éditer le reçu.");
    return { blocs: CONTRATS.solde(soc, s, { sortie: c.sortie, dateDoc: c.dateDoc, bulletin: b }), warn, s, p };
  }
  const d = donneesRupture(soc, s, c);
  if (!s.cafat || /cours/i.test(s.cafat)) warn.push("Numéro d'assuré CAFAT manquant dans la fiche salarié.");
  if (!s.naissance || !s.lieuNaissance) warn.push("Date ou lieu de naissance manquant dans la fiche salarié.");
  if (!soc.ridet) warn.push("RIDET de la société manquant (onglet Société).");
  warn.push("À transmettre à la CAFAT dans les 48 heures suivant la rupture (art. R.421-6), en ligne sur l'espace Pro ou avec ce formulaire.");
  const L = [["RIDET / APE", `${d.ridet || "—"} / ${d.ape || "—"}`], ["Employeur", d.denomination], ["Activité", d.activite], ["N° assuré", d.assure || "—"], ["Salarié", `${d.nom} ${d.prenoms}${d.nomMarital ? " (ép. " + d.nomMarital + ")" : ""}`],
    ["Né(e) le", `${frDate(d.naissance)} à ${d.lieuNaissance || "—"}`], ["Nationalité", d.etranger ? "Étrangère" : "Française"], ["Date de rupture", frDate(d.dateRupture)], ["Métier", d.metier],
    ["Diplôme / nature / classification", `${d.diplome} / ${d.natureEmploi} / ${d.classification}`], ["Contrat", d.contrat], ["Motif", (MOTIFS_FIN.find((m) => m[0] === d.motif) || [, ""])[1]], ["Fait le", frDate(d.dateDoc) + " — " + d.signataire]];
  const html = `<div class="doc-title">DÉCLARATION DE RUPTURE DU CONTRAT DE TRAVAIL</div><table class="doc-tbl">${L.map(([k, v2]) => `<tr><td>${esc(k)}</td><td>${esc(v2)}</td></tr>`).join("")}</table><p class="small muted">Le PDF est le formulaire officiel CAFAT, rempli case par case. Relisez-le, signez-le et apposez le cachet.</p>`;
  return { blocs: [], html, warn, s, p, d };
}
async function chargerModele(nom) {
  const r = await fetch("formulaires/" + nom); if (!r.ok) throw new Error("formulaire " + nom + " introuvable");
  return r.arrayBuffer();
}
const nomFichier = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- .]+/g, "").replace(/\s+/g, "_");
async function editerFin(c, s, lib) {
  const soc = socDoc();
  try {
    if (c.finDoc === "rupture") {
      const out = await CAFAT.remplirRupture(await chargerModele("cafat-rupture.pdf"), donneesRupture(soc, s, c));
      await enregistrerFichier(nomFichier(`Declaration_rupture_CAFAT_${s.nom}_${s.prenom}.pdf`), new Blob([out], { type: "application/pdf" }));
    } else {
      const { blocs, warn } = blocsFin(soc, s, {});
      if (c.finDoc === "solde" && !blocs.find((b) => b.t === "tbl" && b.rows.length > 1)) { toast(warn[0] || "Bulletin de sortie introuvable."); return; }
      const buf = await DOCX.build(blocs, false);
      await enregistrerFichier(nomFichier(`${c.finDoc === "solde" ? "Solde_de_tout_compte" : "Certificat_de_travail"}_${s.nom}_${s.prenom}.docx`), buf);
    }
    await S.db.collection("documents").add({ societe: S.soc, salarie: s.id, libelle: lib, le: new Date().toISOString(), params: { ...c } });
    const archiver = c.archiver !== false && c.sortie && s.statut !== "archive";
    if ((c.majFiche && c.sortie && (s.sortie !== c.sortie || (c.finDoc === "rupture" && s.motifSortie !== c.motifFin))) || archiver) {
      const m = { sortie: c.sortie }; if (c.finDoc === "rupture") m.motifSortie = c.motifFin;
      if (archiver) Object.assign(m, { statut: "archive", archiveLe: new Date().toISOString() });
      await S.db.doc("salaries/" + s.id).update(m); toast(archiver ? "Document enregistré ; salarié archivé (retiré de la liste des salariés)." : "Document enregistré, date de sortie inscrite dans la fiche.");
    } else toast("Document enregistré dans l'historique.");
  } catch (e) { toast("Édition impossible : " + (e.message || e.code)); }
}

/* ---- Déclarations CAFAT (gérant) ---- */
S.cf = null; S.cfData = {};
function renderCafat(v) {
  const soc = socDoc();
  if (!S.cf) { const { annee, t } = CAFAT.trimestreDe(S.mois); S.cf = { annee, t, complementaire: false, proratisation: false }; }
  const { annee, t } = S.cf; const key = `${S.soc}_${annee}-T${t}`;
  const mois = CAFAT.moisDuTrimestre(annee, t);
  let dat = S.cfData[key];
  if (!dat) {
    S.cfData[key] = { charge: true };
    Promise.all([...mois.map((m) => S.db.doc(`clotures/${S.soc}_${m}`).get()), S.db.doc(`documents/dnt_${key}`).get()]).then((rs) => {
      const clotures = {}; rs.slice(0, 3).forEach((d, i) => { if (d.exists) clotures[mois[i]] = d.data().bulletins || []; });
      const dd = rs[3].exists ? rs[3].data() : {};
      S.cfData[key] = { clotures, reprises: dd.reprises || {}, enregistre: dd.le || null };
      if (S.tab === "cafat") render();
    }).catch((e) => { S.cfData[key] = { erreur: e.message || String(e) }; if (S.tab === "cafat") render(); });
    dat = S.cfData[key];
  }
  const trims = []; for (let y = annee + 1; y >= annee - 2; y--) for (let q = 4; q >= 1; q--) trims.push([y, q]);
  const tete = `<div class="row"><h2 class="grow">Déclaration nominative trimestrielle (DNT)</h2>
    <label class="row small">Trimestre <select id="cf_trim">${trims.map(([y, q]) => `<option value="${y}-${q}" ${y === annee && q === t ? "selected" : ""}>${q}${q === 1 ? "er" : "e"} trimestre ${y}</option>`).join("")}</select></label></div>`;
  const immat = `<div class="panel"><h2>Fiche d'immatriculation employeur</h2>
    <p class="small" style="margin:0">Pour une société qui embauche son premier salarié et n'a pas encore de numéro employeur CAFAT (par exemple PALLAS). Le formulaire officiel est pré-rempli avec les paramètres de l'onglet Société ; joignez l'extrait Kbis, les statuts et l'avis RIDET.</p>
    <ul class="alerts">${[!soc.ridet && "RIDET manquant", !soc.activite && "activité principale non renseignée", !soc.commune && "commune du siège non renseignée"].filter(Boolean).map((x) => `<li>${esc(x)} (onglet Société)</li>`).join("")}</ul>
    <div class="row"><button id="cf_immat">Télécharger la fiche d'immatriculation (PDF)</button>${soc.cafat ? `<span class="small muted">Cette société a déjà le n° employeur ${esc(soc.cafat)}.</span>` : ""}</div></div>`;
  if (dat.charge || dat.erreur) { v.innerHTML = `<div class="panel">${tete}<p class="muted">${dat.erreur ? "Lecture impossible : " + esc(dat.erreur) : "Chargement des clôtures du trimestre…"}</p></div>${immat}`; lierCafat(v, key); return; }
  const fiches = S.salaries;
  const { debut, fin } = CAFAT.bornes(annee, t);
  const reprises = dat.reprises;
  const dnt = CAFAT.calculDNT(soc, annee, t, dat.clotures, fiches, reprises);
  const actifs = fiches.filter((s) => s.statut !== "futur" && (!s.entree || s.entree <= fin) && (!s.sortie || s.sortie >= debut));
  const ids = [...new Set([...actifs.map((s) => s.id), ...dnt.lignes.map((l) => l.id)])];
  const clo = {}; for (const m of mois) for (const { s, b } of dat.clotures[m] || []) { const e = clo[s.id] || (clo[s.id] = { brut: 0, heures: 0, n: 0 }); e.brut += b.brut; e.heures += CAFAT.heuresBulletin(b); e.n++; }
  const nomDe = (id) => { const s = fiches.find((x) => x.id === id); return s ? `${s.prenom} ${s.nom}` : id; };
  const lig = (id) => dnt.lignes.find((l) => l.id === id);
  const fmH = (x) => (Math.round((x || 0) * 100) / 100).toLocaleString("fr-FR");
  const enCours = new Date().toISOString().slice(0, 10) <= dnt.limite;
  v.innerHTML = `<div class="panel">${tete}
    <p class="small" style="margin:0">Période du ${frDate(debut)} au ${frDate(fin)} · à déclarer et payer au plus tard le <b>${frDate(dnt.limite)}</b>${enCours ? "" : ' <span class="chip">échéance passée</span>'} · mois clôturés : ${dnt.moisPresents.map((m) => moisLib(m).toLowerCase()).join(", ") || "aucun"}.</p>
    <p class="small muted" style="margin:0">${soc.cafat ? "Employeur immatriculé : la DNT se déclare et se paie en ligne sur l'espace Pro de la CAFAT. Reportez-y les montants ci-dessous ; le formulaire papier pré-rempli sert de brouillon ou de secours." : "Pas encore de numéro employeur : faites d'abord l'immatriculation (plus bas), puis utilisez le formulaire papier pré-rempli."}</p>
    <h3>Salariés</h3>
    <div class="tbl-wrap"><table><thead><tr><th>Salarié</th><th>N° assuré</th><th class="num">Brut clôturé</th><th class="num">Heures clôturées</th><th class="num">Reprise brut</th><th class="num">Reprise heures</th><th class="num">Brut déclaré</th><th class="num">Heures</th><th>Embauche</th><th>Rupture</th></tr></thead><tbody>
    ${ids.map((id) => { const l = lig(id); const c = clo[id] || { brut: 0, heures: 0 }; const rp = reprises[id] || {};
      return `<tr><td>${esc(nomDe(id))}</td><td>${l && l.assure ? esc(l.assure) : '<span class="chip">manquant</span>'}</td><td class="num">${F(c.brut)}</td><td class="num">${fmH(c.heures)}</td>
      <td class="num"><input class="cf-rp" id="rpb_${esc(id)}" data-id="${esc(id)}" data-f="brut" type="number" value="${esc(rp.brut ?? "")}" aria-label="Reprise brut" style="width:8em"></td>
      <td class="num"><input class="cf-rp" id="rph_${esc(id)}" data-id="${esc(id)}" data-f="heures" type="number" step="0.01" value="${esc(rp.heures ?? "")}" aria-label="Reprise heures" style="width:6em"></td>
      <td class="num"><b>${F(l ? l.brut : 0)}</b></td><td class="num">${fmH(l ? l.heures : 0)}</td><td>${esc(frDate(l && l.embauche))}</td><td>${esc(frDate(l && l.rupture))}</td></tr>`; }).join("") || `<tr><td colspan="10" class="muted">Aucun salarié sur ce trimestre.</td></tr>`}
    <tr><td><b>Total</b></td><td></td><td></td><td></td><td></td><td></td><td class="num"><b>${F(dnt.totalBrut)}</b></td><td></td><td></td><td></td></tr>
    </tbody></table></div>
    <div class="row"><span class="small muted grow">« Reprise » : brut et heures des mois du trimestre payés hors de l'application (ancien logiciel), à ajouter aux mois clôturés.${dat.enregistre ? " Dernier enregistrement : " + esc(frDate(dat.enregistre.slice(0, 10))) + "." : ""}</span><button id="cf_saveRp">Enregistrer les reprises</button></div>
    <h3>Décompte des cotisations</h3>
    <div class="tbl-wrap"><table><thead><tr><th>Poste</th><th class="num">Assiette</th><th class="num">Taux %</th><th class="num">Montant (F)</th></tr></thead><tbody>
    ${dnt.postes.filter((x) => x.k !== "ruamm2" || x.assiette).map((x) => `<tr><td>${esc(x.lib)}</td><td class="num">${F(x.assiette)}</td><td class="num">${x.taux == null ? "?" : esc(String(x.taux).replace(".", ","))}</td><td class="num">${x.montant == null ? "—" : F(x.montant)}</td></tr>`).join("")}
    <tr><td><b>Total à payer</b></td><td></td><td></td><td class="num"><b>${F(dnt.total)}</b></td></tr></tbody></table></div>
    <ul class="alerts">${dnt.alertes.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
    <div class="row">
      <label class="check small"><input type="checkbox" id="cf_compl" ${S.cf.complementaire ? "checked" : ""}> Déclaration complémentaire</label>
      <label class="check small"><input type="checkbox" id="cf_prorat" ${S.cf.proratisation ? "checked" : ""}> Reporter les assiettes plafonnées par salarié (proratisation)</label>
      <span class="grow"></span><button id="cf_xlsx">Récapitulatif Excel</button><button class="primary" id="cf_pdf">Formulaire DNT pré-rempli (PDF)</button></div>
    <p class="small muted" style="margin:0">Taux appliqués : ceux de l'onglet Société (taux DNT et accident du travail). Les assiettes sont plafonnées au trimestre (3 × plafond mensuel).</p>
  </div>${immat}`;
  lierCafat(v, key, dnt);
}
function lierCafat(v, key, dnt) {
  const soc = socDoc();
  $("#cf_trim").onchange = (e) => { const [y, q] = e.target.value.split("-").map(Number); S.cf.annee = y; S.cf.t = q; render(); };
  $("#cf_immat").onclick = async () => {
    try {
      const adr = (soc.adresse || "").split("\n").map((x) => x.trim()).filter(Boolean);
      const out = await CAFAT.remplirImmat(await chargerModele("cafat-immatriculation.pdf"), { forme: soc.forme, denomination: soc.nom, sigle: soc.sigle, activite: soc.activite, siege: soc.siege || adr[0] || "", correspondance: soc.correspondance || "", bp: soc.bp, cp: soc.cp, commune: soc.commune, tel: soc.tel, mobile: soc.mobile, email: soc.email, ridet: soc.ridet, rc: soc.rc, ape: soc.ape, localisation: soc.localisation || "", dateDoc: today(), signataire: `${(soc.representant || "").replace(/^(Monsieur|Madame)\s+/, "")}, ${soc.qualiteRep || "gérant"}` });
      await enregistrerFichier(nomFichier(`Immatriculation_CAFAT_${soc.nom}.pdf`), new Blob([out], { type: "application/pdf" }));
    } catch (e) { toast("Édition impossible : " + e.message); }
  };
  if (!dnt) return;
  const dat = S.cfData[key];
  v.querySelectorAll(".cf-rp").forEach((i) => (i.onchange = () => { const r = dat.reprises[i.dataset.id] || (dat.reprises[i.dataset.id] = {}); r[i.dataset.f] = i.value === "" ? null : Number(i.value); render(); }));
  $("#cf_saveRp").onclick = async () => {
    const rp = {}; for (const [id, r] of Object.entries(dat.reprises)) if (Number(r.brut) || Number(r.heures)) rp[id] = { brut: Number(r.brut) || 0, heures: Number(r.heures) || 0 };
    try { const le = new Date().toISOString(); await S.db.doc(`documents/dnt_${key}`).set({ societe: S.soc, type: "dnt", trimestre: key.split("_").pop(), reprises: rp, le }); dat.enregistre = le; toast("Reprises enregistrées."); render(); }
    catch (e) { toast("Enregistrement refusé : " + (e.message || e.code)); }
  };
  $("#cf_compl").onchange = (e) => (S.cf.complementaire = e.target.checked);
  $("#cf_prorat").onchange = (e) => (S.cf.proratisation = e.target.checked);
  $("#cf_pdf").onclick = async () => {
    try {
      const out = await CAFAT.remplirDNT(await chargerModele("cafat-dnt.pdf"), { ...dnt, compte: soc.cafat, ridet: soc.ridet, denomination: soc.nom, communeCode: soc.communeCode || "", et: soc.etablissement || String(soc.ridet || "").replace(/\D/g, "").slice(7, 10), codeCotisation: soc.codeCotisation || "", secteur: soc.secteur || "", dateDoc: today(), complementaire: S.cf.complementaire, proratisation: S.cf.proratisation });
      await enregistrerFichier(nomFichier(`DNT_${soc.nom}_${dnt.annee}-T${dnt.t}.pdf`), new Blob([out], { type: "application/pdf" }));
    } catch (e) { toast("Édition impossible : " + e.message); }
  };
  $("#cf_xlsx").onclick = () => {
    const rows = dnt.lignes.map((l) => ({ "N° assuré": l.assure, Nom: l.nom, Prénoms: l.prenoms, Heures: l.heures, "Rémunération brute": l.brut, "Assiette RUAMM T1": l.ruamm1, "Assiette RUAMM T2": l.ruamm2, "Assiette retraite": l.retraite, "Assiette autres régimes": l.autres, "Assiette FSH": l.fsh, Embauche: frDate(l.embauche), Rupture: frDate(l.rupture) }));
    const dec = dnt.postes.map((x) => ({ Poste: x.lib, Assiette: x.assiette, "Taux %": x.taux, Montant: x.montant }));
    dec.push({ Poste: "TOTAL", Montant: dnt.total }, {}, { Poste: "Date limite", Assiette: frDate(dnt.limite) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Salariés");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dec), "Décompte");
    enregistrerFichier(nomFichier(`DNT_${soc.nom}_${dnt.annee}-T${dnt.t}.xlsx`), XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  };
}

/* ---- Pièces d'identité et justificatifs (stockage privé Supabase, gérant uniquement) ---- */
const TYPES_PIECES = ["Contrat signé", "Avenant signé", "Carte d'identité", "Passeport", "Titre de séjour", "Permis de conduire", "Carte CAFAT", "RIB", "Diplôme", "Autre"];
const BUCKET = "pieces";
function blocPieces(s) {
  const pcs = (s.pieces || []).slice().sort((a, b) => (b.ajoute || "").localeCompare(a.ajoute || ""));
  const auj = today();
  return `<h3>Pièces d'identité et justificatifs</h3>
  <div class="tbl-wrap"><table><thead><tr><th>Type</th><th>Fichier</th><th>Expire le</th><th>Ajouté le</th><th></th></tr></thead><tbody>
  ${pcs.map((p) => `<tr><td>${esc(p.type)}</td><td class="small">${esc(p.nom)}</td><td>${p.expire ? esc(frDate(p.expire)) + (p.expire < auj ? ' <span class="chip">expirée</span>' : "") : ""}</td><td>${esc(frDate((p.ajoute || "").slice(0, 10)))}</td>
    <td class="row" style="gap:6px;flex-wrap:nowrap"><button class="link" data-voir="${esc(p.chemin)}">Ouvrir</button><button class="link" data-suppr="${esc(p.chemin)}">Supprimer</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Aucune pièce jointe.</td></tr>`}
  </tbody></table></div>
  <div class="form" id="pcForm">
    <label>Type de pièce<select id="pc_type">${TYPES_PIECES.map((t) => `<option>${esc(t)}</option>`).join("")}</select></label>
    <label>Date d'expiration (facultatif)<input id="pc_exp" type="date"></label>
    <label style="grid-column:1/-1">Fichier (photo ou PDF, 10 Mo maximum ; recto et verso possibles)<input id="pc_fic" type="file" accept="image/*,application/pdf" multiple></label>
  </div>
  <div class="row"><button id="pc_add">Joindre</button><span class="small muted grow">Fichiers stockés dans un espace privé, visibles par le gérant seulement (pas par les responsables).</span></div>`;
}
const MIME_OK = /^(image\/(jpeg|png|heic|heif|webp)|application\/pdf)$/;
function lierPieces(s) {
  const add = $("#pc_add"); if (!add) return;
  add.onclick = async () => {
    const files = [...$("#pc_fic").files]; if (!files.length) { toast("Choisissez un fichier."); return; }
    const type = $("#pc_type").value, expire = $("#pc_exp").value || null;
    const ajouts = [];
    add.disabled = true; add.textContent = "Envoi…";
    try {
      for (const f of files) {
        const mime = f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : /\.hei[cf]$/i.test(f.name) ? "image/heic" : "");
        if (!MIME_OK.test(mime)) throw new Error(`${f.name} : format non accepté (photo JPEG/PNG/HEIC ou PDF)`);
        if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name} : fichier trop lourd (10 Mo maximum)`);
        const propre = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);
        const chemin = `${S.soc}/${s.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${propre}`;
        const { error } = await S.sb.storage.from(BUCKET).upload(chemin, f, { contentType: mime, upsert: false });
        if (error) throw error;
        ajouts.push({ chemin, nom: f.name, type, expire, taille: f.size, mime, ajoute: new Date().toISOString() });
      }
    } catch (e) { toast("Envoi impossible : " + (e.message || e.error || e)); }
    if (ajouts.length) {
      try { await S.db.doc("salaries/" + s.id).update({ pieces: [...(s.pieces || []), ...ajouts] }); toast(ajouts.length > 1 ? `${ajouts.length} pièces jointes.` : "Pièce jointe."); }
      catch (e) { toast("Fiche non mise à jour : " + (e.message || e.code)); }
    }
    add.disabled = false; add.textContent = "Joindre";
  };
  document.querySelectorAll("[data-voir]").forEach((b) => (b.onclick = async () => {
    const w = window.open("", "_blank");
    try {
      const { data, error } = await S.sb.storage.from(BUCKET).createSignedUrl(b.dataset.voir, 120);
      if (error) throw error;
      if (w) w.location = data.signedUrl; else location.assign(data.signedUrl);
    } catch (e) { if (w) w.close(); toast("Ouverture impossible : " + (e.message || e)); }
  }));
  document.querySelectorAll("[data-suppr]").forEach((b) => (b.onclick = async () => {
    const p = (s.pieces || []).find((x) => x.chemin === b.dataset.suppr); if (!p) return;
    if (b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Confirmer ?"; setTimeout(() => { b.dataset.ok = ""; b.textContent = "Supprimer"; }, 4000); return; }
    try {
      const { error } = await S.sb.storage.from(BUCKET).remove([p.chemin]); if (error) throw error;
      await S.db.doc("salaries/" + s.id).update({ pieces: (s.pieces || []).filter((x) => x.chemin !== p.chemin) });
      toast("Pièce supprimée.");
    } catch (e) { toast("Suppression impossible : " + (e.message || e)); }
  }));
}

/* ---- Salariés (gérant) ---- */
const CHAMPS = [
  ["statut", "Statut", "sel:actif=Salarié,futur=Futur salarié (pas encore embauché),archive=Ancien salarié (archivé)"], ["civ", "Civilité", "text"], ["prenom", "Prénom", "text"], ["nom", "Nom", "text"], ["planningNoms", "Noms au planning (séparés par des virgules)", "list"],
  ["matricule", "Matricule", "text"], ["cafat", "N° CAFAT", "text"], ["contrat", "Contrat", "sel:CDI,CDD"], ["entree", "Date d'entrée", "date"], ["ancienneteDepuis", "Ancienneté depuis", "date"], ["sortie", "Date de sortie", "date"], ["finEssai", "Fin de la période d'essai", "date"], ["motifSortie", "Motif de sortie", "sel:=—,fin_cdd=Fin de CDD,demission=Démission,essai=Rupture de la période d'essai,licenciement=Licenciement,rc_employeur=Rupture conventionnelle (employeur),rc_salarie=Rupture conventionnelle (salarié),autre=Autre"], ["sortieCafat", "Sortie déclarée à la CAFAT le", "date"],
  ["qualif", "Qualification", "text"], ["emploi", "Emploi", "text"], ["base", "Salaire de base brut (F)", "num"], ["heuresMois", "Heures par mois", "num"], ["hebdo", "Durée hebdo du contrat (h)", "num"],
  ["anc", "Prime d'ancienneté (%)", "num"], ["mutuelle", "Mutuelle", "sel:0=Aucune,1=Salarié,2=Salarié + ayants droit"], ["repasOfferts", "Repas offerts (pas de part salarié)", "bool"], ["sansAssiduite", "Pas de prime d'assiduité", "bool"],
  ["cpSolde", "Solde de congés (jours)", "num"], ["cpN1", "dont année précédente (jours)", "num"], ["cumBrut", "Cumul brut de l'année (F)", "num"], ["cumNet", "Cumul net imposable (F)", "num"], ["brutAnterieur", "Brut déjà versé sur le contrat (CDD)", "num"],
  ["nomMarital", "Nom marital", "text"], ["diplome", "Plus haut diplôme (CAFAT)", "sel:=—,1=Aucun diplôme,2=BEPC,3=CAP ou BEP,4=Bac,5=Bac +2,6=Bac +3 / +4,7=Bac +5 et plus"], ["adresse", "Adresse", "text"], ["naissance", "Date de naissance", "date"], ["lieuNaissance", "Lieu de naissance", "text"], ["nationalite", "Nationalité", "text"], ["notes", "Notes internes", "text"],
];
function renderSalaries(v) {
  const sel = S.salaries.find((s) => s.id === S.sel) || null;
  const nbArch = S.salaries.filter((x) => x.statut === "archive").length;
  const liste = S.salaries.filter((x) => (x.statut === "archive") === !!S.voirArchives);
  const editing = S.editNew ? { societe: S.soc, statut: "futur", contrat: "CDI", heuresMois: 169, hebdo: 39, mutuelle: 0, anc: 0, cpSolde: 0, cpN1: 0 } : sel;
  v.innerHTML = `<div class="split">
    <div class="panel"><div class="row"><h2 class="grow">${S.voirArchives ? "Anciens salariés" : "Salariés"} de ${esc(socDoc().nom)}</h2>${S.voirArchives ? "" : `<button id="addSal">Ajouter un salarié</button>`}</div>
      <div class="row small"><button class="link" id="togArch">${S.voirArchives ? "← Revenir aux salariés en poste" : `Voir les anciens salariés archivés (${nbArch})`}</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Salarié</th><th>Contrat</th><th class="num">Base</th><th class="num">CP</th></tr></thead><tbody>
      ${liste.map((s) => `<tr class="click ${s.id === S.sel && !S.editNew ? "sel" : ""}" data-id="${esc(s.id)}"><td>${esc(s.prenom)} ${esc(s.nom)} ${s.statut === "futur" ? `<span class="chip">À embaucher</span>` : s.statut === "archive" ? `<span class="chip">Archivé · sorti le ${esc(frDate(s.sortie))}</span>` : s.sortie && s.sortie < S.mois + "-01" ? `<span class="chip">Sorti</span>` : ""}${(s.pieces || []).length ? ` <span class="small muted" title="Pièces jointes">📎${s.pieces.length}</span>` : ""}</td><td>${esc(s.contrat || "")} ${s.hebdo ? esc(String(s.hebdo).replace(".", ",")) + " h" : ""}</td><td class="num">${F(Number(s.base) || 0)}</td><td class="num">${String(s.cpSolde ?? 0).replace(".", ",")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">${S.voirArchives ? "Aucun salarié archivé." : "Aucun salarié."}</td></tr>`}
      </tbody></table></div></div>
    <div class="panel">${editing ? `<h2>${S.editNew ? "Nouveau salarié" : esc(editing.prenom + " " + editing.nom)}</h2>
      <form class="form" id="salForm">${CHAMPS.map(([k, l, t]) => champ(k, l, t, editing[k])).join("")}
      <div class="row" style="grid-column:1/-1"><button class="primary" type="submit">Enregistrer la fiche</button>${S.editNew ? `<button type="button" id="cancelNew">Annuler</button>` : editing.statut === "archive" ? `<button type="button" id="archBtn" data-a="0">Réintégrer dans les salariés</button>` : `<button type="button" id="archBtn" data-a="1">Archiver (fin de contrat)</button>`}</div></form>
      ${S.editNew ? `<p class="small muted" style="margin:0">Enregistrez la fiche pour pouvoir y joindre les pièces d'identité.</p>` : blocPieces(editing)}` : `<div class="empty">Sélectionnez un salarié pour voir ou modifier sa fiche.</div>`}</div></div>`;
  document.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => { S.sel = tr.dataset.id; S.editNew = false; render(); }));
  if ($("#addSal")) $("#addSal").onclick = () => { S.editNew = true; S.voirArchives = false; render(); };
  $("#togArch").onclick = () => { S.voirArchives = !S.voirArchives; S.sel = null; S.editNew = false; render(); };
  if ($("#archBtn")) $("#archBtn").onclick = async (e) => {
    const b = e.target, arch = b.dataset.a === "1";
    if (arch && !sel.sortie) { toast("Indiquez d'abord la date de sortie dans la fiche (ou éditez la fin de contrat dans l'onglet Contrats)."); return; }
    if (arch && b.dataset.ok !== "1") { b.dataset.ok = "1"; b.textContent = "Confirmer l'archivage ?"; setTimeout(() => { b.dataset.ok = ""; b.textContent = "Archiver (fin de contrat)"; }, 4000); return; }
    try { await S.db.doc("salaries/" + sel.id).update({ statut: arch ? "archive" : "actif", archiveLe: arch ? new Date().toISOString() : null }); S.sel = null; toast(arch ? `${sel.prenom} ${sel.nom} archivé(e) : retiré(e) de la liste. Son dernier bulletin reste calculé jusqu'à sa date de sortie.` : "Salarié réintégré."); }
    catch (e2) { toast("Modification refusée : " + (e2.message || e2.code)); }
  };
  if ($("#cancelNew")) $("#cancelNew").onclick = () => { S.editNew = false; render(); };
  if (sel && !S.editNew) lierPieces(sel);
  const f = $("#salForm");
  if (f) f.onsubmit = async (e) => {
    e.preventDefault(); const d = { societe: S.soc };
    for (const [k, , t] of CHAMPS) { const el = f.elements[k]; if (!el) continue;
      if (t === "bool") d[k] = el.checked; else if (t === "num") d[k] = el.value === "" ? null : Number(el.value);
      else if (t === "list") d[k] = el.value.split(",").map((x) => x.trim()).filter(Boolean);
      else if (t.startsWith("sel:") && k === "mutuelle") d[k] = Number(el.value); else d[k] = el.value || null; }
    if (!d.prenom || !d.nom) { toast("Indiquez au moins le prénom et le nom."); return; }
    if (!d.planningNoms.length) d.planningNoms = [d.prenom];
    try {
      if (S.editNew) { const ref = await S.db.collection("salaries").add(d); S.sel = ref.id; S.editNew = false; }
      else { const { id: _i, ...rest } = sel; await S.db.doc("salaries/" + S.sel).set({ ...rest, ...d }); }
      toast("Fiche enregistrée.");
    } catch (e2) { toast("Enregistrement refusé : " + (e2.message || e2.code)); }
  };
}
function champ(k, l, t, val) {
  const id = "f_" + k;
  if (t === "bool") return `<label class="check"><input type="checkbox" name="${k}" id="${id}" ${val ? "checked" : ""}>${esc(l)}</label>`;
  if (t.startsWith("sel:")) { const opts = t.slice(4).split(",").map((o) => o.split("=")); return `<label>${esc(l)}<select name="${k}" id="${id}">${opts.map(([v, lab]) => `<option value="${esc(v)}" ${String(val ?? "") === v ? "selected" : ""}>${esc(lab || v)}</option>`).join("")}</select></label>`; }
  const type = t === "num" ? "number" : t === "date" ? "date" : "text";
  const value = t === "list" ? (val || []).join(", ") : (val ?? "");
  return `<label>${esc(l)}<input name="${k}" id="${id}" type="${type}" ${t === "num" ? 'step="any"' : ""} value="${esc(value)}"></label>`;
}

/* ---- Société (gérant) ---- */
function renderSociete(v) {
  const soc = socDoc() || { id: "", nom: "", cotisations: [] };
  const dntP = { ...CAFAT.DEFAUT, ...(soc.dnt || {}) };
  v.innerHTML = `<div class="panel"><h2>Paramètres de ${esc(soc.nom || "la société")}</h2>
  <form id="socForm" class="form">
    <label>Raison sociale<input name="nom" id="s_nom" value="${esc(soc.nom)}"></label>
    <label>Adresse (une ligne par retour)<textarea name="adresse" id="s_adr" rows="3">${esc(soc.adresse || "")}</textarea></label>
    <label>Forme juridique<input name="forme" id="s_forme" value="${esc(soc.forme || "S.A.R.L.")}"></label>
    <label>Capital (F.CFP)<input name="capital" id="s_cap" value="${esc(soc.capital || "")}"></label>
    <label>Représentant (contrats)<input name="representant" id="s_rep2" value="${esc(soc.representant || "Monsieur RODRIGUEZ Alexandre")}"></label>
    <label>Qualité du représentant<input name="qualiteRep" id="s_qual" value="${esc(soc.qualiteRep || "gérant")}"></label>
    <label>N° Humanis/CRE<input name="humanis" id="s_hum" value="${esc(soc.humanis || "")}"></label>
    <label>Zones filmées (une par ligne)<textarea name="cameras" id="s_cam" rows="3">${esc(soc.cameras || "Restaurant / Salle\nCaisses")}</textarea></label>
    <label>RIDET<input name="ridet" id="s_ridet" value="${esc(soc.ridet || "")}"></label>
    <label>Code APE<input name="ape" id="s_ape" value="${esc(soc.ape || "")}"></label>
    <label>N° employeur CAFAT<input name="cafat" id="s_cafat" value="${esc(soc.cafat || "")}"></label>
    <label>Convention<input name="convention" id="s_conv" value="${esc(soc.convention || "Hôtels, Bars, Cafés, Restaurants")}"></label>
    <label>SMG horaire (F)<input name="smg" id="s_smg" type="number" step="0.01" value="${soc.smg ?? 1000.08}"></label>
    <label>Prime d'assiduité (F)<input name="assiduite" id="s_ass" type="number" value="${soc.assiduite ?? 4000}"></label>
    <label>Part salarié des repas (%)<input name="repasPct" id="s_rep" type="number" value="${soc.repasPct ?? 30}"></label>
    <label>CCS (%)<input name="ccs" id="s_ccs" type="number" step="0.01" value="${soc.ccs ?? 3}"></label>
    <label>Mutuelle : part salarié (F)<input name="mutSal" id="s_ms" type="number" value="${soc.mutSal ?? 1425}"></label>
    <label>Mutuelle : part patronale (F)<input name="mutPat" id="s_mp" type="number" value="${soc.mutPat ?? 1425}"></label>
    <label>Mutuelle : ayants droit (F)<input name="mutAyd" id="s_ma" type="number" value="${soc.mutAyd ?? 2850}"></label>
    <h3 style="grid-column:1/-1;margin-bottom:0">Déclarations CAFAT</h3>
    <label>Sigle / enseigne<input name="sigle" id="s_sigle" value="${esc(soc.sigle || "")}"></label>
    <label>Activité principale<input name="activite" id="s_act" value="${esc(soc.activite || "Restauration de type rapide")}"></label>
    <label>Code postal<input name="cp" id="s_cp" value="${esc(soc.cp || "")}"></label>
    <label>Commune du siège<input name="commune" id="s_com" value="${esc(soc.commune || "")}"></label>
    <label>Boîte postale<input name="bp" id="s_bp" value="${esc(soc.bp || "")}"></label>
    <label>Téléphone fixe<input name="tel" id="s_tel" value="${esc(soc.tel || "")}"></label>
    <label>Mobile<input name="mobile" id="s_mob" value="${esc(soc.mobile || "")}"></label>
    <label>E-mail<input name="email" id="s_mail" value="${esc(soc.email || "")}"></label>
    <label>N° RCS<input name="rc" id="s_rc" value="${esc(soc.rc || "")}"></label>
    <label>Code commune de travail (DNT)<input name="communeCode" id="s_cc" value="${esc(soc.communeCode || "")}" placeholder="ex. 18 = Nouméa"></label>
    <label>N° d'établissement (DNT)<input name="etablissement" id="s_et" value="${esc(soc.etablissement || "")}" placeholder="3 derniers chiffres du RIDET"></label>
    <label>Code cotisation (DNT)<input name="codeCotisation" id="s_ccot" value="${esc(soc.codeCotisation || "")}"></label>
    <label>Secteur (DNT)<input name="secteur" id="s_sect" value="${esc(soc.secteur || "")}"></label>
    <label>Taux RUAMM T1 + FIAF (%)<input name="tauxRuamm1" id="s_tr1" type="number" step="0.001" value="${dntP.tauxRuamm1 ?? ""}"></label>
    <label>Taux retraite (%)<input name="tauxRetraite" id="s_tret" type="number" step="0.001" value="${dntP.tauxRetraite ?? ""}"></label>
    <label>Taux autres régimes (%)<input name="tauxAutres" id="s_taut" type="number" step="0.001" value="${dntP.tauxAutres ?? ""}"></label>
    <label>Taux RUAMM T2 (%)<input name="tauxRuamm2" id="s_tr2" type="number" step="0.001" value="${dntP.tauxRuamm2 ?? ""}" placeholder="si un salarié dépasse le plafond"></label>
    <label style="grid-column:1/-1">Jours fériés (AAAA-MM-JJ, séparés par des virgules)<input name="feries" id="s_fer" value="${esc((soc.feries || []).join(", "))}"></label>
  </form>
  <h3>Cotisations</h3>
  <div class="tbl-wrap"><table><thead><tr><th>Libellé</th><th class="num">Taux salarié %</th><th class="num">Taux patronal %</th><th class="num">Plafond (F)</th></tr></thead><tbody id="cotBody">
  ${(soc.cotisations || []).map((c, i) => `<tr><td><input id="c_l${i}" data-i="${i}" data-f="lib" value="${esc(c.lib)}" aria-label="Libellé"></td><td><input id="c_s${i}" data-i="${i}" data-f="sal" type="number" step="0.001" value="${c.sal}" aria-label="Taux salarié"></td><td><input id="c_p${i}" data-i="${i}" data-f="pat" type="number" step="0.001" value="${c.pat}" aria-label="Taux patronal"></td><td><input id="c_m${i}" data-i="${i}" data-f="plafond" type="number" value="${c.plafond ?? ""}" aria-label="Plafond"></td></tr>`).join("")}
  </tbody></table></div>
  <div class="row"><button id="addCot">Ajouter une cotisation</button><span class="grow"></span><button class="primary" id="saveSoc">Enregistrer les paramètres</button></div>
  <p class="small muted" style="margin:0">Mettez à jour le SMG, les taux CAFAT et les jours fériés quand ils changent : tous les bulletins non clôturés sont recalculés.</p></div>`;
  $("#addCot").onclick = () => { soc.cotisations = [...(soc.cotisations || []), { lib: "Nouvelle cotisation", sal: 0, pat: 0, plafond: null }]; renderSociete(v); };
  $("#saveSoc").onclick = async () => {
    const f = $("#socForm"); const d = {};
    ["nom", "adresse", "ridet", "ape", "cafat", "convention", "forme", "capital", "representant", "qualiteRep", "humanis", "cameras", "sigle", "activite", "cp", "commune", "bp", "tel", "mobile", "email", "rc", "communeCode", "etablissement", "codeCotisation", "secteur"].forEach((k) => (d[k] = f.elements[k].value));
    d.dnt = { ...(soc.dnt || {}) }; ["tauxRuamm1", "tauxRetraite", "tauxAutres", "tauxRuamm2"].forEach((k) => (d.dnt[k] = f.elements[k].value === "" ? null : Number(f.elements[k].value)));
    ["smg", "assiduite", "repasPct", "ccs", "mutSal", "mutPat", "mutAyd"].forEach((k) => (d[k] = Number(f.elements[k].value)));
    d.feries = f.elements.feries.value.split(",").map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
    const cots = (soc.cotisations || []).map((c) => ({ ...c }));
    document.querySelectorAll("#cotBody input").forEach((i) => { const c = cots[i.dataset.i]; const fld = i.dataset.f; c[fld] = fld === "lib" ? i.value : (i.value === "" ? null : Number(i.value)); });
    d.cotisations = cots.filter((c) => c.lib);
    try { const { id: _i, ...rest } = soc; await S.db.doc("societes/" + soc.id).set({ ...rest, ...d }); toast("Paramètres enregistrés."); }
    catch (e) { toast("Enregistrement refusé : " + (e.message || e.code)); }
  };
}

/* ---------- Société par défaut (nouvelle société) ---------- */
const SOC_DEFAUT = {
  smg: 1000.08, assiduite: 4000, repasPct: 30, ccs: 3, mutSal: 1425, mutPat: 1425, mutAyd: 2850, ape: "5610C",
  convention: "Hôtels, Bars, Cafés, Restaurants", forme: "S.A.R.L.", representant: "Monsieur RODRIGUEZ Alexandre", qualiteRep: "gérant",
  cameras: "Restaurant / Salle\nCaisses", feries: [],
  cotisations: [
    { lib: "Retraite Agirc-Arrco T1", sal: 3.15, pat: 4.72, plafond: 477923 },
    { lib: "Retraite CEG T1", sal: 0.86, pat: 1.29, plafond: 477923 },
    { lib: "Cotisations CAFAT", sal: 0.34, pat: 7.675, plafond: 390900 },
    { lib: "Cotisations CAFAT RETRAITE + RUAMM T1", sal: 7.05, pat: 21.67, plafond: 548600 },
    { lib: "Accident du Travail (taux à compléter)", sal: 0, pat: 0, plafond: 390900 },
    { lib: "Fond Social de l'Habitat", sal: 0, pat: 2, plafond: 329700 },
  ],
};
const COLLECTIONS = ["societes", "salaries", "saisies", "ajustements", "clotures", "documents"];

/* ---------- Base vide (premier démarrage du gérant) ---------- */
function renderDemarrage(v) {
  v.innerHTML = `<div class="panel"><h2>Bienvenue</h2>
    <p style="margin:0">La base est vide. Importez le fichier <b>donnees-initiales.json</b> fourni avec le site : il contient SNDRR, TABBY, PALLAS, les salariés et la paie de septembre 2026.</p>
    <div class="row"><input type="file" id="impFic" accept=".json,application/json"><label for="impFic" class="small muted" hidden>Fichier</label></div>
    <div id="impZone"></div>
    <h3>Ou partir de zéro</h3>
    ${formNouvelleSociete()}
  </div>`;
  lierImport(); lierNouvelleSociete();
}
function formNouvelleSociete() {
  return `<form class="row" id="newSoc"><label class="small muted" for="ns_nom">Raison sociale</label><input id="ns_nom" placeholder="SARL …" required><button type="submit">Créer la société</button></form>`;
}
function lierNouvelleSociete() {
  const f = $("#newSoc"); if (!f) return;
  f.onsubmit = async (e) => {
    e.preventDefault(); const nom = $("#ns_nom").value.trim(); if (!nom) return;
    const id = nom.replace(/^(SARL|SAS|SA|EURL)\s+/i, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (S.socs.find((x) => x.id === id)) { toast("Une société porte déjà cet identifiant."); return; }
    try { await S.db.doc("societes/" + id).set({ ...SOC_DEFAUT, nom, ordre: S.socs.length + 1 }); S.soc = id; store.set("paie.soc", id); S.tab = "societe"; renderTabs(); toast(`${nom} créée : complétez ses paramètres.`); }
    catch (e2) { toast("Création refusée : " + (e2.message || e2.code)); }
  };
}

/* ---------- Sauvegarde et import (gérant) ---------- */
function ajouterOutilsSociete(v) {
  const p = document.createElement("div"); p.className = "panel";
  p.innerHTML = `<h2>Autres sociétés</h2>${formNouvelleSociete()}
    <h2>Sauvegarde</h2>
    <p class="small muted" style="margin:0">Téléchargez une sauvegarde complète chaque mois après la clôture, et conservez-la hors du site.</p>
    <div class="row"><button id="expAll">Télécharger une sauvegarde complète</button></div>
    <h3>Importer un fichier de données</h3>
    <p class="small muted" style="margin:0">Les documents du fichier remplacent ceux qui portent le même identifiant. Les comptes utilisateurs ne sont jamais importés.</p>
    <div class="row"><input type="file" id="impFic" accept=".json,application/json"><label for="impFic" class="small muted" hidden>Fichier</label></div>
    <div id="impZone"></div>`;
  v.appendChild(p); v.style.display = "flex"; v.style.flexDirection = "column"; v.style.gap = "14px";
  lierNouvelleSociete(); lierImport();
  $("#expAll").onclick = async () => {
    try {
      const out = { format: "paie-restaurants", version: 1, exporteLe: new Date().toISOString(), collections: {} };
      for (const c of [...COLLECTIONS, "users"]) { const q = await S.db.collection(c).get(); out.collections[c] = {}; q.docs.forEach((d) => (out.collections[c][d.id] = d.data())); }
      enregistrerFichier(`sauvegarde-paie-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
    } catch (e) { toast("Sauvegarde impossible : " + (e.message || e.code)); }
  };
}
function lierImport() {
  const inp = $("#impFic"); if (!inp) return;
  inp.onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    let data; try { data = JSON.parse(await f.text()); } catch { toast("Ce fichier n'est pas un fichier de données valide."); return; }
    if (!data || data.format !== "paie-restaurants" || !data.collections) { toast("Ce fichier ne vient pas de Paie Restaurants."); return; }
    const resume = COLLECTIONS.map((c) => [c, Object.keys(data.collections[c] || {}).length]).filter(([, n]) => n);
    $("#impZone").innerHTML = `<div class="confirm"><span class="grow">Importer ${resume.map(([c, n]) => `${n} ${c}`).join(", ")} ?</span><button id="impNo" type="button">Annuler</button><button class="primary" id="impYes" type="button">Importer</button></div>`;
    $("#impNo").onclick = () => { $("#impZone").innerHTML = ""; inp.value = ""; };
    $("#impYes").onclick = async () => {
      $("#impZone").innerHTML = `<p class="small muted">Import en cours…</p>`;
      try {
        const ops = [];
        for (const c of COLLECTIONS) for (const [id, d] of Object.entries(data.collections[c] || {})) ops.push([c + "/" + id, d]);
        for (let i = 0; i < ops.length; i += 400) {
          const b = S.db.batch(); ops.slice(i, i + 400).forEach(([p, d]) => b.set(S.db.doc(p), d)); await b.commit();
        }
        $("#impZone").innerHTML = ""; inp.value = ""; toast(`${ops.length} documents importés.`);
      } catch (e2) { $("#impZone").innerHTML = ""; toast("Import interrompu : " + (e2.message || e2.code)); }
    };
  };
}

/* ---------- Équipe (gérant) ---------- */
function genMdp() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; const r = new Uint32Array(12); crypto.getRandomValues(r);
  return Array.from(r, (x) => a[x % a.length]).join("");
}
const ROLES = { admin: "Gérant", responsable: "Responsable", inactif: "Désactivé" };
function renderEquipe(v) {
  const users = (S.users || []).slice().sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));
  const sel = users.find((u) => u.uid === S.selUser);
  const socBoxes = (pref, cur) => S.socs.map((s) => `<label class="check"><input type="checkbox" name="soc" value="${esc(s.id)}" id="${pref}_${esc(s.id)}" ${(cur || []).includes(s.id) ? "checked" : ""}>${esc(s.nom)}</label>`).join("") || `<span class="small muted">Aucune société créée.</span>`;
  v.innerHTML = `<div class="split">
    <div class="panel"><div class="row"><h2 class="grow">Comptes d'accès</h2><button id="addUser">Créer un compte</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Nom</th><th>Rôle</th><th>Sociétés</th></tr></thead><tbody>
      ${users.map((u) => `<tr class="click ${u.uid === S.selUser ? "sel" : ""}" data-uid="${esc(u.uid)}"><td>${esc(u.nom || "")}<div class="small muted">${esc(u.email || "")}</div></td>
        <td><span class="chip ${u.role === "admin" ? "info" : u.role === "inactif" ? "bad" : "ok"}">${ROLES[u.role] || esc(u.role)}</span></td>
        <td class="small">${u.role === "admin" ? "Toutes" : esc((u.societes || []).map((id) => (S.socs.find((s) => s.id === id) || {}).nom || id).join(", "))}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="small muted" style="margin:0">Le responsable d'un restaurant dépose le planning et saisit les repas et acomptes de sa ou ses sociétés. Il ne voit ni les salaires, ni les bulletins, ni les contrats.</p>
    </div>
    <div class="panel">
    ${S.nouveauCompte ? `<h2>Compte créé</h2>
      <p style="margin:0">Transmettez à <b>${esc(S.nouveauCompte.email)}</b> l'adresse du site et ce mot de passe provisoire. Il pourra le changer après sa première connexion (« Mon mot de passe », en haut à droite).</p>
      ${S.nouveauCompte.confirmation ? `<p class="small" style="margin:0;color:var(--warn)">Supabase demande encore la confirmation de l'adresse e-mail : la personne devra cliquer sur le lien reçu avant de se connecter. Pour l'éviter, désactivez « Confirm email » (guide, étape 2).</p>` : ""}
      <div class="row"><code class="num" id="mdp" style="font-size:16px;user-select:all">${esc(S.nouveauCompte.pwd)}</code><button id="cpMdp">Copier</button></div>
      <p class="small muted" style="margin:0">Ce mot de passe ne sera plus affiché.</p>
      <div class="row"><button id="okMdp" class="primary">Terminé</button></div>` :
    S.creerUser ? `<h2>Nouveau compte</h2>
      <form class="form" id="userForm">
        <label>Nom et prénom<input name="nom" id="u_nom" required></label>
        <label>Adresse e-mail<input name="email" id="u_email" type="email" required></label>
        <label>Rôle<select name="role" id="u_role"><option value="responsable">Responsable de restaurant</option><option value="admin">Gérant (accès complet)</option></select></label>
        <div style="grid-column:1/-1"><div class="small muted">Sociétés accessibles (responsable)</div><div class="row">${socBoxes("nu", [])}</div></div>
        <div class="row" style="grid-column:1/-1"><button class="primary" type="submit">Créer le compte</button><button type="button" id="cancelUser">Annuler</button></div>
      </form>` :
    sel ? `<h2>${esc(sel.nom || sel.email)}</h2>
      <form class="form" id="userEdit">
        <label>Nom et prénom<input name="nom" id="ue_nom" value="${esc(sel.nom || "")}"></label>
        <label>Adresse e-mail<input id="ue_email" value="${esc(sel.email || "")}" disabled></label>
        <label>Rôle<select name="role" id="ue_role" ${sel.uid === S.profil.uid ? "disabled" : ""}>${Object.entries(ROLES).map(([k, l]) => `<option value="${k}" ${sel.role === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <div style="grid-column:1/-1"><div class="small muted">Sociétés accessibles (responsable)</div><div class="row">${socBoxes("ue", sel.societes)}</div></div>
        <div class="row" style="grid-column:1/-1"><button class="primary" type="submit">Enregistrer</button><button type="button" id="resetMdp">Envoyer un lien de mot de passe</button></div>
      </form>
      ${sel.uid === S.profil.uid ? `<p class="small muted" style="margin:0">Vous ne pouvez pas modifier votre propre rôle.</p>` : `<p class="small muted" style="margin:0">Pour retirer l'accès à quelqu'un, passez son rôle à « Désactivé ».</p>`}` :
    `<div class="empty">Sélectionnez un compte, ou créez-en un pour un responsable.</div>`}
    </div></div>`;
  document.querySelectorAll("tr[data-uid]").forEach((tr) => (tr.onclick = () => { S.selUser = tr.dataset.uid; S.creerUser = false; S.nouveauCompte = null; render(); }));
  $("#addUser").onclick = () => { S.creerUser = true; S.nouveauCompte = null; render(); };
  if ($("#cancelUser")) $("#cancelUser").onclick = () => { S.creerUser = false; render(); };
  if ($("#okMdp")) $("#okMdp").onclick = () => { S.nouveauCompte = null; render(); };
  if ($("#cpMdp")) $("#cpMdp").onclick = async () => { try { await navigator.clipboard.writeText(S.nouveauCompte.pwd); toast("Mot de passe copié."); } catch { const r = document.createRange(); r.selectNodeContents($("#mdp")); getSelection().removeAllRanges(); getSelection().addRange(r); } };
  const uf = $("#userForm");
  if (uf) uf.onsubmit = async (e) => {
    e.preventDefault();
    const nom = uf.elements.nom.value.trim(), email = uf.elements.email.value.trim().toLowerCase(), role = uf.elements.role.value;
    const societes = [...uf.querySelectorAll('input[name="soc"]:checked')].map((x) => x.value);
    if (role === "responsable" && !societes.length) { toast("Cochez au moins une société pour un responsable."); return; }
    const btn = uf.querySelector('button[type="submit"]'); btn.disabled = true;
    const pwd = genMdp();
    try {
      const sec = S.sbCreation || (S.sbCreation = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "paie-creation" } }));
      const { data, error } = await sec.auth.signUp({ email, password: pwd });
      if (error) throw error;
      if (!data.user || (data.user.identities && data.user.identities.length === 0)) { const e3 = new Error("x"); e3.code = "deja"; throw e3; }
      const uid = data.user.id;
      await S.db.doc("users/" + uid).set({ nom, email, role, societes: role === "admin" ? [] : societes, creeLe: new Date().toISOString(), creePar: S.profil.uid });
      try { await sec.auth.signOut(); } catch {}
      S.creerUser = false; S.nouveauCompte = { email, pwd, confirmation: !data.session }; S.selUser = uid; render();
    } catch (e2) {
      btn.disabled = false;
      const m = e2.message || "";
      const msg = e2.code === "deja" || /already (been )?registered/i.test(m) ? "Cette adresse a déjà un compte. Si la personne avait été désactivée, réactivez-la dans la liste."
        : /signups? not allowed|disabled/i.test(m) ? "Les inscriptions sont désactivées dans Supabase : réactivez « Allow new users to sign up » (guide, étape 2)."
        : /email rate limit|over_email_send_rate_limit/i.test(m + " " + (e2.code || "")) ? "Supabase essaie d'envoyer un e-mail de confirmation et a atteint sa limite d'envoi. Désactivez « Confirm email » dans Supabase (Authentication > Sign In / Providers > Email), puis réessayez."
        : /rate limit/i.test(m) ? "Trop de créations rapprochées : réessayez dans quelques minutes."
        : /invalid/i.test(m) ? "Adresse e-mail invalide."
        : "Création impossible : " + (m || e2.code);
      toast(msg);
    }
  };
  const ue = $("#userEdit");
  if (ue) ue.onsubmit = async (e) => {
    e.preventDefault();
    const d = { nom: ue.elements.nom.value.trim(), societes: [...ue.querySelectorAll('input[name="soc"]:checked')].map((x) => x.value) };
    if (sel.uid !== S.profil.uid) d.role = ue.elements.role.value;
    try { await S.db.doc("users/" + sel.uid).update(d); toast("Compte mis à jour."); } catch (e2) { toast("Enregistrement refusé : " + (e2.message || e2.code)); }
  };
  if ($("#resetMdp")) $("#resetMdp").onclick = async () => {
    try { const { error } = await S.sb.auth.resetPasswordForEmail(sel.email, { redirectTo: location.origin + location.pathname }); if (error) throw error; toast("Lien envoyé à " + sel.email + "."); } catch (e2) { toast(/rate limit/i.test(e2.message || "") ? "Limite d'envoi d'e-mails atteinte : réessayez plus tard." : "Envoi impossible : " + (e2.message || e2.code)); }
  };
}

/* ---------- Connexion ---------- */
function ecran(html) {
  $("#ctx").hidden = true; $("#tabs").hidden = true; $("#userbox").hidden = true;
  $("#view").innerHTML = `<div class="login"><div class="panel">${html}</div></div>`;
}
function msgAuth(e) {
  const m = (e && e.message) || "";
  if (/invalid login credentials/i.test(m)) return "Adresse ou mot de passe incorrect.";
  if (/email not confirmed/i.test(m)) return "Adresse e-mail pas encore confirmée : cliquez sur le lien reçu par e-mail.";
  if (/already registered/i.test(m)) return "Cette adresse a déjà un compte : connectez-vous.";
  if (/password should be|at least/i.test(m)) return "Mot de passe trop court : 8 caractères minimum.";
  if (/rate limit/i.test(m)) return "Trop d'essais. Patientez quelques minutes.";
  if (/failed to fetch|network/i.test(m)) return "Pas de connexion internet, ou adresse Supabase incorrecte dans supabase-config.js.";
  return m || "Erreur inattendue.";
}
async function ecranConnexion() {
  let init = true;
  try { const { data, error } = await S.sb.rpc("base_initialisee"); if (error) throw error; init = !!data; }
  catch (e) {
    ecran(`<h2>Base non préparée</h2><p style="margin:0">Le site n'arrive pas à lire sa base de données. Vérifiez que le script <b>schema.sql</b> a bien été exécuté dans Supabase (guide, étape 3).</p><p class="small muted" style="margin:0">${esc(msgAuth(e))}</p>`);
    return;
  }
  if (!init) {
    ecran(`<h2>Créer le compte du gérant</h2>
      <p class="small muted" style="margin:0">Première ouverture du site : ce compte aura tous les droits. Faites-le maintenant, avant de communiquer l'adresse du site.</p>
      <form class="form one" id="bootForm">
        <label>Nom et prénom<input id="b_nom" required autocomplete="name"></label>
        <label>Adresse e-mail<input id="b_email" type="email" required autocomplete="email"></label>
        <label>Mot de passe (8 caractères minimum)<input id="b_pwd" type="password" minlength="8" required autocomplete="new-password"></label>
        <button class="primary" type="submit">Créer le compte</button>
      </form>`);
    $("#bootForm").onsubmit = async (e) => {
      e.preventDefault(); const btn = e.target.querySelector("button"); btn.disabled = true; S.boot = true;
      try {
        const email = $("#b_email").value.trim().toLowerCase(), password = $("#b_pwd").value;
        let { data, error } = await S.sb.auth.signUp({ email, password });
        if (error && /already registered/i.test(error.message)) ({ data, error } = await S.sb.auth.signInWithPassword({ email, password }));
        if (error) throw error;
        if (!data.session) { S.boot = false; btn.disabled = false; ecran(`<h2>Confirmez votre adresse</h2><p style="margin:0">Supabase vient d'envoyer un e-mail de confirmation à ${esc(email)}. Cliquez sur le lien, puis revenez ici et connectez-vous. Pour éviter cette étape à vos collaborateurs, désactivez « Confirm email » (guide, étape 2).</p><button id="reload" class="primary">J'ai confirmé</button>`); $("#reload").onclick = () => location.reload(); return; }
        const r = await S.sb.rpc("premier_admin", { p_nom: $("#b_nom").value.trim() });
        if (r.error) throw r.error;
        if (r.data !== true) toast("Un gérant existe déjà : ce compte n'a pas reçu de droits.");
        S.boot = false; demarrerSession(data.session.user);
      } catch (e2) { S.boot = false; btn.disabled = false; toast(msgAuth(e2)); }
    };
    return;
  }
  ecran(`<h2>Connexion</h2>
    <form class="form one" id="loginForm">
      <label>Adresse e-mail<input id="l_email" type="email" required autocomplete="username"></label>
      <label>Mot de passe<input id="l_pwd" type="password" required autocomplete="current-password"></label>
      <button class="primary" type="submit">Se connecter</button>
    </form>
    <button class="link" id="forgot" type="button">Mot de passe oublié ?</button>`);
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault(); const btn = e.target.querySelector("button"); btn.disabled = true;
    const { error } = await S.sb.auth.signInWithPassword({ email: $("#l_email").value.trim().toLowerCase(), password: $("#l_pwd").value });
    if (error) { btn.disabled = false; toast(msgAuth(error)); }
  };
  $("#forgot").onclick = async () => {
    const email = $("#l_email").value.trim();
    if (!email) { toast("Saisissez d'abord votre adresse e-mail."); $("#l_email").focus(); return; }
    const { error } = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    toast(error ? (/rate limit/i.test(error.message) ? "Limite d'envoi atteinte : demandez au gérant un mot de passe provisoire." : msgAuth(error)) : "Si un compte existe pour cette adresse, un lien vient d'être envoyé.");
  };
}
function ecranNouveauMdp(titre, apres) {
  ecran(`<h2>${esc(titre)}</h2>
    <form class="form one" id="pwdForm">
      <label>Nouveau mot de passe (8 caractères minimum)<input id="p1" type="password" minlength="8" required autocomplete="new-password"></label>
      <label>Confirmer<input id="p2" type="password" minlength="8" required autocomplete="new-password"></label>
      <div class="row"><button class="primary" type="submit">Enregistrer</button>${apres ? `<button type="button" id="pwdCancel">Annuler</button>` : ""}</div>
    </form>`);
  if ($("#pwdCancel")) $("#pwdCancel").onclick = apres;
  $("#pwdForm").onsubmit = async (e) => {
    e.preventDefault();
    if ($("#p1").value !== $("#p2").value) { toast("Les deux mots de passe ne sont pas identiques."); return; }
    const { error } = await S.sb.auth.updateUser({ password: $("#p1").value });
    if (error) { toast(msgAuth(error)); return; }
    toast("Mot de passe enregistré.");
    const { data } = await S.sb.auth.getSession();
    S.profil = null; S.sessionUid = null;
    if (data.session) demarrerSession(data.session.user); else ecranConnexion();
  };
}

function arreterAbonnements() {
  S.unsub.forEach((f) => f()); S.unsub = [];
  (S.unsubSess || []).forEach((f) => f()); S.unsubSess = [];
}
function sortir() { arreterAbonnements(); S.profil = null; S.admin = false; S.sessionUid = null; S.socs = []; S.salaries = []; S.soc = null; S.sb.auth.signOut(); }
async function demarrerSession(u) {
  if (S.sessionUid === u.id && S.profil) return;
  S.sessionUid = u.id;
  let p;
  try { p = await S.db.doc("users/" + u.id).get(); }
  catch (e) { ecran(`<h2>Accès impossible</h2><p style="margin:0">Le profil de ce compte n'a pas pu être lu. Vérifiez que le script schema.sql a été exécuté (guide, étape 3).</p><button id="out">Se déconnecter</button>`); $("#out").onclick = sortir; return; }
  if (!p.exists) {
    let init = true; try { const r = await S.sb.rpc("base_initialisee"); init = r.error ? true : !!r.data; } catch {}
    if (!init) {
      ecran(`<h2>Finaliser le compte du gérant</h2><p style="margin:0">Votre compte ${esc(u.email)} est créé. Il reste à lui donner les droits de gérant.</p>
        <form class="form one" id="claimForm"><label>Nom et prénom<input id="c_nom" required autocomplete="name"></label><button class="primary" type="submit">Devenir gérant</button></form>`);
      $("#claimForm").onsubmit = async (e) => {
        e.preventDefault(); const r = await S.sb.rpc("premier_admin", { p_nom: $("#c_nom").value.trim() });
        if (r.error || r.data !== true) { toast(r.error ? msgAuth(r.error) : "Un gérant existe déjà."); return; }
        S.sessionUid = null; demarrerSession(u);
      };
      return;
    }
  }
  if (!p.exists || p.data().role === "inactif") {
    ecran(`<h2>Accès non activé</h2><p style="margin:0">Le compte ${esc(u.email)} n'a pas d'accès à la paie. Demandez au gérant de l'activer.</p><button id="out">Se déconnecter</button>`);
    $("#out").onclick = sortir; return;
  }
  arreterAbonnements();
  S.profil = { uid: u.id, ...p.data() }; S.admin = S.profil.role === "admin";
  S.tab = S.admin ? (store.get("paie.tab") || "bulletins") : "saisie";
  $("#ctx").hidden = false; $("#tabs").hidden = false; $("#userbox").hidden = false;
  $("#who").textContent = `${S.profil.nom || u.email} · ${S.admin ? "Gérant" : "Responsable"}`;
  renderTabs(); $("#view").innerHTML = `<div class="empty">Chargement…</div>`;
  const majSocs = () => {
    S.socs.sort((a, b) => (a.ordre ?? 9) - (b.ordre ?? 9) || (a.nom || "").localeCompare(b.nom || ""));
    const saved = store.get("paie.soc"); const prev = S.soc;
    S.soc = S.socs.find((x) => x.id === prev) ? prev : (S.socs.find((x) => x.id === saved) ? saved : (S.socs[0] && S.socs[0].id));
    $("#selSoc").innerHTML = S.socs.map((x) => `<option value="${esc(x.id)}" ${x.id === S.soc ? "selected" : ""}>${esc(x.nom)}</option>`).join("");
    if (S.soc !== prev) resub(); else render();
  };
  S.unsubSess = [];
  if (S.admin) {
    S.unsubSess.push(S.db.collection("societes").onSnapshot((q) => { S.socs = q.docs.map((d) => ({ id: d.id, ...d.data() })); majSocs(); }, err));
    S.unsubSess.push(S.db.collection("users").onSnapshot((q) => { S.users = q.docs.map((d) => ({ uid: d.id, ...d.data() })); if (S.tab === "equipe") render(); }, err));
  } else {
    const ids = S.profil.societes || []; const map = {};
    if (!ids.length) { S.socs = []; render(); }
    ids.forEach((id) => S.unsubSess.push(S.db.doc("societes/" + id).onSnapshot((d) => { if (d.exists) map[id] = { id, ...d.data() }; else delete map[id]; S.socs = Object.values(map); majSocs(); }, err)));
  }
}

/* ---------- Démarrage ---------- */
$("#selSoc").onchange = (e) => { S.soc = e.target.value; store.set("paie.soc", S.soc); resub(); };
$("#selMois").onchange = (e) => { if (!e.target.value) return; S.mois = e.target.value; store.set("paie.mois", S.mois); resub(); };
$("#logout").onclick = sortir;
$("#monMdp").onclick = () => ecranNouveauMdp("Changer mon mot de passe", () => { S.profil = null; S.sessionUid = null; S.sb.auth.getSession().then(({ data }) => data.session ? demarrerSession(data.session.user) : ecranConnexion()); });
if (!window.supabase || !window.SUPABASE_URL || /REMPLACER/.test(window.SUPABASE_URL + window.SUPABASE_ANON_KEY)) {
  ecran(`<h2>Site non configuré</h2><p style="margin:0">Le site n'est pas encore relié à sa base de données. Complétez le fichier <b>supabase-config.js</b> (guide, étape 4).</p>`);
} else {
  S.sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  S.db = SUPADB.create(S.sb);
  let recuperation = false;
  S.sb.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") { recuperation = true; ecranNouveauMdp("Choisir un nouveau mot de passe"); return; }
      if (recuperation && event !== "USER_UPDATED" && event !== "SIGNED_OUT") return;
      if (event === "USER_UPDATED") { recuperation = false; return; }
      if (event === "TOKEN_REFRESHED") return;
      if (!session) { arreterAbonnements(); S.profil = null; S.admin = false; S.sessionUid = null; S.socs = []; S.salaries = []; S.soc = null; ecranConnexion(); return; }
      if (!S.boot) demarrerSession(session.user);
    }, 0);
  });
}

})();
