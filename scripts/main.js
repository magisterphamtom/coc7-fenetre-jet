/**
 * CoC7 — Fenêtre de jet thématique (2.0)
 * Remplace la présentation de la fenêtre de jet de CoC7 (« bonus-selection ») :
 * en-tête avec la valeur, tuiles de difficulté avec leur seuil, dés bonus / malus en crans,
 * chances de réussite exactes en direct. Les champs d'origine de CoC7 restent dans le formulaire
 * (cachés) et sont tenus à jour : CoC7 lit ses propres valeurs, rien n'est modifié dans le système.
 */
const ID = "coc7-fenetre-jet";
const DELAI = 8000; // ms : un clic ou une demande de jet plus vieux est ignoré

const esc = (t) => foundry.utils.escapeHTML(String(t ?? ""));
const t = (k) => game.i18n.localize(`C7FJ.${k}`);

/* ------------------------------------------------------------------ */
/*  Qui lance quoi ?                                                   */
/* ------------------------------------------------------------------ */

let dernierClic = null;   // dernier clic sur une fiche d'acteur
let derniereDemande = null; // dernière demande reçue par la fenêtre de CoC7

/** Clic sur une fiche : même repérage que CoC7 (.attribute, .skill, .item). */
document.addEventListener("click", (ev) => {
  const appEl = ev.target.closest?.(".application, .app");
  if (!appEl) return;
  const app = foundry.applications.instances?.get(appEl.id) ?? globalThis.ui?.windows?.[appEl.dataset?.appid];
  const doc = app?.document ?? app?.actor;
  if (doc?.documentName !== "Actor") return;
  const attr = ev.target.closest(".attribute");
  const item = ev.target.closest(".skill[data-item-uuid], .item[data-item-uuid], [data-item-uuid]");
  dernierClic = {
    actorUuid: doc.uuid,
    characteristic: attr?.dataset.characteristic,
    attribute: attr?.dataset.attrib,
    itemUuid: item?.dataset.itemUuid,
    t: Date.now()
  };
}, true);

/**
 * La fenêtre de CoC7 (CoC7RollDialog) n'est pas exposée par le système. On la reconnaît au premier
 * passage dans DialogV2.prompt, puis on enveloppe sa méthode create pour lire la demande complète
 * (acteur, compétence ou caractéristique, nom affiché) aux jets suivants.
 */
Hooks.once("init", () => {
  const D = foundry.applications.api.DialogV2;
  const prompt = D.prompt;
  D.prompt = function (options = {}) {
    if (this?.name === "CoC7RollDialog" && !this._c7fj) {
      this._c7fj = true;
      const create = this.create;
      this.create = function (config = {}) {
        derniereDemande = { ...config, t: Date.now() };
        return create.call(this, config);
      };
    }
    return prompt.call(this, options);
  };
});

const recent = (x) => x && Date.now() - x.t < DELAI;

/** Valeur de la compétence d'une arme (CoC7 : skill.main.id ou nom). */
function valeurArme(acteur, arme) {
  const sk = arme.system?.skill?.main ?? {};
  const comp = (sk.id && acteur?.items.get(sk.id))
    ?? acteur?.items.find((i) => i.type === "skill" && sk.name && i.name === sk.name);
  return comp?.system?.value ?? null;
}

function depuisObjet(item) {
  if (!item) return null;
  const acteur = item.actor ?? item.parent;
  if (item.type === "skill") return { valeur: item.system?.value ?? null, img: item.img, titre: item.name, acteur };
  if (item.type === "weapon") return { valeur: valeurArme(acteur, item), img: item.img, titre: item.name, acteur };
  return { valeur: null, img: item.img, titre: item.name, acteur };
}

function sync(uuid) { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } }
const acteurDe = (uuid) => { const d = sync(uuid); return d?.actor ?? d ?? null; };

/** Valeur, image et titre du jet en cours. */
function contexte() {
  const d = recent(derniereDemande) ? derniereDemande : null;
  const c = recent(dernierClic) ? dernierClic : null;
  derniereDemande = null;
  const acteur = acteurDe(d?.actorUuid ?? c?.actorUuid);
  let r = null;
  if (d) {
    if (["R/SK", "R/WP"].includes(d.rollType)) r = depuisObjet(sync(d.key));
    else if (d.rollType === "R/CH") r = { valeur: acteur?.system?.characteristics?.[d.key]?.value ?? null };
    else if (d.rollType === "R/AT") r = { valeur: acteur?.system?.attribs?.[d.key]?.value ?? null };
    if (r && d.displayName) r.titre = d.displayName;
  }
  if (!r && c) {
    if (c.itemUuid) r = depuisObjet(sync(c.itemUuid));
    else if (c.characteristic) r = { valeur: acteur?.system?.characteristics?.[c.characteristic]?.value ?? null };
    else if (c.attribute) r = { valeur: acteur?.system?.attribs?.[c.attribute]?.value ?? null };
  }
  r ??= {};
  r.acteur ??= acteur;
  r.img ??= acteur?.img;
  const v = Number(r.valeur);
  r.valeur = Number.isFinite(v) && r.valeur !== null && r.valeur !== "" ? v : null;
  return r;
}

