<script setup lang="ts">
// Keyboard reference, shown in the "?" window and in Settings > Accessibility.
const groups = [
  { title: 'Partout', keys: [
    ['Tab / Maj + Tab', 'Commande suivante / précédente'], ['Entrée / Espace', 'Activer la commande ou ouvrir le cours'],
    ['Échap', 'Fermer la fenêtre et revenir à la commande d’origine'], ['Alt maintenu', 'Afficher les touches sur les boutons'],
  ] },
  { title: 'Planning', keys: [
    ['← / →', 'Jour ou semaine précédente / suivante (hors cours et groupes de boutons)'], ['Page préc. / Page suiv.', 'Jour ou semaine précédente / suivante'],
    ['T', 'Aujourd’hui'], ['L / J / S', 'Vue Liste / Jour / Semaine'], ['P', 'Aller au cours en cours ou au prochain'],
    ['/', 'Recherche'], ['G', 'Changer de groupe'], ['C', 'Changements du planning'], ['?', 'Cette aide'],
  ] },
  { title: 'Sur un cours', keys: [
    ['↑ / ↓', 'Cours précédent / suivant de la journée'], ['← / →', 'Journée voisine, au plus près du même horaire'],
    ['Début / Fin', 'Premier / dernier cours du jour'], ['Ctrl + Début / Fin', 'Premier / dernier cours affiché'],
    ['← / → dans le détail', 'Cours précédent / suivant'],
  ] },
  { title: 'Combinaisons toujours actives', keys: [
    ['Alt + Maj + F / G / S', 'Recherche / groupe / réglages'], ['Alt + Maj + A / C / T', 'Accessibilité / changements / aujourd’hui'],
    ['Alt + Maj + 1 / 2 / 3', 'Vue Liste / Jour / Semaine'], ['Alt + Maj + ← / →', 'Période précédente / suivante'],
  ] },
] as const;
</script>
<template>
<div class="keyboard-reference">
  <section v-for="group in groups" :key="group.title"><h3>{{ group.title }}</h3>
    <dl class="keyboard-help"><template v-for="[key, action] in group.keys" :key="key"><dt><kbd>{{ key }}</kbd></dt><dd>{{ action }}</dd></template></dl>
  </section>
  <p class="muted">Les touches simples (lettres, / et ?) peuvent être désactivées dans Réglages › Accessibilité. Elles restent inactives pendant la saisie et dans les fenêtres ouvertes.</p>
</div>
</template>
