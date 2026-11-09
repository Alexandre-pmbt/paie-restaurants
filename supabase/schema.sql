-- =====================================================================
-- Paie Restaurants : base de données et règles de sécurité (Supabase)
-- À exécuter une fois dans Supabase > SQL Editor. Peut être relancé sans risque.
--
-- Rôles :
--   admin        (gérant)      : accès complet
--   responsable                : lit les paramètres de ses sociétés, lit et
--                                enregistre le planning, les repas et les
--                                acomptes de ses sociétés tant que le mois
--                                n'est pas clôturé. Rien d'autre.
--   inactif / pas de profil    : aucun accès
-- =====================================================================

create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nom       text,
  email     text,
  role      text not null default 'inactif' check (role in ('admin', 'responsable', 'inactif')),
  societes  text[] not null default '{}',
  cree_le   timestamptz default now(),
  cree_par  uuid
);

create table if not exists public.docs (
  collection  text not null check (collection in ('societes', 'salaries', 'saisies', 'ajustements', 'clotures', 'documents')),
  id          text not null,
  data        jsonb not null default '{}'::jsonb,
  societe     text generated always as (
                coalesce(data->>'societe',
                  case when collection = 'societes' then id
                       when collection in ('saisies', 'ajustements', 'clotures') then split_part(id, '_', 1) end)
              ) stored,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (collection, id)
);
create index if not exists docs_societe_idx on public.docs (collection, societe);

create or replace function public.docs_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before update on public.docs for each row execute function public.docs_touch();

-- ---------- Fonctions de contrôle (lisent les profils sans boucler sur les règles) ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_resp(soc text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'responsable' and soc = any (societes))
$$;

create or replace function public.mois_cloture(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from docs where collection = 'clotures' and id = p_id)
$$;

-- Le site demande si un gérant existe déjà (écran de premier démarrage)
create or replace function public.base_initialisee() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where role = 'admin')
$$;

-- Premier démarrage : le premier compte qui l'appelle devient gérant, une seule fois.
create or replace function public.premier_admin(p_nom text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  lock table profiles in exclusive mode;
  if exists (select 1 from profiles where role = 'admin') then return false; end if;
  insert into profiles (id, nom, email, role)
    values (auth.uid(), p_nom, (select email from auth.users where id = auth.uid()), 'admin')
    on conflict (id) do update set role = 'admin', nom = excluded.nom;
  return true;
end $$;

-- Mise à jour partielle d'un document (soumise aux règles de l'utilisateur)
create or replace function public.doc_update(p_collection text, p_id text, p_patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update docs set data = data || p_patch where collection = p_collection and id = p_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Document introuvable ou accès refusé : %/%', p_collection, p_id using errcode = '42501'; end if;
end $$;

revoke all on function public.premier_admin(text) from public, anon;
grant execute on function public.premier_admin(text) to authenticated;
grant execute on function public.base_initialisee() to anon, authenticated;
revoke all on function public.doc_update(text, text, jsonb) from public, anon;
grant execute on function public.doc_update(text, text, jsonb) to authenticated;
revoke all on function public.is_admin(), public.is_resp(text), public.mois_cloture(text) from public, anon;
grant execute on function public.is_admin(), public.is_resp(text), public.mois_cloture(text) to authenticated;

-- ---------- Règles d'accès ----------
alter table public.profiles enable row level security;
alter table public.docs enable row level security;

drop policy if exists profils_lecture on public.profiles;
drop policy if exists profils_creation on public.profiles;
drop policy if exists profils_modif on public.profiles;
drop policy if exists profils_suppr on public.profiles;
create policy profils_lecture on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profils_creation on public.profiles for insert to authenticated with check (public.is_admin());
create policy profils_modif on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and (id <> auth.uid() or role = 'admin'));
create policy profils_suppr on public.profiles for delete to authenticated using (public.is_admin() and id <> auth.uid());

