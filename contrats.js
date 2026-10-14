/* ===== Modèles de contrats et d'avenants (repris des contrats SNDRR existants) ===== */
const CONTRATS = (() => {
  const fd = (d) => (d ? d.split("-").reverse().join("/") : "……/……/……");
  const F = (x) => Math.round(Number(x) || 0).toLocaleString("fr-FR").replace(/ | /g, " ");
  const hm = (h) => { const m = Math.round(Number(h) * 60); const H = Math.floor(m / 60), mn = m % 60; return mn ? `${H} heures et ${mn} minutes` : `${H} heures`; };
  const ROMAINS = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII" };

  const T = (text, b) => ({ text, b: !!b });
  const P = (...runs) => ({ t: "p", runs: runs.map((r) => (typeof r === "string" ? T(r) : r)) });
  const LI = (text) => ({ t: "li", runs: [T(text)] });
  const H = (text) => ({ t: "h", runs: [T(text, true)] });
  const TITLE = (...lines) => ({ t: "title", lines });
  const RIGHT = (text) => ({ t: "right", runs: [T(text)] });

  // Désignation de la société et du salarié
  function parties(soc, s) {
    const madame = (s.civ || "").toLowerCase().startsWith("mme");
    const civ = madame ? "Madame" : "Monsieur";
    const ne = madame ? "Née" : "Né";
    const imm = madame ? "Immatriculée" : "Immatriculé";
    const out = [P("Entre les soussignés :"),
      P(T(`La société ${soc.nom.replace(/^SARL |^SAS /, "")},`, true)),
      P(`${soc.forme || "S.A.R.L."} au capital de ${soc.capital || "……"} F.CFP,`),
      P(`Dont le siège social est situé ${(soc.adresse || "").replace(/\n/g, ", ")},`),
      P(`Immatriculée au RCS de Nouméa sous le numéro ${soc.ridet || "……"},`),
      P(`Dont le code NAF est ${soc.ape || "5610C"},`),
      P(`Et dont les cotisations sociales sont versées à la CAFAT sous le numéro ${soc.cafat || "……"},`)];
    if (soc.humanis) out.push(P(`Et à HUMANIS/CRE sous le numéro ${soc.humanis},`));
    out.push(P(`Représentée par ${soc.representant || "Monsieur RODRIGUEZ Alexandre"},`), P(`Agissant en qualité de ${soc.qualiteRep || "gérant"},`), RIGHT("d'une part,"),
      P(T(`${civ} ${s.prenom} ${s.nom},`, true)),
      P(`Demeurant ${(s.adresse || "à Nouméa").replace(/\n/g, ", ")},`),
      P(`${ne} le ${fd(s.naissance)} à ${s.lieuNaissance || "……"},`),
      P(`De nationalité ${s.nationalite || "française"},`),
      P(`${imm} à la CAFAT sous le numéro ${s.cafat || "EN COURS"},`), RIGHT("d'autre part."),
      P("Il a été convenu et arrêté ce qui suit :"));
    return { out, civ, nomC: `${civ} ${s.nom} ${s.prenom}`, il: madame ? "elle" : "il", Il: madame ? "Elle" : "Il", le: madame ? "la" : "le", e: madame ? "e" : "", salarie: madame ? "la salariée" : "le salarié", Salarie: madame ? "La salariée" : "Le salarié" };
  }

  function signatures(soc, s, g, date) {
    return [P(`Fait à Nouméa, en double exemplaire`), P(`Le ${fd(date)}`),
      { t: "sig", left: [`${g.Salarie} (1)`, `${g.civ} ${s.nom} ${s.prenom}`], right: ["L'employeur (1)", soc.representant || "Monsieur RODRIGUEZ Alexandre"] },
      P(T('(1) Faire précéder la signature de la mention manuscrite "Lu et Approuvé"'))];
  }

  // Articles communs
  const A = {
    cp: (n, g, soc, cdd) => [H(`Article ${n} - Congés payés`), P(`${g.nomC} aura droit aux congés payés prévus par le Code du Travail et par la convention collective des ${soc.convention || "Hôtels, Bars, Cafés, Restaurants"} applicable dans la société.`), ...(cdd ? [P("À l'issue du présent contrat, les congés non pris donneront lieu au versement d'une indemnité compensatrice de congés payés.")] : [])],
    absences: (n, g) => [H(`Article ${n} - Absences`), P(`${g.nomC} est tenu${g.e} de prévenir immédiatement la société de toute absence pour maladie ou accident. ${g.Il} devra fournir un certificat médical justifiant son absence dans les 48 heures.`), P(`En cas de prolongation d'arrêt de travail, ${g.nomC} devra transmettre dans les mêmes délais le certificat médical justifiant cette prolongation.`)],
    obligations: (n, g) => [H(`Article ${n} - Obligations`), P(`${g.nomC} s'engage, pendant et après la durée du présent contrat, à observer la plus grande discrétion sur toutes les informations, connaissances et techniques qu'${g.il} aurait connues à l'occasion de son travail dans la société.`), P(`${g.Il} s'engage expressément :`),
      LI("À respecter le règlement intérieur de l'entreprise ;"), LI("À respecter les instructions qui pourront lui être données par la société et à se conformer aux règles régissant le bon fonctionnement de cette société ;"),
      LI("À porter pendant les heures de travail la tenue vestimentaire fournie par la société ;"),
      LI("À conserver, pendant la durée et après l'expiration du présent contrat, de la façon la plus stricte, la discrétion la plus absolue sur l'ensemble des renseignements qu'il pourra recueillir à l'occasion de ses fonctions ou du fait de sa présence dans la société, le non-respect de cette obligation constituant une faute grave justifiant le licenciement immédiat ;"),
      LI("À suivre toute formation qui pourrait lui être demandée dans le cadre de l'accomplissement de ses fonctions ;"), LI("À faire connaître sans délai tous changements qui interviendraient dans sa situation personnelle ;"),
      LI("À dispenser éventuellement et dans la mesure de ses possibilités toute formation à du personnel de la société moins qualifié."),
      P(`${g.Il} devra se soumettre aux visites médicales auxquelles ${g.il} sera convoqué${g.e}.`)],
    tempsPlein: (n, g) => [H(`Article ${n} - Passage à temps plein`), P(`${g.nomC} bénéficiera s'${g.il === "il" ? "il" : "elle"} le souhaite d'une priorité pour l'attribution d'un emploi à temps plein de sa catégorie professionnelle ou d'un emploi équivalent qui serait créé ou qui deviendrait vacant. La liste de ces emplois lui sera communiquée préalablement à leur attribution à d'autres salariés. Au cas où ${g.nomC} ferait acte de sa candidature à un tel emploi, sa demande sera examinée et une réponse motivée lui sera faite dans un délai de 8 jours.`)],
    exclusivite: (n, g) => [H(`Article ${n} - Exclusivité`), P(`${g.nomC} consacrera tout son temps à la société et s'interdit d'exercer toute autre activité professionnelle quelle qu'elle soit, sans en avoir préalablement obtenu, par écrit, l'autorisation de la direction, et ceci aussi longtemps que durera le présent contrat.`)],
    rupture: (n, g) => [H(`Article ${n} - Rupture du contrat de travail`), P(`${g.nomC} et la société peuvent l'un et l'autre rompre à tout moment le contrat de travail, en respectant toutefois les dispositions légales et conventionnelles en vigueur.`)],
    uniforme: (n) => [H(`Article ${n} - Port de l'uniforme`), P("L'exercice de la fonction entraîne l'obligation formelle du port de l'uniforme pendant toute la durée du service. L'uniforme professionnel étant représentatif de l'entreprise, le salarié ne doit en aucun cas le porter en dehors des heures de service."), P("Toutes les parties de l'uniforme, y compris les attributs spécifiques, les insignes, etc., qui sont propriété de l'entreprise, doivent être obligatoirement restituées au terme du contrat de travail sans qu'il soit besoin ni d'une demande préalable, ni d'une mise en demeure.")],
    polyvalence: (n) => [H(`Article ${n} - Clause de polyvalence`), P("À la demande expresse de son supérieur hiérarchique et pour une durée temporaire, le salarié sera tenu d'exécuter les prestations mentionnées aux catégories et échelons inférieurs ou égaux à sa classification."), P("Pendant l'exécution de ces prestations, le salarié continuera à percevoir la rémunération correspondant à sa classification.")],
    cameras: (n, soc) => [H(`Article ${n} - Caméras de surveillance`), P("Afin de préserver les intérêts de la société ainsi que ceux du personnel, la Direction a installé des caméras de surveillance dans les lieux suivants :"), ...((soc.cameras || "Restaurant / Salle\nCaisses").split("\n").filter(Boolean).map((x) => LI(x))),
      P("Ces mesures s'expliquent par la nécessité de prévenir tout risque d'agression des membres du personnel par des individus s'étant introduits dans le magasin ainsi que tout risque de détournement de marchandises ou d'espèces. Conformément à la loi :"),
      LI("Aucune caméra ne sera installée dans les lieux de pause, dans les locaux des représentants du personnel, ni dans les bureaux des collaborateurs qui ne doivent pas manier des espèces ou des stocks de marchandises ;"), LI("Les enregistrements ne pourront être consultés que par des personnes spécialement habilitées et ils ne seront pas conservés pendant plus d'un mois.")],
    materiel: (n, g) => [H(`Article ${n} - Restitution et usage du matériel de l'entreprise`), P(`Le matériel que la société sera amenée à confier à ${g.nomC} pour l'exécution de sa mission demeurera la propriété exclusive de la société et devra lui être restitué sur simple demande.`), P(`${g.nomC} s'interdit de donner à ce matériel un usage autre que professionnel et s'engage expressément à le restituer le jour même où ${g.il} cessera ses fonctions, pour quelque cause que ce soit, sans qu'il soit besoin d'une demande ou d'une mise en demeure préalable de la société.`)],
    sociaux: (n, g) => [H(`Article ${n} - Avantages sociaux`), P(`${g.nomC} bénéficiera des lois sociales instituées en faveur des salariés, notamment en matière de sécurité sociale (CAFAT) et de retraite (HUMANIS/CRE).`)],
    errones: (n) => [H(`Article ${n} - Communication par le salarié de renseignements erronés`), P("La communication de renseignements erronés par le salarié concernant la citoyenneté, la durée de résidence, les qualifications et compétences professionnelles constitue un motif de licenciement réel et sérieux à effet immédiat, sans indemnités de rupture conformément aux dispositions du code du travail (articles Lp 451-15, Lp 451-16 et R451-11).")],
    donnees: (n) => [H(`Article ${n} - Informations sur vos données personnelles et leur protection`), P("Dans le cadre du présent contrat et de notre relation de travail, certaines données personnelles vous concernant vous sont demandées et sont collectées pour permettre le traitement des opérations sociales incombant à l'entreprise. Seules les données indispensables à ce traitement sont collectées, selon les modalités suivantes :"),
      LI("Données collectées : vos noms, prénoms, date et lieu de naissance, numéro de CAFAT, votre nationalité, l'état civil de vos ayants droit, vos diplômes, votre parcours professionnel, votre adresse, vos coordonnées bancaires, votre classification, vos données salariales, vos arrêts maladie, accidents du travail, congés maternité et toutes les absences à votre poste de travail."),
      LI("Finalité des données collectées : établir le contrat de travail et ses avenants, établir les bulletins de paie, virer le salaire, affiliation aux caisses sociales (CAFAT, AGIRC ARRCO, CEG et CET, Mutuelle), réalisation des déclarations aux organismes sociaux et fiscaux, création et configuration de l'équipement informatique mis à votre disposition dans le cadre de vos fonctions."),
      LI("Destinataires des données : les personnes habilitées du service du personnel, les organismes sociaux et le prestataire paie extérieur à notre société."),
      LI("Durée de conservation : vos données à caractère personnel sont uniquement conservées pendant la durée de votre contrat de travail et 5 ans après la rupture de celui-ci afin de satisfaire à la prescription salariale quinquennale, et sous réserve de l'application d'autres lois en vigueur qui rendrait légitime leur conservation au-delà de ces délais (notamment pour justifier vos droits à retraite)."),
      P("Vous pouvez accéder aux données vous concernant ou demander leur effacement. Vous disposez également d'un droit d'opposition, d'un droit de rectification et d'un droit à la limitation du traitement de vos données. Pour exercer ces droits ou pour toute question sur le traitement de vos données, vous pouvez vous adresser à la direction.")],
    dispositions: (n, soc) => [H(`Article ${n} - Dispositions spécifiques`), P(`Pour tout ce qui n'est pas prévu au présent contrat, les parties conviennent de s'en référer aux dispositions conventionnelles des ${soc.convention || "Hôtels, Bars, Cafés, Restaurants"} applicables à l'entreprise.`)],
  };

  // Limite des heures complémentaires : un tiers de la durée du contrat, sans atteindre plus de 39 h
  function limiteHC(hebdo) { return Math.min(39, Math.floor(hebdo * 4 / 3 * 3) / 3); }
  function hebdoTxt(h) { const m = Math.round(h * 60); return m % 60 ? `${Math.floor(m / 60)} heures et ${m % 60} minutes` : `${m / 60} heures`; }

  /* p : { type: "CDI"|"CDD", hebdo, heuresMois, salaire, emploi, categorie, debut, fin, motif, motifDetail, essaiJours, cddPrecedent:{debut,fin}, ancienneteDepuis, miseADisposition, signature } */
  function contrat(soc, s, p) {
    const g = parties(soc, s); const court = soc.nom.replace(/^SARL |^SAS /, ""); const partiel = Number(p.hebdo) < 39; const cdd = p.type === "CDD";
    const titre = [`CONTRAT DE TRAVAIL A DUREE ${cdd ? "DETERMINEE" : "INDETERMINEE"}`, partiel ? "A TEMPS PARTIEL" : "A TEMPS COMPLET"];
    const B = [TITLE(...titre), ...g.out]; let n = 1;
    // 1 Engagement
    const eng = [H(`Article ${n++} - Engagement`)];
    if (!cdd && p.cddPrecedent && p.cddPrecedent.debut) eng.push(P(`${g.nomC} a été engagé${g.e} par contrat à durée déterminée en qualité d'${p.emploi.toLowerCase()}, à compter du ${fd(p.cddPrecedent.debut)} et jusqu'au ${fd(p.cddPrecedent.fin)}.`));
    eng.push(P(`La société ${court} engage, sous réserve des résultats de la visite médicale, ${g.nomC} pour y exercer les fonctions d'${p.emploi.toLowerCase()} à compter du ${fd(p.debut)}${cdd ? "" : " sous la forme d'un contrat à durée indéterminée"}.`));
    if (!cdd && p.ancienneteDepuis && p.ancienneteDepuis !== p.debut) eng.push(P(`Son ancienneté dans l'entreprise sera calculée à compter du ${fd(p.ancienneteDepuis)}, comme il est dit à l'article Lp. 123-17 du Code du Travail.`));
    eng.push(P(`Cette qualification correspond à la catégorie ${ROMAINS[p.categorie] || p.categorie}, prévue par la convention collective des ${soc.convention || "Hôtels, Bars, Cafés, Restaurants"}.`));
    if (p.lieu) eng.push(P(`${g.nomC} exercera ses fonctions à titre habituel au sein de l'établissement situé ${p.lieu}, qui constitue son lieu de travail principal.`));
    if (p.miseADisposition) eng.push(P(`Compte tenu du caractère polyvalent de ses fonctions, ${g.nomC} pourra être amené${g.e} à exercer temporairement ses fonctions, en renfort, au sein de l'établissement exploité sous la même enseigne par ${p.miseADisposition}. Ces affectations temporaires n'emportent aucune modification du présent contrat. Elles feront l'objet d'une convention de mise à disposition à but non lucratif conclue entre les deux sociétés, dans les conditions prévues aux articles Lp. 124-1 et suivants du Code du travail de la Nouvelle-Calédonie. Pendant ces périodes, ${g.nomC} demeure salarié${g.e} de la société et conserve sa rémunération, sa qualification et son ancienneté.`));
    eng.push(P("Le détail de ses attributions lui sera notifié par instructions du responsable de la société ou de toute personne ayant reçu délégation pour ce faire."));
    B.push(...eng);
    // CDD : objet et durée
    if (cdd) {
      const motifs = { surcroit: "faire face à un surcroît temporaire d'activité", remplacement: `assurer le remplacement de ${p.motifDetail || "……"}, salarié(e) absent(e)`, saisonnier: "pourvoir un emploi à caractère saisonnier" };
      B.push(H(`Article ${n++} - Objet et durée du contrat`), P(`Ce contrat est expressément établi pour ${motifs[p.motif] || motifs.surcroit}${p.motif === "surcroit" && p.motifDetail ? ", " + p.motifDetail : ""}.`), P(`Il est conclu pour la période du ${fd(p.debut)} au ${fd(p.fin)} au soir.`));
    }
    // Rémunération
    B.push(H(`Article ${n++} - Rémunération`), P(`En contrepartie de l'exercice de sa mission, et pour une moyenne de ${hm(p.heuresMois)} de travail effectif par mois, ${g.nomC} percevra une rémunération mensuelle brute de ${F(p.salaire)} F.CFP.`));
    if (p.netConvenu) B.push(P(`Cette rémunération brute correspond à un salaire net mensuel convenu de ${F(p.netConvenu)} F.CFP avant primes et avantages.`));
    if (cdd) B.push(P(`À l'issue de la relation contractuelle, ${g.nomC} percevra, en outre, les indemnités légales de congés payés et de précarité dans les conditions déterminées aux articles Lp. 123-7 et Lp. 123-14 du Code du travail.`));
    // Période d'essai
    B.push(H(`Article ${n++} - Période d'essai`));
    if (Number(p.essaiJours) > 0) B.push(P(`Le présent contrat ne prendra effet définitivement qu'à l'issue d'une période d'essai de ${p.essaiJours} jour${p.essaiJours > 1 ? "s" : ""}, qui expirera le ${fd(p.finEssai)} au soir.`), P("Pendant la période d'essai, les deux parties pourront rompre le contrat sans indemnité ni préavis, par le simple envoi d'une lettre."));
    else B.push(P("Le présent contrat est conclu sans période d'essai."));
    // Durée du travail
    B.push(H(`Article ${n++} - Durée du travail`), P(`La durée hebdomadaire (du lundi au dimanche) de travail de ${g.nomC} est de ${hebdoTxt(Number(p.hebdo))}, effectuées selon l'horaire en vigueur dans la société et fixées par son supérieur hiérarchique, qui se réserve le droit de les modifier en fonction des nécessités de la société, ce qui est accepté par avance par ${g.salarie}.`));
    if (partiel) B.push(P("L'employeur se réserve le droit de modifier la répartition des horaires et jours de travail initialement prévue en cas d'urgence ou de raisons impérieuses de service. " + `${g.Salarie} s'engage à accepter toute modification qui n'aurait pas pour effet de contrevenir aux dispositions impératives des textes légaux ou conventionnels.`), P(`Le cas échéant, des heures complémentaires, au-delà de ${hebdoTxt(Number(p.hebdo))} par semaine, dans la limite de ${hebdoTxt(limiteHC(Number(p.hebdo)))} de travail effectif, pourront être demandées à ${g.nomC}, en fonction des nécessités de la société et dans le cadre des dispositions légales et conventionnelles.`));
    else B.push(P(`Le cas échéant, des heures supplémentaires pourront être demandées à ${g.nomC} en fonction des nécessités de la société et dans le cadre des dispositions légales et conventionnelles.`));
    B.push(P(`${g.Salarie} est informé${g.e} qu'exerçant dans une activité de restauration rapide, ${g.il} pourra être amené${g.e} à travailler les week-ends et les jours fériés selon un planning défini par son supérieur hiérarchique.`));
    B.push(...A.cp(n++, g, soc, cdd), ...A.absences(n++, g), ...A.obligations(n++, g));
    if (partiel) B.push(...A.tempsPlein(n++, g)); else B.push(...A.exclusivite(n++, g));
    if (!cdd) B.push(...A.rupture(n++, g));
    B.push(...A.uniforme(n++), ...A.polyvalence(n++), ...A.cameras(n++, soc), ...A.materiel(n++, g), ...A.sociaux(n++, g), ...A.errones(n++), ...A.donnees(n++), ...A.dispositions(n++, soc));
    B.push(...signatures(soc, s, g, p.signature));
    return B;
  }

  /* Avenants. p.sous : "duree" | "renouvellement" | "promotion" | "remuneration" | "libre" */
  function avenant(soc, s, p) {
    const g = parties(soc, s);
    const B = [TITLE(`AVENANT N°${p.numero || 1}`, p.sous === "renouvellement" ? "AU CONTRAT DE TRAVAIL A DUREE DETERMINEE" : `AU CONTRAT DE TRAVAIL A DUREE ${s.contrat === "CDD" ? "DETERMINEE" : "INDETERMINEE"}`), ...g.out];
    const effet = fd(p.effet);
    if (p.sous === "renouvellement") {
      B.push(P(T(`Le présent avenant a pour objet le renouvellement du contrat à durée déterminée conclu le ${fd(p.dateContrat)} pour la période du ${fd(s.entree)} au ${fd(p.ancienTerme)}.`, true)),
        H("Article 1 - Renouvellement"), P(`Le contrat à durée déterminée de ${g.nomC}, conclu pour ${p.motifTxt || "faire face à un surcroît temporaire d'activité"}, est renouvelé pour une durée allant du ${fd(addDay(p.ancienTerme))} au ${fd(p.nouveauTerme)} au soir.`),
        P("Ce renouvellement est conclu avant le terme initialement prévu, conformément aux dispositions du Code du travail de la Nouvelle-Calédonie relatives au renouvellement du contrat à durée déterminée."),
        H("Article 2 - Autres dispositions"), P("Les autres clauses du contrat initial restent inchangées."));
    } else if (p.sous === "duree") {
      B.push(P(T(`Le présent avenant est expressément établi pour modifier la durée du travail et la rémunération à compter du ${effet}.`, true)),
        H("Article 1 - Durée du travail"), P(`À compter du ${effet}, la durée hebdomadaire de travail de ${g.nomC} est de ${hebdoTxt(Number(p.hebdo))}, effectuées selon l'horaire en vigueur dans la société.`),
        Number(p.hebdo) < 39 ? P(`Le cas échéant, des heures complémentaires, au-delà de ${hebdoTxt(Number(p.hebdo))} par semaine, dans la limite de ${hebdoTxt(limiteHC(Number(p.hebdo)))} de travail effectif, pourront être demandées en fonction des nécessités de la société.`) : P(`Le cas échéant, des heures supplémentaires pourront être demandées à ${g.nomC} en fonction des nécessités de la société et dans le cadre des dispositions légales et conventionnelles.`),
        H("Article 2 - Rémunération"), P(`À compter du ${effet}, en contrepartie de l'exercice de sa mission et pour une moyenne de ${hm(p.heuresMois)} de travail effectif par mois, ${g.nomC} percevra un salaire mensuel brut de ${F(p.salaire)} F.CFP.`),
        ...(Number(p.hebdo) >= 39 ? [P("L'article relatif au passage à temps plein est supprimé.")] : []), P("Les autres articles restent inchangés."));
    } else if (p.sous === "promotion") {
      B.push(P(T(`Le présent avenant a pour objet la promotion de ${g.nomC} au poste d'${p.emploi.toLowerCase()} à compter du ${effet}.`, true)),
        H("Article 1 - Fonction et classification"), P(`À compter du ${effet}, ${g.nomC} exercera les fonctions d'${p.emploi.toLowerCase()}. Cette qualification correspond à la catégorie ${ROMAINS[p.categorie] || p.categorie}, prévue par la convention collective des ${soc.convention || "Hôtels, Bars, Cafés, Restaurants"}.`),
        H("Article 2 - Rémunération"), P(`À compter du ${effet}, en contrepartie de l'exercice de sa mission et pour une moyenne de ${hm(p.heuresMois)} de travail effectif par mois, ${g.nomC} percevra une rémunération mensuelle brute de ${F(p.salaire)} F.CFP.`));
      if (Number(p.probatoireMois) > 0) B.push(H("Article 3 - Période probatoire"), P(`En raison de la spécificité et des responsabilités que requiert cette fonction, les parties conviennent d'une période probatoire de ${p.probatoireMois} mois, du ${effet} au ${fd(p.finProbatoire)}.`), P(`À tout moment, chaque partie pourra mettre un terme à la période probatoire, sans indemnité. En cas de rupture de la période probatoire, ${g.nomC} retrouvera sa situation antérieure : ${s.emploi || "……"}, ${s.qualif || "……"}, rémunération de ${F(s.base)} F.CFP brut.`), P("À l'issue de la période probatoire, un entretien aura lieu entre les parties. À défaut de rupture, la promotion sera définitive."));
      B.push(H(`Article ${Number(p.probatoireMois) > 0 ? 4 : 3} - Autres dispositions`), P("Les autres articles du contrat restent inchangés."));
    } else if (p.sous === "remuneration") {
      B.push(P(T(`Le présent avenant est expressément établi pour modifier la rémunération à compter du ${effet}.`, true)),
        H("Article 1 - Rémunération"), P(`À compter du ${effet}, en contrepartie de l'exercice de sa mission et pour une moyenne de ${hm(p.heuresMois)} de travail effectif par mois, ${g.nomC} percevra une rémunération mensuelle brute de ${F(p.salaire)} F.CFP${p.netConvenu ? `, correspondant à un salaire net mensuel convenu de ${F(p.netConvenu)} F.CFP avant primes et avantages` : ""}.`),
        ...(p.texteLibre ? [P(p.texteLibre)] : []), H("Article 2 - Autres dispositions"), P("Les autres articles du contrat restent inchangés."));
    } else {
      B.push(P(T(`Le présent avenant prend effet à compter du ${effet}.`, true)), H("Article 1 - Modification"), ...String(p.texteLibre || "……").split("\n").filter(Boolean).map((x) => P(x)), H("Article 2 - Autres dispositions"), P("Les autres articles du contrat restent inchangés."));
    }
    B.push(...signatures(soc, s, g, p.signature));
    return B;
  }
  function addDay(d) { if (!d) return d; const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }

  // Vérifications avant édition
  function controles(soc, s, p) {
    const w = []; const smg = Number(soc.smg) || 1000.08;
    if (p.salaire && p.heuresMois && Number(p.salaire) < Math.round(p.heuresMois * smg) - 1) w.push(`Salaire inférieur au SMG : minimum ${F(Math.round(p.heuresMois * smg))} F pour ${hm(p.heuresMois)}.`);
    if (!s.naissance || !s.lieuNaissance) w.push("Date ou lieu de naissance manquant dans la fiche salarié.");
    if (!s.cafat) w.push("N° CAFAT manquant : le contrat indiquera « EN COURS ».");
    if (p.type === "CDD" && p.fin && p.debut && p.fin < p.debut) w.push("La date de fin du CDD est antérieure à la date de début.");
    if (p.type === "CDD" && p.motif === "remplacement" && !p.motifDetail) w.push("Indiquez le nom de la personne remplacée : c'est une mention obligatoire.");
    if (p.sous === "renouvellement" && p.ancienTerme && p.signature && p.signature > p.ancienTerme) w.push("L'avenant de renouvellement doit être signé avant le terme du CDD : après le terme, le contrat est devenu un CDI.");
    if (p.type === "CDD" && Number(p.hebdo) && p.debut && p.fin) { const sem = (new Date(p.fin) - new Date(p.debut)) / 86400000 / 7; if (Number(p.essaiJours) > Math.ceil(sem)) w.push("Période d'essai trop longue : un jour par semaine de contrat au maximum."); }
    if (!soc.capital) w.push("Capital social manquant dans les paramètres de la société.");
    return w;
  }

  return { contrat, avenant, controles, limiteHC, fd };
})();

