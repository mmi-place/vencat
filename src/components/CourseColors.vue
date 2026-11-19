<script setup lang="ts">
import { computed } from 'vue';
import { preferences, savedCourses, keyColor } from '../scripts/calendarStore';
import { palettes, paletteById, paletteColor, courseTypes } from '../scripts/palettes';
const palette = computed(() => paletteById(preferences.value.palette));
const keys = computed(() => preferences.value.colorMode === 'type'
  ? [...new Set([...courseTypes, ...savedCourses.value.map(course => course.type)])]
  : [...new Set(savedCourses.value.map(course => course.module).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')));
const label = (key: string) => key === 'inconnu' ? 'Autre' : key;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const inPalette = (key: string) => palette.value.colors.some(color => same(color.value, keyColor(key)));
// Choosing the palette's own colour removes the personal choice, so a later palette change applies again.
function choose(key: string, value: string) {
  const mode = preferences.value.colorMode, id = `${mode}:${key}`;
  if (same(value, paletteColor(preferences.value.palette, mode, key))) delete preferences.value.colors[id];
  else preferences.value.colors[id] = value.toLowerCase();
}
const customized = computed(() => Object.keys(preferences.value.colors).some(id => id.startsWith(preferences.value.colorMode + ':')));
</script>
<template>
<section class="settings-section course-colors">
  <h3>Couleurs des cours</h3>
  <label>Colorer selon<select v-model="preferences.colorMode"><option value="type">Le type de cours</option><option value="module">La matière</option></select></label>
  <fieldset class="palette-picker">
    <legend>Palette</legend>
    <label v-for="item in palettes" :key="item.id" class="palette-option">
      <input v-model="preferences.palette" type="radio" name="course-palette" :value="item.id">
      <span class="palette-strip" aria-hidden="true"><span v-for="color in item.colors" :key="color.value" :style="{ background: color.value }"></span></span>
      <span class="palette-text"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
    </label>
  </fieldset>
  <div class="color-keys">
    <fieldset v-for="key in keys" :key="key" class="color-key">
      <legend>{{ label(key) }}</legend>
      <div class="swatches">
        <label v-for="color in palette.colors" :key="color.value" class="swatch" :style="{ '--swatch': color.value }" :title="color.name">
          <input type="radio" :name="'course-color-' + key" :checked="same(color.value, keyColor(key))" @change="choose(key, color.value)">
          <span class="sr-only">{{ color.name }}</span>
        </label>
        <label class="swatch free-swatch" :class="{ chosen: !inPalette(key) }" :style="{ '--swatch': keyColor(key) }" title="Couleur libre">
          <input type="color" :value="keyColor(key)" @change="choose(key, ($event.target as HTMLInputElement).value)">
          <span class="sr-only">Couleur libre pour {{ label(key) }}{{ inPalette(key) ? '' : ', choisie' }}</span>
        </label>
      </div>
    </fieldset>
  </div>
  <p v-if="!keys.length" class="muted">Les matières apparaissent ici après le chargement du planning.</p>
  <p class="muted">Le texte des cartes s’adapte à la couleur pour rester lisible, et le type reste écrit sur chaque carte.</p>
  <button v-if="customized" @click="preferences.colors = Object.fromEntries(Object.entries(preferences.colors).filter(([id]) => !id.startsWith(preferences.colorMode + ':')))">Revenir aux couleurs de la palette</button>
</section>
</template>