drop policy if exists docs_lecture on public.docs;
drop policy if exists docs_creation on public.docs;
drop policy if exists docs_modif on public.docs;
drop policy if exists docs_suppr on public.docs;
create policy docs_lecture on public.docs for select to authenticated using (
  public.is_admin()
  or (collection = 'societes' and public.is_resp(id))
  or (collection = 'saisies' and public.is_resp(split_part(id, '_', 1)))
);
create policy docs_creation on public.docs for insert to authenticated with check (
  public.is_admin()
  or (collection = 'saisies'
      and public.is_resp(split_part(id, '_', 1))
      and data->>'societe' = split_part(id, '_', 1)
      and coalesce((data->>'cloture')::boolean, false) = false
      and not public.mois_cloture(id))
);
create policy docs_modif on public.docs for update to authenticated
  using (public.is_admin() or (collection = 'saisies' and public.is_resp(split_part(id, '_', 1)) and not public.mois_cloture(id)))
  with check (
    public.is_admin()
    or (collection = 'saisies'
        and public.is_resp(split_part(id, '_', 1))
        and data->>'societe' = split_part(id, '_', 1)
        and coalesce((data->>'cloture')::boolean, false) = false
        and not public.mois_cloture(id))
  );
create policy docs_suppr on public.docs for delete to authenticated using (public.is_admin());

-- Aucun accès sans connexion
revoke all on public.docs, public.profiles from anon;

-- ---------- Mises à jour en direct entre utilisateurs ----------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception when undefined_object then null;
end $$;

-- ---------- Pièces d'identité : espace de stockage privé, réservé au gérant ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pieces', 'pieces', false, 10485760, array['image/jpeg','image/png','image/heic','image/heif','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "pieces_admin_select" on storage.objects;
drop policy if exists "pieces_admin_insert" on storage.objects;
drop policy if exists "pieces_admin_delete" on storage.objects;
create policy "pieces_admin_select" on storage.objects for select to authenticated using (bucket_id = 'pieces' and public.is_admin());
create policy "pieces_admin_insert" on storage.objects for insert to authenticated with check (bucket_id = 'pieces' and public.is_admin());
create policy "pieces_admin_delete" on storage.objects for delete to authenticated using (bucket_id = 'pieces' and public.is_admin());

-- ---------- Signature personnelle : chaque compte ne voit et n'utilise que la sienne ----------
create table if not exists public.signatures (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  png text not null,
  maj_le timestamptz not null default now()
);
alter table public.signatures enable row level security;
drop policy if exists sig_lecture on public.signatures;
drop policy if exists sig_creation on public.signatures;
drop policy if exists sig_modif on public.signatures;
drop policy if exists sig_suppr on public.signatures;
create policy sig_lecture on public.signatures for select to authenticated using (user_id = auth.uid());
create policy sig_creation on public.signatures for insert to authenticated with check (user_id = auth.uid());
create policy sig_modif on public.signatures for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sig_suppr on public.signatures for delete to authenticated using (user_id = auth.uid());
revoke all on public.signatures from anon;
grant select, insert, update, delete on public.signatures to authenticated;

-- ---------- Gestion : chiffre d'affaires journalier (caisse) et factures de charges ----------
alter table public.docs drop constraint if exists docs_collection_check;
alter table public.docs add constraint docs_collection_check check (collection in ('societes','salaries','saisies','ajustements','clotures','documents','caisse','charges'));
-- (les politiques docs_lecture / docs_creation / docs_modif ont été étendues : les responsables lisent et saisissent
--  la caisse et déposent des factures pour leurs restaurants ; seul le gérant modifie ou supprime une facture)
insert into storage.buckets (id, name, public, file_size_limit) values ('factures','factures',false,20971520)
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit;
drop policy if exists factures_lecture on storage.objects;
drop policy if exists factures_depot on storage.objects;
drop policy if exists factures_suppr on storage.objects;
create policy factures_lecture on storage.objects for select to authenticated using (bucket_id='factures' and (public.is_admin() or public.is_resp((storage.foldername(name))[1])));
create policy factures_depot on storage.objects for insert to authenticated with check (bucket_id='factures' and (public.is_admin() or public.is_resp((storage.foldername(name))[1])));
create policy factures_suppr on storage.objects for delete to authenticated using (bucket_id='factures' and public.is_admin());