/* ------------------------------------------------------------------ */
/*  Probabilités                                                       */
/* ------------------------------------------------------------------ */

/** Probabilité exacte de réussir (résultat ≤ seuil) avec n dés bonus (n > 0) ou malus (n < 0). */
export function probabilite(s, net = 0) {
  const k = Math.abs(net) + 1;
  let ok = 0, total = 0;
  const combos = 10 ** k;
  for (let u = 0; u < 10; u++) {
    for (let c = 0; c < combos; c++) {
      let m = c, choisi = null;
      for (let i = 0; i < k; i++) {
        const d = m % 10; m = Math.floor(m / 10);
        let v = d * 10 + u; if (v === 0) v = 100;
        if (choisi === null || (net > 0 ? v < choisi : v > choisi)) choisi = v;
      }
      total++;
      if (choisi === 1 || (choisi !== 100 && choisi <= s)) ok++;
    }
  }
  return Math.round((ok / total) * 100);
}

/* ------------------------------------------------------------------ */
/*  La fenêtre                                                         */
/* ------------------------------------------------------------------ */

/** Seuil d'une difficulté selon sa place dans la liste de CoC7 : inconnue, normale, majeure, extrême. */
function seuil(v, rang) {
  if (v === null) return null;
  return [null, v, Math.floor(v / 2), Math.floor(v / 5)][rang] ?? v;
}

