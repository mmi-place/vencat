<script setup lang="ts">
import { computed, ref } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import { ui, config } from '../../scripts/travaux';
import { selection } from '../../scripts/calendarStore';
// Terms of use and privacy page, and the calendar subscription link.
const icsUrl = computed(() => selection.value ? `${location.origin}/api/travaux/ics/${selection.value.id}.ics` : '');
const webcal = computed(() => icsUrl.value.replace(/^https?:/, 'webcal:'));
const copied = ref(false);
async function copy() { try { await navigator.clipboard.writeText(icsUrl.value); copied.value = true; setTimeout(() => copied.value = false, 2000); } catch { copied.value = false; } }
</script>
<template>
<AccessibleDialog v-if="ui.cgu" id="cgu-dialog" title="Conditions d’utilisation et confidentialité" wide @close="ui.cgu = false"><div class="legal">
  <p><strong>Vencat est un projet étudiant non officiel.</strong> L’IUT de Vélizy est au courant mais ne le valide pas : les informations des Travaux sont déclarées par les étudiants et peuvent être fausses. En cas de doute, la parole de l’enseignant et les plateformes officielles (Moodle, ENT, CELCAT) font foi.</p>
  <h3>Responsable</h3><p>MMI Place, association étudiante qui édite Vencat.<template v-if="config.contact"> Contact : <a :href="'mailto:' + config.contact">{{ config.contact }}</a>.</template></p>
  <h3>Données collectées</h3><ul><li>Ton adresse mail universitaire (se terminant par .uvsq.fr).</li><li>Ton prénom et ton nom, déduits du mail ou corrigés à ta demande.</li><li>Le groupe que tu déclares.</li><li>Tes contributions (travaux, votes, signalements, corrections) et leur historique, tes cases « fait » et notes privées, la liste de tes appareils connectés.</li></ul><p>Rien d’autre, en plus des informations publiques de l’emploi du temps. Pas de publicité, pas de revente, pas de pistage.</p>
  <h3>Finalité</h3><p>Afficher les devoirs, rendus, évaluations et projets d’une promotion à côté de l’emploi du temps, les faire vérifier collectivement et lutter contre les abus.</p>
  <h3>Visibilité</h3><p>Le nom des auteurs est visible par tous, y compris sans connexion. Les votes sont anonymes entre élèves, visibles par les délégués et l’admin. Les notes privées et les cases « fait » ne sont visibles que par toi.</p>
  <h3>Durée de conservation</h3><p>Le compte est conservé tant que tu l’utilises, au plus jusqu’à la fin de ta formation. Les codes de connexion expirent en 10 minutes. Le journal de modération est conservé un an.</p>
  <h3>Tes droits</h3><p>Accès, rectification (correction du nom) et suppression : depuis « Mon compte ». La suppression efface immédiatement ton mail et ton nom ; tes contributions restent sous « Ancien étudiant » pour ne pas casser l’historique de la promo.</p>
  <h3>Règles</h3><ul><li>Pas de sujets ni de corrigés d’évaluation.</li><li>Pas de fausses informations, pas de votes de complaisance.</li><li>Une fausse déclaration (y compris une correction d’emploi du temps « certifiée sur l’honneur ») entraîne une sanction : signal discret, mail explicatif, lecture seule 7 jours, puis bannissement, avec contestation possible par mail.</li></ul>
</div></AccessibleDialog>
<AccessibleDialog v-if="ui.ics" id="ics-dialog" title="Abonnement agenda" @close="ui.ics = false"><div class="work-form">
  <p>Ajoute les travaux de <strong>{{ selection?.promotion }} {{ selection?.label }}</strong> à Google Agenda, Apple Calendrier ou Outlook, avec un rappel la veille. Il remplace les notifications.</p>
  <label class="settings-label">Lien d’abonnement<input :value="icsUrl" readonly @focus="($event.target as HTMLInputElement).select()"></label>
  <div class="button-row"><button @click="copy">{{ copied ? 'Copié' : 'Copier le lien' }}</button><a class="button-link" :href="webcal">Ouvrir dans l’agenda</a><a class="button-link" :href="'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal)" target="_blank" rel="noopener">Google Agenda</a></div>
  <p class="muted">Google : Autres agendas › + › À partir de l’URL. Outlook : Ajouter un calendrier › S’abonner à partir du web. L’agenda se met à jour toutes les quelques heures.</p>
</div></AccessibleDialog>
</template>
