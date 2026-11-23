# Travaux · refonte UX

Sources d’inspiration : vue « À venir » de Todoist (liste continue par jour, barre de semaine avec points), Fantastical (planning + panneau du jour), Apple Rappels (liste à cases rondes, métadonnées colorées), MyStudyLife et Power Planner (devoirs par type, vue du jour à côté du calendrier), Discord (QR code et formulaire côte à côte), web.dev « SMS OTP form » (un seul champ `one-time-code`, pas six cases).

## Principes
1. **La section est un lieu, pas un filtre** : Cours | Travaux est un onglet principal, centré dans la barre de Vencat, visuellement distinct des contrôles de vue (Liste/Jour/Semaine).
2. **Rien ne bouge** : les indicateurs de travaux s’intègrent dans les en-têtes existants (points et compteur sur la ligne de date), sans changer leur hauteur, et restent visibles au défilement (en-têtes collants).
3. **Une information, une place** : sur une carte de cours, l’horaire corrigé remplace l’horaire (ancien barré), la salle corrigée remplace la salle ; les travaux liés occupent une ligne de pied discrète avec icône de type.
4. **Le temps défile** : Travaux est un agenda continu qui part de la semaine en cours ; les semaines s’ajoutent en descendant, les plus lointaines sont retirées.
5. **Le détail à côté** (ordinateur) : 70 % agenda, 30 % panneau du jour sélectionné ; la fiche d’un travail s’ouvre dans ce panneau.
6. **Le compte partout** : avatar dans la barre principale (Cours et Travaux), gestion du compte dans un espace dédié (profil, appareils, groupe, agenda, confidentialité).

## Écrans
- **Barre principale** : logo · onglets Cours / Travaux (pastille) · groupe, recherche, apparence, réglages, cloche, avatar.
- **Cours** : point(s) de couleur + nombre sur la ligne de date des en-têtes ; sur mobile, puce « 2 travaux » sous la date du jour dans l’en-tête fixe.
- **Carte de cours** : `~~14:00–16:00~~ 13:30–15:30 ⚑`, `~~I22~~ E58 ⚑`, « Annulé » hachuré ; pied : icône + « Rendu 12:00 ».
- **Travaux (ordinateur)** : barre de semaine (jours, points, flèches, Aujourd’hui) · filtres en puces · agenda par semaines (5 colonnes) · panneau du jour (liste type Rappels, ajout, fiche intégrée, file à valider, comment ça marche, abonnement).
- **Travaux (mobile)** : barre de semaine collante, filtres défilants, agenda par jours (en-têtes collants), fiche en feuille du bas.
- **Liste** : style Rappels, sections En retard / Aujourd’hui / Demain / Cette semaine / Semaine prochaine / Plus tard.
- **Connexion** : ordinateur = QR code à gauche, mail à droite ; mobile = mail puis validation sur l’appareil connecté s’il existe, sinon code par mail ; un seul champ de code.
- **Abonnement agenda** : boutons Google Agenda, Apple Calendrier, Outlook, copier le lien.
- **Fenêtres et champs** : feuille du bas sur mobile, actions dans un pied fixe, champs pleins à coins arrondis, anneau de focus visible.
- **Mails** : gabarit HTML compatible clients mail (tables), code en grand, bouton, rappel de l’appareil, pied.
