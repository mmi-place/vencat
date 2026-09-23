<script setup lang="ts">
import { watch, onMounted } from "vue";
import { RouterView } from "vue-router";

import { backgroundViewMode } from "@/scripts/logic";

const updateBackground = (newMode: string) => {
	const body = document.body;

	switch (newMode) {
		case "image":
			body.className = "bg-image"
			break;
		case "image-darker":
			body.className = "bg-image-darker"
			break;
		case "image-blurried":
			body.className = "bg-image-blurried"
			break;
		case "unified":
			body.className = "bg-unified"
			break;
	}
};


onMounted(() => {
	updateBackground(backgroundViewMode.value);
});

watch(backgroundViewMode, updateBackground);
</script>
<template>
	<RouterView />
</template>
