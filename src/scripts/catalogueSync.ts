import { watch } from 'vue';
import { selection } from './calendarStore';
import { loadCourseCatalogue } from './catalogue';

// Warm only the selected department, even before a course detail is opened.
watch(() => selection.value?.department, department => {
  if (department) void loadCourseCatalogue(department);
}, { immediate: true });
