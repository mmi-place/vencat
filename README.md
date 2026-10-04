# Vencat

Vencat est une application de consultation des emplois du temps CELCAT de l’IUT de Vélizy et de Rambouillet. Le frontend Vue et l’API sont réunis dans un seul projet déployé sur Vercel.

**Application : [vencat.mmi.place](https://vencat.mmi.place)**

## Fonctionnalités

- Choix progressif de la filière, de la promotion et du groupe final, avec des liens comme `/mmi/2/b1`. À la première visite, aucun groupe n’est choisi par défaut.
- Vue **Liste** par défaut : une journée sous 1 024 px, plusieurs journées côte à côte sur grand écran. Les vues **Jour** et **Semaine** utilisent une grille horaire. Le niveau **Compact / Complet** est indépendant de la vue.
- Recherche sur l’année scolaire, avec résultats en liste compacte et critères matière, type, enseignant, salle et groupe. Une icône calendrier permet de choisir des dates ; la recherche laisse le planning principal intact.
- Détail d’un cours avec description de la matière et informations cliquables pour lancer une recherche.
- Thèmes sombre, clair ou selon l’appareil, et fonds avec aperçus. Les cours terminés sont grisés ; le cours en cours est plus clair. Le numéro dans le cercle de l’en-tête est rouge lorsque la date affichée est aujourd’hui.
- Affichage des jours de week-end uniquement lorsqu’ils contiennent des cours. À l’ouverture d’un week-end vide, la navigation initiale avance au lundi suivant.
- Consultation des semaines enregistrées hors connexion et installation comme application web sur mobile. L’interface se met à jour lors du rechargement et au retour dans l’application.
- Historique local et partagé des changements, avec indicateurs non lus dans le menu mobile et une cloche rouge sur ordinateur. Il n’y a pas de notifications push sur l’appareil.

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

Le navigateur conserve les semaines consultées dans IndexedDB. À l’ouverture, une copie locale de moins d’une minute peut être réutilisée ; au-delà, le client demande le serveur. Lorsque l’actualisation automatique est activée, une nouvelle vérification a lieu toutes les dix minutes et au retour dans l’onglet.

Le bouton d’actualisation relance la demande au serveur. Il ne contourne pas le cache serveur : une réponse encore valide peut donc être réutilisée. Le bouton « Aujourd’hui » sert à revenir à la date courante. Il est masqué sur mobile et désactivé sur ordinateur lorsque le jour affiché, ou la semaine affichée en vue hebdomadaire, correspond déjà à sa destination. Sinon il reste disponible, quelle que soit la vue. Un week-end sans cours ramène au lundi suivant. Le bouton de rechargement reste distinct et disponible.

Les fenêtres courtes du planning sont conservées dix minutes dans Redis. La recherche dispose de caches par groupe et intervalle :

| Étendue de recherche | Durée de validité |
| --- | --- |
| Jusqu’à 2 semaines | 10 minutes |
| Jusqu’à 1 mois | 24 heures |
| Jusqu’à 3 mois | 72 heures |
| Jusqu’à 6 mois | 7 jours |
| Année scolaire | 14 jours |

Les bornes exactes des intervalles personnalisés sont de 14, 31, 93, 184 et 366 jours. La recherche annuelle couvre la période du 1er septembre au 31 août. Les deux semaines courantes fraîches complètent les résultats de l’archive annuelle.

La validité part de la récupération des données universitaires, et n’est pas prolongée par une lecture du cache. Les choix des menus de recherche sont calculés par le serveur à partir des résultats possibles. Les versions de données et de menus permettent au client de les mettre à jour ; la modale ouverte vérifie les données chaque minute.

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

Les secrets restent côté serveur, dans les variables d’environnement Vercel ou dans `.env.local`, ignoré par Git. Aucune clé Redis n’est transmise au navigateur. Une paire Redis complète est nécessaire pour activer le stockage partagé.

La tâche `/api/monitor` est configurée à **05 h UTC chaque jour**, soit 07 h en France métropolitaine en été et 06 h en hiver. Elle compare les plannings des groupes suivis et précharge leurs caches expirés, avec une rotation des groupes et un budget de temps. Les groupes s’inscrivent au suivi lorsqu’ils utilisent l’historique partagé ou la recherche.

Les durées du tableau sont des validités de cache, pas des fréquences de tâche planifiée : un cache expiré est renouvelé à la demande, ou lors du passage quotidien du serveur.

## API

Toutes les routes utilisent le même domaine que le frontend.

| Route | Résultat |
| --- | --- |
| `GET /api/ping` | Réponse `pong` |
| `GET /api/edt/:groupId?start=YYYY-MM-DD&end=YYYY-MM-DD` | Planning au format historique ; `end` vaut cinq jours après `start` si absent |
| Même route avec `format=course` | Tableau de cours normalisés |
| Même route avec `format=snapshot` | Cours et couverture, source et date de récupération ; format utilisé par l’application |
| `GET /api/search/:groupId?q=texte&date=YYYY-MM-DD` | Recherche annuelle, versions et choix des menus |
| `GET /api/changes/:groupId` | Historique partagé des changements |
| `GET /api/history/config` | Disponibilité du stockage partagé |
| `GET /api/monitor` | Tâche planifiée, protégée par `Authorization: Bearer <CRON_SECRET>` |

La route planning accepte un écart maximal de 62 jours entre `start` et `end`. La recherche accepte `q=` pour parcourir les cours sans texte, ainsi que les critères facultatifs `type`, `module`, `teacher`, `room` et `group`. `start` et `end` permettent un intervalle personnalisé de 1 à 366 jours inclus. Les scopes internes `week`, `fortnight`, `month`, `quarter`, `semester` et `year` restent disponibles pour les appels API et le préchargement.

## Licence du backend

Le backend CELCAT importé est sous **GPL-3.0**. Voir [sa licence](backend/LICENSE.md) et [sa documentation](backend/README.md).
