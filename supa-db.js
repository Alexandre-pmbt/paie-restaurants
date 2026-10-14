/* ===== Accès aux données : petite couche « documents » au-dessus de Supabase ===== */
const SUPADB = (() => {
  const USER_MAP = { nom: "nom", email: "email", role: "role", societes: "societes", creeLe: "cree_le", creePar: "cree_par" };
  const toRow = (d) => { const r = {}; for (const [k, c] of Object.entries(USER_MAP)) if (d[k] !== undefined) r[c] = d[k]; return r; };
  const fromRow = (r) => { const d = {}; for (const [k, c] of Object.entries(USER_MAP)) if (r[c] !== undefined && r[c] !== null) d[k] = r[c]; return d; };
  const clean = (o) => JSON.parse(JSON.stringify(o ?? {}));
  function fail(error) {
    const e = new Error(error.message || "Erreur");
    e.code = error.code === "42501" || /row-level security|permission/i.test(error.message || "") ? "permission-denied" : (error.code || "erreur");
    return e;
  }
  const snapDoc = (id, data) => ({ id, exists: data != null, data: () => (data == null ? undefined : clean(data)) });

  function create(sb) {
    const subs = new Set();
    const kick = (col) => subs.forEach((s) => { if (!col || s.col === col) s.refresh(); });
    try {
      sb.channel("paie-docs")
        .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (p) => kick((p.new && p.new.collection) || (p.old && p.old.collection)))
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => kick("users"))
        .subscribe();
    } catch (e) { console.warn("Temps réel indisponible", e); }
    setInterval(() => { if (document.visibilityState === "visible") kick(); }, 20000);

    function split(path) { const i = path.indexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; }

    async function getDoc(col, id) {
      if (col === "users") { const { data, error } = await sb.from("profiles").select("*").eq("id", id).maybeSingle(); if (error) throw fail(error); return snapDoc(id, data ? fromRow(data) : null); }
      const { data, error } = await sb.from("docs").select("id,data").eq("collection", col).eq("id", id).maybeSingle();
      if (error) throw fail(error); return snapDoc(id, data ? data.data : null);
    }
    async function query(col, filters) {
      if (col === "users") { const { data, error } = await sb.from("profiles").select("*"); if (error) throw fail(error); return data.map((r) => snapDoc(r.id, fromRow(r))); }
      let q = sb.from("docs").select("id,data").eq("collection", col);
      for (const [f, op, v] of filters) { if (op !== "==") throw new Error("Filtre non géré : " + op); q = q.eq("data->>" + f, String(v)); }
      const { data, error } = await q; if (error) throw fail(error);
      return data.map((r) => snapDoc(r.id, r.data));
    }
    function watch(col, load, next, error) {
      let last, dead = false;
      const s = { col, refresh: async () => { try { const v = await load(); if (dead) return; const j = JSON.stringify(v.key); if (j !== last) { last = j; next(v.snap); } } catch (e) { if (!dead && error) error(e); } } };
      subs.add(s); s.refresh();
      return () => { dead = true; subs.delete(s); };
    }

    const docRef = (path) => {
      const [col, id] = split(path);
      return {
        id, path,
        get: () => getDoc(col, id),
        async set(data) {
          if (col === "users") { const { error } = await sb.from("profiles").upsert({ id, ...toRow(data) }); if (error) throw fail(error); }
          else { const { error } = await sb.from("docs").upsert({ collection: col, id, data: clean(data) }); if (error) throw fail(error); }
          kick(col);
        },
        async update(data) {
          if (col === "users") { const { error } = await sb.from("profiles").update(toRow(data)).eq("id", id); if (error) throw fail(error); }
          else { const { error } = await sb.rpc("doc_update", { p_collection: col, p_id: id, p_patch: clean(data) }); if (error) throw fail(error); }
          kick(col);
        },
        async delete() {
          const r = col === "users" ? await sb.from("profiles").delete().eq("id", id) : await sb.from("docs").delete().eq("collection", col).eq("id", id);
          if (r.error) throw fail(r.error); kick(col);
        },
        onSnapshot(next, error) { return watch(col, async () => { const s = await getDoc(col, id); return { snap: s, key: s.exists ? s.data() : null }; }, next, error); },
      };
    };
    const colRef = (col, filters = []) => {
      const q = {
        where: (f, op, v) => colRef(col, [...filters, [f, op, v]]),
        orderBy: () => q, limit: () => q,
        async get() { const docs = await query(col, filters); return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) }; },
        onSnapshot(next, error) { return watch(col, async () => { const docs = await query(col, filters); return { snap: { docs, size: docs.length, empty: !docs.length }, key: docs.map((d) => [d.id, d.data()]) }; }, next, error); },
        doc: (id) => docRef(col + "/" + (id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)))),
        async add(data) { const r = q.doc(); await r.set(data); return r; },
      };
      return q;
    };
    return {
      doc: docRef, collection: (c) => colRef(c), settings() {},
      batch() {
        const ops = [];
        return {
          set(ref, d) { ops.push([ref.path, d]); },
          async commit() {
            const rows = ops.map(([p, d]) => { const [c, id] = split(p); return { collection: c, id, data: clean(d) }; });
            for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from("docs").upsert(rows.slice(i, i + 200)); if (error) throw fail(error); }
            kick();
          },
        };
      },
    };
  }
  return { create };
})();
