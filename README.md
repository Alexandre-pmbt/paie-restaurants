# Paie Restaurants

Application interne de paie pour SNDRR, TABBY et PALLAS : import du planning, saisie des repas et acomptes par les responsables, calcul et édition des bulletins, contrats et avenants.

- **Site** : fichiers à la racine de ce dépôt, publiés par GitHub Pages.
- **Base de données et comptes** : Supabase.
- **Sécurité** : `supabase/schema.sql`. Les règles d'accès sont appliquées par la base elle-même, pas seulement par l'affichage.

Aucune donnée de paie n'est stockée dans ce dépôt. Ne déposez jamais ici un fichier `donnees-initiales.json` ou une sauvegarde.

## Mise en ligne (une seule fois)

### 1. Créer le projet Supabase
Sur [supabase.com/dashboard](https://supabase.com/dashboard), cliquez sur **New project** :
- nom : `paie-restaurants` ;
- mot de passe de base : générez-le et rangez-le en lieu sûr ;
- région : **Sydney** (la plus proche de Nouméa).

### 2. Régler la connexion
Allez dans **Authentication**, puis **Sign In / Providers**, puis **Email**.
- **Confirm email** : désactivé. Vous créez vous-même les comptes, il n'y a donc pas d'adresse à confirmer.
- **Allow new users to sign up** : activé. Le site s'en sert pour créer les comptes. Une personne qui s'inscrirait seule n'aurait accès à rien sans profil attribué par le gérant.

Dans **Authentication**, puis **URL Configuration** :
- **Site URL** : l'adresse du site (étape 5), par exemple `https://alexandre-pmbt.github.io/paie-restaurants/`.

### 3. Créer la base
Dans **SQL Editor**, cliquez sur **New query**, collez tout le contenu de `supabase/schema.sql`, puis cliquez sur **Run**. Le message doit être « Success ». Le script peut être relancé sans risque.

### 4. Relier le site à Supabase
Dans **Project Settings**, puis **API**, copiez :
- **Project URL** ;
- la clé **anon public**.

Collez-les dans `supabase-config.js`, directement sur GitHub (icône crayon), puis cliquez sur **Commit changes**.

N'utilisez jamais la clé `service_role`.

### 5. Publier le site
Dans le dépôt GitHub, allez dans **Settings**, puis **Pages** :
- **Source** : *Deploy from a branch* ;
- **Branch** : `main`, dossier `/ (root)` ;
- cliquez sur **Save**.

Au bout d'une à deux minutes, l'adresse s'affiche, par exemple `https://alexandre-pmbt.github.io/paie-restaurants/`.

### 6. Premier démarrage
1. Ouvrez le site **tout de suite** et créez le compte du gérant. Le premier compte créé reçoit tous les droits.
2. Le site affiche « Bienvenue ». Importez le fichier `donnees-initiales.json` (fourni à part, hors de ce dépôt).
3. Vérifiez l'onglet **Bulletins**, société SNDRR, mois de septembre 2026 : le net à payer total doit être de **1 477 949 F**.

### 7. Donner l'accès aux collaborateurs
Dans l'onglet **Équipe**, cliquez sur **Créer un compte**, puis renseignez le nom, l'e-mail, le rôle et les sociétés. Le site affiche un mot de passe provisoire : transmettez-le avec l'adresse du site. Le collaborateur le change ensuite avec **Mon mot de passe**.

| Rôle | Accès |
|---|---|
| Gérant | Tout |
| Responsable | Planning, repas et acomptes de ses sociétés, tant que le mois n'est pas clôturé. Pas de salaires, bulletins ni contrats. |
| Désactivé | Rien. À appliquer le jour du départ d'un collaborateur. |

## Chaque mois
1. Les responsables déposent le planning et saisissent les repas et les acomptes.
2. Le gérant vérifie les bulletins, ajoute les primes et retenues, puis clôture le mois.
3. Il télécharge les bulletins (PDF) et le récapitulatif (Excel).
4. Dans l'onglet **Société**, il télécharge une **sauvegarde complète** et la range hors du site.

## Bon à savoir
- **Mise en veille** : un projet Supabase gratuit est mis en pause s'il n'est pas utilisé pendant 7 jours. Avec une paie mensuelle, cela arrivera entre deux mois. Les données ne sont pas perdues : on le relance avec le bouton **Restore project** du tableau de bord, en quelques minutes. Pour supprimer cette contrainte, il faut passer au plan Pro (25 $ US par mois).
- **E-mails** : l'envoi d'e-mails intégré à Supabase est limité à quelques messages par heure. Le site n'en dépend pas : les comptes sont créés avec un mot de passe provisoire affiché à l'écran.
- **Mise à jour du site** : il suffit de remplacer les fichiers dans ce dépôt. Les données, stockées dans Supabase, ne sont pas touchées.