function construire(app, el) {
  if (el.querySelector(".c7fj")) return;
  const form = el.querySelector("form");
  const flex = form?.querySelector(".flexcol");
  if (!flex) return;
  const champ = (n) => form.elements.namedItem(n);
  const selDiff = champ("difficulty");
  const range = champ("poolModifier");
  const seuilSaisi = champ("threshold");
  const groupe = (n) => champ(n)?.closest(".form-group") ?? null;

  const ctx = contexte();
  const titre = ctx.titre ?? el.querySelector(".window-title")?.textContent?.trim() ?? "";
  const options = selDiff ? [...selDiff.options] : [];
  const rangDe = (i) => (options.length === 4 ? i : i + 1); // 4 options : inconnue en tête

  const ui = document.createElement("div");
  ui.className = "c7fj";
  ui.innerHTML = `
    <header class="c7fj-tete">
      ${ctx.img ? `<img src="${esc(ctx.img)}" alt="">` : ""}
      <div class="c7fj-titres"><div class="c7fj-titre">${esc(titre)}</div>
        ${ctx.acteur?.name && ctx.acteur.name !== titre ? `<div class="c7fj-sous">${esc(ctx.acteur.name)}</div>` : ""}</div>
      <div class="c7fj-valeur" data-tooltip="${t("valeur")}"><span>${ctx.valeur ?? "—"}</span><small>%</small></div>
    </header>
    <div class="c7fj-champs"></div>
    ${selDiff ? `<div class="c7fj-bloc"><div class="c7fj-legende">${t("difficulte")}</div>
      <div class="c7fj-tuiles c7fj-n${options.length}">${options.map((o, i) => `
        <button type="button" class="c7fj-tuile" data-valeur="${esc(o.value)}" data-rang="${rangDe(i)}" data-tooltip="${t(`aide.d${rangDe(i)}`)}">
          <span class="c7fj-tuile-nom">${rangDe(i) === 0 ? t("inconnue") : esc(o.textContent.trim())}</span><span class="c7fj-tuile-val">—</span></button>`).join("")}</div></div>` : ""}
    ${range ? `<div class="c7fj-bloc"><div class="c7fj-legende" data-tooltip="${t("aide.des")}">${t("des")} <i class="fa-solid fa-circle-info"></i></div>
      <div class="c7fj-crans">${[-2, -1, 0, 1, 2].map((n) => `<button type="button" class="c7fj-cran ${n < 0 ? "malus" : n > 0 ? "bonus" : "neutre"}" data-net="${n}">
        ${n === 0 ? t("aucun") : `${n > 0 ? "+" : "−"}${Math.abs(n)} <span class="c7fj-d">${"<i class=\"fa-solid fa-dice-d10\"></i>".repeat(Math.abs(n))}</span>`}</button>`).join("")}</div></div>` : ""}
    <div class="c7fj-chances" data-tooltip="${t("aide.chances")}"><span>${t("chances")}</span><strong class="c7fj-pct">—</strong>
      <div class="c7fj-barre"><div></div></div></div>
    <p class="c7fj-astuce">${t("astuce")}</p>`;

  // Champs de CoC7 conservés tels quels, rangés dans la nouvelle présentation
  const champs = ui.querySelector(".c7fj-champs");
  for (const n of ["cardType", "threshold", "flatDiceModifier", "flatThresholdModifier"]) {
    const g = groupe(n);
    if (g) champs.append(g);
  }
  if (!champs.children.length) champs.remove();
  flex.hidden = true;
  flex.before(ui);
  el.classList.add("c7fj-v2");

  const valeurBase = () => (seuilSaisi && seuilSaisi.value !== "" ? Number(seuilSaisi.value) : ctx.valeur);
  const maj = () => {
    const base = valeurBase();
    const plat = Number(champ("flatThresholdModifier")?.value) || 0;
    const v = base === null || Number.isNaN(base) ? null : Math.max(0, base + plat);
    ui.querySelector(".c7fj-valeur span").textContent = v ?? "—";
    // Difficulté
    let rang = 1;
    ui.querySelectorAll(".c7fj-tuile").forEach((b) => {
      const s = seuil(v, Number(b.dataset.rang));
      b.querySelector(".c7fj-tuile-val").textContent = Number(b.dataset.rang) === 0 ? "?" : (s ?? "—");
      const actif = selDiff && b.dataset.valeur === selDiff.value;
      b.classList.toggle("actif", !!actif);
      if (actif) rang = Number(b.dataset.rang);
    });
    // Dés
    const net = Math.max(-2, Math.min(2, Number(range?.value) || 0));
    ui.querySelectorAll(".c7fj-cran").forEach((b) => b.classList.toggle("actif", Number(b.dataset.net) === net));
    // Chances
    const bloc = ui.querySelector(".c7fj-chances");
    const s = seuil(v, rang === 0 ? 1 : rang);
    bloc.hidden = s === null;
    if (s !== null) {
      const p = probabilite(s, net);
      ui.querySelector(".c7fj-pct").textContent = `${p} %${rang === 0 ? "*" : ""}`;
      const barre = ui.querySelector(".c7fj-barre > div");
      barre.style.width = `${p}%`;
      barre.className = p >= 50 ? "ok" : p >= 25 ? "moyen" : "ko";
      bloc.dataset.tooltip = rang === 0 ? t("aide.inconnue") : t("aide.chances");
    }
  };

  ui.addEventListener("click", (ev) => {
    const tuile = ev.target.closest(".c7fj-tuile");
    const cran = ev.target.closest(".c7fj-cran");
    if (tuile && selDiff) { selDiff.value = tuile.dataset.valeur; selDiff.dispatchEvent(new Event("change", { bubbles: true })); }
    if (cran && range) { range.value = cran.dataset.net; range.dispatchEvent(new Event("input", { bubbles: true })); range.dispatchEvent(new Event("change", { bubbles: true })); }
    if (tuile || cran) maj();
  });
  // Le type de jet (idée, savoir…) change le nombre de dés côté CoC7 : on relit après lui
  form.addEventListener("change", () => setTimeout(maj, 0));
  form.addEventListener("input", () => setTimeout(maj, 0));
  // Raccourcis : flèches gauche / droite pour les dés, 1-4 pour la difficulté
  el.addEventListener("keydown", (ev) => {
    if (ev.target.matches("input[type=number], input[type=text], select")) return;
    if ((ev.key === "ArrowLeft" || ev.key === "ArrowRight") && range) {
      range.value = Math.max(-2, Math.min(2, (Number(range.value) || 0) + (ev.key === "ArrowRight" ? 1 : -1)));
      ev.preventDefault(); maj();
    }
    const n = Number(ev.key);
    const tuiles = [...ui.querySelectorAll(".c7fj-tuile")];
    if (n >= 1 && n <= tuiles.length && selDiff) { selDiff.value = tuiles[n - 1].dataset.valeur; ev.preventDefault(); maj(); }
  });
  maj();
  app.setPosition?.({ height: "auto" });
}

Hooks.on("renderApplicationV2", (app, el) => {
  try {
    const root = el instanceof HTMLElement ? el : el?.[0];
    if (!root?.classList?.contains("bonus-selection") || !game.settings.get(ID, "actif")) return;
    construire(app, root);
  } catch (e) { console.error(`${ID} |`, e); }
});

Hooks.once("init", () => {
  game.settings.register(ID, "actif", {
    name: "C7FJ.reglage.nom", hint: "C7FJ.reglage.aide",
    scope: "client", config: true, type: Boolean, default: true
  });
});
