<script setup lang="ts">
import AccessibleDialog from '../AccessibleDialog.vue';
import SubscribeButtons from './SubscribeButtons.vue';
import { ui, config } from '../../scripts/travaux';
import { selection } from '../../scripts/calendarStore';
// Terms of use and privacy page, and the calendar subscription link.
</script>
<template>
<AccessibleDialog v-if="ui.cgu" id="cgu-dialog" title="Conditions d’utilisation et confidentialité" wide @close="ui.cgu = false"><div class="legal">
  <p><strong>Vencat est un projet étudiant non officiel.</strong> L’IUT de Vélizy est au courant mais ne le valide pas : les informations des Travaux sont déclarées par les étudiants et peuvent être fausses. En cas de doute, la parole de l’enseignant et les plateformes officielles (Moodle, ENT, CELCAT) font foi.</p>
  <p class="muted">Dernière mise à jour : 26 novembre 2026.</p>

  <h3>Qui est responsable de tes données</h3>
  <p>MMI Place, association étudiante qui édite Vencat. Pour toute question sur tes données ou pour exercer tes droits, écris à <a v-if="config.contact" :href="'mailto:' + config.contact">{{ config.contact }}</a><template v-else>l’association (adresse de contact en cours de configuration)</template>. Nous répondons dans un délai d’un mois.</p>

  <h3>Les données que nous gardons</h3>
  <ul>
    <li><strong>Ton compte</strong> : adresse mail universitaire (se terminant par .uvsq.fr), prénom et nom (déduits du mail ou corrigés à ta demande), groupe, date de création et de dernière utilisation.</li>
    <li><strong>Tes contributions</strong> : travaux, propositions de modification, votes, signalements, corrections d’emploi du temps, avec leur historique.</li>
    <li><strong>Ton espace privé</strong> : cases « fait », notes et préférences d’affichage (thème, couleurs, options), qui te suivent d’un appareil à l’autre.</li>
    <li><strong>Tes appareils connectés</strong> : type d’appareil et de navigateur, date de dernière utilisation.</li>
    <li><strong>Tes retours</strong> : le message du formulaire « un retour sur la bêta », ton mail s’il est renseigné, et, si tu les joins, la page, le groupe, la version, le navigateur et la taille d’écran.</li>
    <li><strong>Traces techniques</strong> : une empreinte (hachage) de l’adresse IP sert à limiter les abus, dans des compteurs qui expirent en quelques minutes ou heures. Vencat ne conserve pas l’adresse IP elle-même (l’hébergeur peut en garder une trace temporaire dans ses journaux techniques).</li>
  </ul>
  <p>Rien d’autre, en plus des informations publiques de l’emploi du temps. Pas de publicité, pas de revente, pas de pistage, pas de mesure d’audience.</p>

  <h3>Pourquoi, et sur quelle base</h3>
  <ul>
    <li>Afficher les devoirs, rendus, évaluations et projets de ta promotion à côté de l’emploi du temps, et te laisser les suivre : <strong>exécution du service que tu demandes</strong> en créant un compte.</li>
    <li>Faire vérifier les informations collectivement, modérer et lutter contre les abus (votes de complaisance, fausses informations) : <strong>intérêt légitime</strong> de l’association et des étudiants à disposer d’informations fiables.</li>
    <li>Sécuriser les connexions et limiter les abus : <strong>intérêt légitime</strong>.</li>
    <li>Enregistrer ton acceptation de ces conditions et traiter tes retours : <strong>ton consentement</strong>, que tu peux retirer à tout moment en supprimant ton compte.</li>
  </ul>

  <h3>Qui voit quoi</h3>
  <ul>
    <li><strong>Tout le monde</strong>, même sans compte : le prénom et l’initiale du nom des auteurs des travaux (« Léa M. »).</li>
    <li><strong>Les élèves</strong> : les votes sont anonymes entre eux.</li>
    <li><strong>Les délégué(e)s validé(e)s</strong>, pour leur groupe : les votes avec le nom des votants, les signalements et la liste des élèves du groupe. Pas les adresses mail.</li>
    <li><strong>L’administration</strong> (quelques membres de l’association) : les comptes avec leur adresse mail, la modération, le journal des actions et les retours.</li>
    <li><strong>Toi seul(e)</strong> : tes notes privées, tes cases « fait » et tes préférences.</li>
  </ul>

  <h3>Combien de temps</h3>
  <ul>
    <li><strong>Compte</strong> : tant que tu l’utilises. Sans connexion pendant 11 mois, un mail te prévient ; sans réponse, le compte est supprimé au bout d’un an d’inactivité.</li>
    <li><strong>Appareils connectés</strong> : supprimés après 60 jours sans utilisation. <strong>Codes de connexion</strong> : 10 minutes.</li>
    <li><strong>Signalements traités, problèmes enregistrés, propositions closes et leurs votes</strong> : 90 jours.</li>
    <li><strong>Journal de modération, historique des travaux, retours</strong> : un an.</li>
    <li>À la suppression du compte, ton mail, ton nom, tes cases, notes, préférences, appareils et retours sont effacés. Tes contributions restent sous « Ancien étudiant » pour ne pas casser l’historique de la promo.</li>
  </ul>

  <h3>Où sont les données, et qui les héberge</h3>
  <ul>
    <li><strong>Vercel</strong> : hébergement du site et exécution du service, dans la région de Paris. Vercel est une société américaine : la relation est encadrée par un accord de sous-traitance et des clauses contractuelles types.</li>
    <li><strong>Neon</strong> : base de données, à Londres (le Royaume-Uni bénéficie d’une décision d’adéquation de la Commission européenne).</li>
    <li><strong>Upstash</strong> : compteurs temporaires anti-abus, à Francfort.</li>
    <li><strong>Oracle</strong> (Email Delivery, Paris) : envoi des mails de connexion.</li>
  </ul>
  <p>Ces prestataires n’utilisent pas tes données pour eux-mêmes.</p>

  <h3>Cookies et stockage sur ton appareil</h3>
  <p>Un seul cookie, strictement nécessaire : ta session de connexion (réservé au site, illisible par les scripts). Il n’y a donc pas de bandeau à valider. Ton appareil garde aussi tes réglages, tes cases et notes, et des copies de l’emploi du temps pour fonctionner hors ligne. Se déconnecter ou supprimer le compte efface ce qui est lié au compte.</p>

  <h3>Tes droits</h3>
  <ul>
    <li><strong>Accès et copie</strong> : « Mon compte › Données et compte › Télécharger mes données ».</li>
    <li><strong>Rectification</strong> : « Mon compte › Profil » (le changement de nom est validé par l’administration pour éviter les usurpations).</li>
    <li><strong>Effacement</strong> : « Mon compte › Données et compte › Supprimer mon compte », immédiat.</li>
    <li><strong>Opposition, limitation, retrait du consentement</strong> : par mail au contact ci-dessus.</li>
    <li><strong>Réclamation</strong> : si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener">cnil.fr</a>).</li>
  </ul>

  <h3>Sécurité</h3>
  <p>Connexion par code à usage unique (stocké haché, 5 essais), échanges chiffrés, accès d’administration limité et par code mail, journal des actions de modération. En cas de fuite de données qui te concernerait, nous te préviendrons et préviendrons la CNIL dans les délais légaux.</p>

  <h3>Règles</h3><ul><li>Pas de sujets ni de corrigés d’évaluation.</li><li>Pas de fausses informations, pas de votes de complaisance.</li><li>Une fausse déclaration (y compris une correction d’emploi du temps « certifiée sur l’honneur ») entraîne une sanction : signal discret, mail explicatif, lecture seule 7 jours, puis bannissement, avec contestation possible par mail.</li></ul>
</div></AccessibleDialog>
<AccessibleDialog v-if="ui.ics" id="ics-dialog" title="S’abonner aux travaux" :subtitle="'Travaux de ' + (selection?.promotion ?? '') + ' ' + (selection?.label ?? '') + ', rappel la veille'" @close="ui.ics = false"><SubscribeButtons open /></AccessibleDialog>
</template>
