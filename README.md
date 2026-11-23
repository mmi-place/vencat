# Vencat

Vencat est une application de consultation des emplois du temps CELCAT de l’IUT de Vélizy et de Rambouillet. Le frontend Vue et l’API sont réunis dans un seul projet déployé sur Vercel.

**Application : [vencat.mmi.place](https://vencat.mmi.place)**

## Fonctionnalités

- Choix progressif de la filière, de la promotion et du groupe final, avec des liens comme `/mmi/2/b1` (et `?date=AAAA-MM-JJ` pour un autre jour qu’aujourd’hui). À la première visite, aucun groupe n’est choisi par défaut.
- Vue **Liste** à la première visite, puis la dernière vue utilisée est rouverte (réglage « Vue à l’ouverture » pour imposer Liste, Jour ou Semaine). Une application installée ignore la date et la vue enregistrées dans son adresse d’installation. Liste : une journée sous 1 024 px, plusieurs journées côte à côte sur grand écran. Les vues **Jour** et **Semaine** utilisent une grille horaire. Le niveau **Compact / Complet** est indépendant de la vue.
- Recherche sur l’année scolaire : l’année du groupe est téléchargée une fois, puis filtrée sur l’appareil (texte, matière, type, enseignant, salle, groupe). Les résultats partent du premier cours du jour, groupés par jour ; une case inclut les cours passés et l’icône calendrier choisit d’autres dates. Sur mobile, la recherche occupe l’écran et les filtres sont repliés. **Voir sur le planning** met en avant les cours trouvés, atténue les autres, et les flèches passent directement aux jours ou semaines qui contiennent des résultats (Échap pour quitter).
- Détail d’un cours avec description de la matière et informations cliquables pour lancer une recherche.
- Thèmes sombre, clair ou selon l’appareil. Sur ordinateur, les boutons **Apparence** (thème, détail des cartes, couleurs des cours) et **Fond** sont séparés des réglages. Six palettes de couleurs (dont une adaptée au daltonisme, Okabe-Ito, et deux monochromes bleu et rose) et un choix par pastilles pour chaque type ou matière. Dans Fond, l’import d’une image personnelle est le premier choix. Les cours terminés sont grisés ; le cours en cours est plus clair. Le numéro dans le cercle de l’en-tête est rouge lorsque la date affichée est aujourd’hui.
- Samedi et dimanche masqués par défaut, même avec des cours (souvent des créneaux provisoires). Une option les affiche lorsqu’ils contiennent des cours. Un week-end masqué ou vide ouvre le lundi suivant.
- Grille Jour et Semaine limitée aux heures du premier et du dernier cours de l’année scolaire du groupe, élargie si un cours affiché en sort.
- Consultation des semaines enregistrées hors connexion et installation comme application web sur mobile. L’interface se met à jour lors du rechargement et au retour dans l’application.
- Changements détectés **côté serveur**, les mêmes pour tout le monde : à chaque lecture de CELCAT d’une semaine, le serveur la compare avec la précédente et ajoute les différences à l’historique du groupe (30 jours). L’appareil ne compare plus rien : il affiche cet historique et en garde une copie hors ligne. Présenté comme un centre de notifications groupé par jour : glisser une notification sur le côté (ou Suppr) la supprime, avec possibilité d’annuler ; « Voir le cours » ouvre le jour concerné. Indicateurs non lus dans le menu mobile et cloche rouge sur ordinateur. Sur les cartes, une pastille Nouveau, Déplacé ou Modifié devient de plus en plus visible à 7, 5, 3 puis 1 jour du cours. Il n’y a pas de notifications push sur l’appareil.

## Travaux

Une bascule **Cours | Travaux** (touche **W**) affiche les devoirs, rendus, évaluations et projets de la promotion, déclarés par les étudiants et vérifiés collectivement. La lecture ne demande pas de compte.

- **Planning** : le mois en cases (étiquettes colorées par type, compte à rebours, pointillés tant que la proposition n’est pas validée, « +N » au-delà de 3). Sur mobile, des points sous les jours et la liste du jour choisi.
- **Liste** : par semaine, retards en tête, case « fait » privée et progression, filtres (type, portée, à confirmer, masquer les faits).
- **Dans l’emploi du temps** : résumé du jour (« Rendu ×1 · Éval ×2 »), ligne sous le cours lié, pastille « Nouveau devoir », bouton « Ajouter les infos du DS », travaux et corrections dans la fiche d’un cours.
- **Fiche** : modalités, liens avec leur domaine, auteur, cours lié, votes (Confirmer, Contester avec motif, Proposer une modification, N’existe plus, Signaler), note privée, historique, ←/→.
- **Validation** : au moins 3 👍 et deux fois plus de 👍 que de 👎, vote de l’auteur exclu ; « probablement correct » après 48 h avec 1 👍 et aucun 👎 ; « contesté » avec au moins 2 👎 majoritaires. Comptes fiables : 1 ou 2 👍. Comptes de moins de 7 jours : votes à moitié, liens inactifs avant validation. Une seule proposition de modification ouverte par travail.
- **Connexion** : adresse en `.uvsq.fr`, code à 6 chiffres et lien magique par mail (10 minutes, 5 essais, haché), validation sur un appareil déjà connecté en choisissant un nombre parmi trois, ou QR code. Session dans un cookie `HttpOnly` (jeton signé `kind: 'user'`).
- **Compte** : appareils et déconnexion à distance, groupe modifiable une fois par semestre, correction du nom validée par l’admin, suppression (contributions gardées sous « Ancien étudiant »).
- **Délégué(e)s** : pas d’élection dans Vencat. Les délégué(e)s élu(e)s de la classe se déclarent (titulaire ou suppléant(e), date de l’élection, certification sur l’honneur) ; les élèves du groupe reçoivent la déclaration dans « À valider » et répondent oui, je ne sais pas ou non (un avis, pas un vote) ; l’administration, prévenue par mail, vérifie et confirme. Mandat jusqu’à la fin de l’année scolaire ; signalement « ce n’est pas notre délégué(e) », **modération** (signalements, noms, alertes de fiabilité, lecture seule, bannissement, journal), **corrections d’emploi du temps** certifiées sur l’honneur, affichées par-dessus CELCAT et fermées quand CELCAT change le cours.
- **Abonnement agenda** : `GET /api/travaux/ics/<groupe>.ics`, rappel la veille ; un bouton qui propose d’abord l’agenda le plus probable pour l’appareil.
- **Ajout perso** : un travail « juste pour moi » n’est visible que par son auteur, sans vote, modifiable et supprimable directement, absent de l’ICS.
- **Hors ligne** : le compte reste affiché, les travaux sont gardés par compte, et les votes, cases, notes et nouveaux travaux (en brouillon) partent au retour du réseau, une seule fois. La déconnexion ou une session expirée efface ces copies de l’appareil.
- **Administration** (`/admin`) : vue d’ensemble, modération (signalements, délégués, noms, alertes), comptes (groupe, lecture seule, bannissement, suppression, nomination de délégué), travaux, corrections d’emploi du temps, délégués et journal.
- **Mode « planning seul »** (levier d’urgence dans `/admin`, onglet Vue d’ensemble) : quand le contenu des élèves devient incontrôlable, coupe d’un coup les Travaux, les comptes, les connexions, les corrections et les délégués. L’emploi du temps CELCAT reste disponible, un bandeau (message personnalisable) prévient les élèves, les abonnements webcal renvoient un calendrier vide et les appareils l’apprennent en 5 min au plus. Les données ne sont pas supprimées : désactiver le levier remet tout en place. L’activation est inscrite au journal.

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` (ou `POSTGRES_URL`) | Postgres Neon du Marketplace Vercel. Sans elle, le développement garde les données dans `.data/travaux.json` |
| `TOKEN_SECRET` | Obligatoire en production pour signer les sessions (32 caractères minimum) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Serveur SMTP Oracle (nodemailer) |
| `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME` | Expéditeur approuvé, par exemple `MMI-Place <no-reply@mmi.place>` |
| `CONTACT_EMAIL` | Adresse de contact (CGU, contestation des sanctions) et `Reply-To` des mails |
| `ADMIN_EMAILS` | Adresses autorisées sur `/admin` (connexion séparée par code mail, session limitée à la session du navigateur, 12 h au plus). Un compte étudiant n’est jamais administrateur |
| `APP_ADMIN_EMAILS` | Facultatif, exceptionnel : comptes étudiants dotés des droits d’administration dans l’application |
| `TEACHER_ACCOUNTS` | `true` pour accepter les adresses `@uvsq.fr` (badge « Confirmé par l’enseignant ») |
| `PUBLIC_URL` | Facultatif : origine utilisée dans les liens des mails et de l’ICS |
| `MAIL_LOG_ONLY` | Développement : expression des adresses qui reçoivent le mail dans la console (ex. `@test\.uvsq\.fr$`) |

Sans SMTP configuré, le développement affiche les mails dans la console et préremplit le code. Attention aux fichiers `.env` de Docker Compose : `$$` y représente un seul `$`, ce que Node ne traduit pas.

À faire avant la mise en ligne : ajouter l’intégration Neon, renseigner les variables SMTP et `TOKEN_SECRET` sur Vercel, ajouter SPF et DKIM pour `mmi.place`.

| Route | Rôle |
| --- | --- |
| `POST /api/auth/start`, `/verify`, `/send-mail`, `/poll`, `/qr`, `/approve`, `/deny`, `/logout` ; `GET /api/auth/me`, `/pending`, `/magic`, `/qr-info` | Connexion |
| `/api/account/*` | Intégration, appareils, groupe, nom, cases et notes, suppression |
| `GET /api/travaux/group/:groupId`, `/work/:id`, `/queue` ; `POST /api/travaux/works`, `/work/:id/vote`, `/work/:id/proposal`, `/proposal/:id/vote`, `/work/:id/report`, `/work/:id/moderate` | Travaux |
| `/api/travaux/delegates/*`, `/api/travaux/moderation*`, `/api/travaux/corrections*` | Délégués, modération, corrections |
| `POST /api/admin/start`, `/verify`, `/logout`, `/action`, `/work/:id`, `/correction/:id` ; `GET /api/admin/me`, `/overview`, `/works`, `/corrections` ; `GET`/`POST /api/admin/settings` (mode planning seul) | Administration (cookie `vencat_admin`, chemin `/api/admin`) |

Les routes qui modifient des données exigent l’en-tête `X-Requested-With: vencat` et refusent les autres origines.

## Accessibilité

Dans **Réglages → Accessibilité**, chacun peut renforcer les contrastes, agrandir le texte, choisir un fond uni et réduire les animations. Ces choix sont enregistrés sur l’appareil. Les préférences système de réduction des animations et de contraste renforcé (`prefers-contrast: more`) sont toujours respectées.

La navigation utilise les contrôles HTML natifs : Tab et Maj + Tab, Entrée ou Espace pour ouvrir un cours, Échap pour fermer une fenêtre avec retour du focus. Le planning ne compte qu’un seul arrêt de Tab : on arrive sur le cours en cours ou le prochain. Sur les cours, ↑/↓ parcourt la journée, ←/→ rejoint la journée voisine au plus près du même horaire, Début/Fin rejoint ses extrémités et Ctrl + Début/Fin celles du planning affiché. Dans le détail d’un cours, ←/→ et les boutons Précédent/Suivant passent au cours voisin.

Hors des cours et des champs, ←/→ et Page préc./Page suiv. changent de jour ou de semaine. Les touches simples **/** (recherche), **?** (aide), **T** (aujourd’hui), **L/J/S** (Liste/Jour/Semaine), **P** (cours en cours ou prochain), **G** (groupe) et **C** (changements) sont désactivables ; maintenir **Alt** affiche ces touches sur les boutons. Les combinaisons **Alt + Maj** (F, G, S, A, C, T, P, 1/2/3, ←/→) restent disponibles. Les raccourcis sont inactifs dans les champs de saisie et les fenêtres. Le titre de l’onglet indique le groupe affiché.

Les contrôles automatiques et les essais clavier ne remplacent pas une validation complète avec différents lecteurs d’écran.

## Développement local

Utiliser **Node.js 22.12 ou une version plus récente de la branche 22.x**.

```sh
npm ci
npm run dev
```

Le frontend est servi sur `http://localhost:5173`. Vite transmet les appels `/api` à l’API locale sur le port `5000`.

La consultation fonctionne avec les services universitaires configurés par défaut. Pour changer ces services ou activer Redis en local, copier `.env.example` dans `.env.local`, puis renseigner les variables utiles.

| Commande | Usage |
| --- | --- |
| `npm run dev` | Frontend et API avec rechargement automatique |
| `npm run dev:web` | Frontend uniquement |
| `npm run dev:api` | API uniquement |
| `npm test` | Tests de normalisation, navigation, recherche, stockage et catalogues |
| `npm run build` | Vérification TypeScript et compilation dans `dist` |
| `npm run preview` | Aperçu du frontend compilé ; l’API reste nécessaire pour les cours |

## Organisation du code

| Dossier | Contenu |
| --- | --- |
| `src/views` | Planning, navigation et orchestration de l’interface |
| `src/components` | Cartes, grilles, listes et modales |
| `src/scripts` | État du planning, IndexedDB, préférences, catalogues et mise à jour PWA |
| `src/scripts/travaux/` | Travaux côté appareil : `api` (appels, session expirée), `session` (compte gardé hors ligne), `marks` (cases et notes), `outbox` (actions hors ligne par compte), `works` (travaux, brouillons, corrections), `ui` (sections, fenêtres, messages) ; `src/scripts/travaux.ts` les relie |
| `src/components/travaux/` | Interface des Travaux |
| `backend/travaux/` | `routes` (contrôles communs puis un module par domaine) : `login` (connexion, compte), `works` (travaux, votes, propositions, calendriers), `delegates`, `moderation`, `corrections` ; `common` (documents stockés, état d’un travail selon les votes), `auth`, `admin`, `settings` (mode planning seul), `store`, `mail` |
| `shared` | Contrats des cours, groupes, dates, recherche et réparation des textes |
| `backend` | Lecture de CELCAT, normalisation, caches Redis, recherche et suivi des changements |
| `api` | Points d’entrée des fonctions Vercel |
| `public/catalogues` | Descriptions des matières par filière |
| `tests` | Tests automatisés du frontend partagé et du backend |

Les groupes connus sont récupérés via l’API POST de CELCAT, avec un repli iCalendar en cas d’échec. Les enseignants et salles multiples sont conservés, les doublons exacts sont supprimés et les dates sans fuseau sont interprétées en `Europe/Paris`. L’API utilise des dates ISO en UTC.

Les textes mal encodés comme `dâ€™un` sont réparés en `d’un` à l’import et lors de la lecture des copies enregistrées. La réparation conserve les caractères Unicode déjà corrects. Les identifiants des cours et leurs horaires ne sont pas modifiés.

## Descriptions des matières

Les quatre catalogues sont `mmi.json`, `info.json`, `rt.json` et `geii.json`. Chaque matière possède un titre, une description, un seul score de confiance et des alias d’intitulés CELCAT. Les alias servent à éviter d’afficher la description d’une matière différente ou d’un cours qui mélange plusieurs matières.

Pour publier une modification :

1. Modifier les entrées dans `public/catalogues/<filière>.json`.
2. Incrémenter le numéro entier dans `public/catalogues/manifest.json` et reporter cette même valeur dans le champ `version` des quatre catalogues.
3. Lancer `npm test` et `npm run build`, puis envoyer le changement sur `main`.

Le navigateur vérifie ce numéro, télécharge le catalogue de la filière sélectionnée lorsque la version change et conserve une copie dans IndexedDB pour la consultation hors connexion. L’ancien fichier `modules.json` a été remplacé par ces catalogues.

## Caches et actualisation

Le navigateur conserve les semaines consultées dans IndexedDB. À l’ouverture, une copie locale de moins de cinq minutes est réutilisée, y compris pour les semaines préchargées ; au-delà, le client demande le serveur. Lorsque l’actualisation automatique est activée, une nouvelle vérification a lieu toutes les dix minutes et au retour dans l’onglet.

Le bouton d’actualisation relance la demande au serveur. Il ne contourne pas le cache serveur : une réponse encore valide peut donc être réutilisée. Le bouton « Aujourd’hui » sert à revenir à la date courante. Il est masqué sur mobile et désactivé sur ordinateur lorsque le jour affiché, ou la semaine affichée en vue hebdomadaire, correspond déjà à sa destination. Sinon il reste disponible, quelle que soit la vue. Un week-end sans cours ramène au lundi suivant. Le bouton de rechargement reste distinct et disponible.

Les fenêtres courtes du planning sont conservées dix minutes dans Redis. La recherche dispose de caches par groupe et intervalle :

| Étendue de recherche | Durée de validité |
| --- | --- |
| Jusqu’à 2 semaines | 10 minutes |
| Jusqu’à 1 mois | 12 heures (rafraîchi automatiquement à 2 h et 14 h) |
| Jusqu’à 3 mois | 24 heures |
| Jusqu’à 6 mois | 3 jours |
| Année scolaire | 7 jours |

**Rafraîchissement programmé de la recherche sur 1 mois** : chaque jour à **02:00 et 14:00 (heure de Paris)**, le serveur recharge depuis CELCAT la recherche du mois en cours pour **tous les groupes, d’affilée** (4 à la fois). Sur un serveur Node qui tourne en continu, un minuteur interne s’en charge (`PREFETCH=off` pour le désactiver). Sur Vercel, des crons à 00:00, 01:00, 12:00 et 13:00 UTC appellent `GET /api/prefetch` (protégé par `CRON_SECRET`) : seul l’appel qui tombe dans l’heure de 2 h ou de 14 h à Paris travaille, une fois par créneau (verrou Redis), sous un budget de 240 s, en dessous de la limite de 300 s d’une fonction ; s’il reste des groupes, il passe la main à un dernier appel. Sur l’offre Hobby, un cron s’exécute une fois par jour quelque part dans son heure : le passage a donc lieu entre 2 h et 3 h, et entre 14 h et 15 h.

Les bornes exactes des intervalles personnalisés sont de 14, 31, 93, 184 et 366 jours. La recherche annuelle couvre la période du 1er septembre au 31 août. Les deux semaines courantes fraîches complètent les résultats de l’archive annuelle.

La validité part de la récupération des données universitaires, et n’est pas prolongée par une lecture du cache. Les choix des menus de recherche sont calculés sur l’appareil à partir des résultats possibles. La fenêtre de recherche réutilise l’année téléchargée pendant dix minutes avant de la redemander.

Sans Redis, les caches en mémoire restent disponibles, mais sont propres à chaque instance du serveur. Redis permet leur partage entre les fonctions Vercel ainsi que la conservation de l’historique commun.

## Vercel et Redis

Importer le dépôt dans Vercel avec la racine du dépôt comme **Root Directory** et `main` comme **Production Branch**. La configuration de `vercel.json` installe les dépendances, compile le frontend dans `dist` et déploie les fonctions API. L’intégration GitHub déclenche automatiquement un déploiement après chaque push sur `main`. Le workflow GitHub Actions exécute les tests et la compilation. L’ancien déploiement FTP est supprimé.

Pour relier une copie locale au projet :

```sh
npx vercel link
npx vercel deploy
```

Le second appel crée un déploiement de prévisualisation. Pour un déploiement manuel en production, utiliser `npx vercel deploy --prod` après vérification.

| Variable | Rôle |
| --- | --- |
| `CELCAT_BASE_URL` | Serveur CELCAT utilisé pour les flux iCalendar |
| `CELCAT_EDT_URL` | Serveur utilisé pour les requêtes POST |
| `CACHE_TTL_SECONDS` | Durée des caches mémoire et CDN du planning, 600 secondes par défaut |
| `PORT` | Port de l’API locale, 5000 par défaut |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Identifiants Redis fournis par l’intégration Vercel Marketplace |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Autre paire complète acceptée pour Redis |
| `CRON_SECRET` | Secret d’authentification de la tâche planifiée |
| `TOKEN_SECRET` | Facultatif, 32 caractères aléatoires minimum : active les jetons anonymes par appareil |

Les secrets restent côté serveur, dans les variables d’environnement Vercel ou dans `.env.local`, ignoré par Git. Aucune clé Redis n’est transmise au navigateur. Une paire Redis complète est nécessaire pour activer le stockage partagé.

La tâche `/api/monitor` est configurée à **05 h UTC chaque jour**, soit 07 h en France métropolitaine en été et 06 h en hiver. Elle relit depuis CELCAT la semaine en cours et la suivante de **tous les groupes** et enregistre leurs changements ; le passage de 2 h et 14 h (voir plus haut) fait de même. L’historique et les semaines de référence sont gardés dans le stockage des Travaux (Postgres en production, `.data/` en développement) : Redis n’est plus nécessaire pour les changements. Une semaine qui se vide d’un coup n’est prise en compte qu’à la deuxième lecture.

Les durées du tableau sont des validités de cache, pas des fréquences de tâche planifiée : un cache expiré est renouvelé à la demande, ou lors du passage quotidien du serveur.

## API

Toutes les routes utilisent le même domaine que le frontend.

| Route | Résultat |
| --- | --- |
| `GET /api/ping` | Réponse `pong` |
| `POST /api/token` | Jeton anonyme d’appareil (`204` si `TOKEN_SECRET` n’est pas configuré) |
| `GET /api/edt/:groupId?start=YYYY-MM-DD&end=YYYY-MM-DD` | Planning au format historique ; `end` vaut cinq jours après `start` si absent |
| Même route avec `format=course` | Tableau de cours normalisés |
| Même route avec `format=snapshot` | Cours et couverture, source et date de récupération ; format utilisé par l’application |
| `GET /api/search/:groupId?q=texte&date=YYYY-MM-DD` | Recherche annuelle, versions et choix des menus |
| `GET /api/changes/:groupId` | Historique des changements détectés par le serveur (consulté au plus toutes les deux minutes, aussitôt à l’ouverture du panneau ou après une actualisation) |
| `GET /api/hours/:groupId` | Heures du premier début et de la dernière fin de l’année scolaire, mises en cache 24 h |
| `GET /api/history/config` | Disponibilité du stockage partagé |
| `GET /api/monitor` | Tâche planifiée, protégée par `Authorization: Bearer <CRON_SECRET>` |
| `GET /api/prefetch` | Rafraîchissement programmé de la recherche sur 1 mois pour tous les groupes (même protection) ; `?from=N` reprend au groupe N |

Seuls les groupes connus de Vencat sont acceptés. La route planning accepte un écart maximal de 62 jours entre `start` et `end`. La recherche accepte `q=` pour parcourir les cours sans texte, ainsi que les critères facultatifs `type`, `module`, `teacher`, `room` et `group`. `start` et `end` permettent un intervalle personnalisé de 1 à 366 jours inclus. Les scopes internes `week`, `fortnight`, `month`, `quarter`, `semester` et `year` restent disponibles pour les appels API et le préchargement.

## Limites de requêtes

Avec Redis, la recherche et `/api/hours` (qui peuvent reconstruire l’année depuis CELCAT) ont un budget sur dix minutes. Chaque appareil peut obtenir un **jeton anonyme** signé par le serveur (`TOKEN_SECRET`) : un identifiant aléatoire, sans donnée personnelle ni empreinte du navigateur, conservé sur l’appareil 180 jours. Avec un jeton, le budget est de 180 requêtes par appareil, avec un garde-fou large de 1 500 par adresse ; sans jeton, l’ancien budget de 180 par adresse s’applique. Une adresse peut obtenir au plus 30 jetons par dix minutes. Le champ `kind` du jeton permettra d’ajouter d’autres identités, par exemple des comptes.

## Licence du backend

Le backend CELCAT importé est sous **GPL-3.0**. Voir [sa licence](backend/LICENSE.md) et [sa documentation](backend/README.md).

## Fonds de l’application

Les fonds sont regroupés en couleurs unies, dégradés, motifs et images. Une image personnelle (JPG, PNG, WebP ou AVIF, 10 Mo maximum) est redimensionnée et enregistrée dans IndexedDB sur cet appareil ; elle n’est pas envoyée au serveur.

Les photos supplémentaires proviennent d’Unsplash : [lac](https://images.unsplash.com/photo-1470770841072-f978cf4d019e), [océan](https://images.unsplash.com/photo-1518837695005-2083093ee35b), [collines](https://images.unsplash.com/photo-1500534623283-312aade485b7). Voir la [licence Unsplash](https://unsplash.com/license).

Dans l’historique, la corbeille masque un changement sur cet appareil, y compris après rechargement. Elle ne supprime pas l’historique partagé des autres utilisateurs.
