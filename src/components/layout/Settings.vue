<script setup lang="ts">
import { AcademicCapIcon, XMarkIcon } from "@heroicons/vue/16/solid";
import { DocumentDuplicateIcon } from "@heroicons/vue/24/outline";

import {
	groups,
	dept_id,
	promo_id,
	group_id,
} from "@/scripts/utils";

const emit = defineEmits<{
	(e: "close"): void;
}>();

const getAvailablePromos = (): string[] => {
	const promos = groups[dept_id.value];
	return promos ? Object.keys(promos) : [];
};

const getAvailableGroups = (): [string, string][] => {
	const dept = groups[dept_id.value];
	const promos = dept?.[promo_id.value];
	return promos ? Object.entries(promos) : [];
};

const copyToClipboard = () => {
	navigator.clipboard.writeText(`webcals://celcat.iut-velizy.uvsq.fr/cal/ical/${group_id.value}/schedule.ics`);
	alert("Lien copié ! Collez-le dans votre application de calendrier pour vous abonner à l'emploi du temps sur votre téléphone.");
};
</script>
<template>
	<section
		class="select-none fixed top-0 z-500 bg-slate-300/60 backdrop-blur-md w-screen h-screen dark:bg-slate-950/60 md:flex md:flex-col md:items-center md:justify-center"
	>
		<div
			class="bg-slate-100 text-slate-950 font-bold shadow-2xl p-6 space-y-4 max-md:h-screen md:rounded-4xl md:min-w-1/2 md:p-8 lg:min-w-1/3 dark:bg-slate-900 dark:text-white"
		>
			<div class="flex items-center">
				<h2 class="grow text-2xl font-bold">Préférences</h2>
				<div
					class="cursor-pointer flex items-center gap-1 bg-red-500 text-white text-sm font-semibold rounded-full p-1.5 duration-300 dark:bg-white/5 hover:scale-105"
					v-on:click="emit('close')"
				>
					<XMarkIcon class="w-3.5 h-3.5" />
				</div>
			</div>
			<div class="flex items-center gap-1">
				<AcademicCapIcon class="w-6 h-6" />
				<select
					v-model="dept_id"
					class="bg-slate-500/20 text-sm font-bold rounded-xl px-3 py-2 cursor-pointer"
				>
					<option value="MMI">MMI</option>
					<option value="INF">INFO</option>
					<option value="RT">RT</option>
					<option value="GEII">GEII</option>
				</select>
				<select
					v-model="promo_id"
					class="bg-slate-500/10 text-sm font-medium rounded-xl px-3 py-2 cursor-pointer"
				>
					<option
						v-for="promo in getAvailablePromos()"
						:key="promo"
						:value="promo"
					>
						{{ promo }}
					</option>
				</select>
				<select
					v-model="group_id"
					class="bg-slate-500/10 text-sm font-medium rounded-xl px-3 py-2 cursor-pointer"
				>
					<option
						v-for="[group, id] of getAvailableGroups()"
						:key="id"
						:value="id"
					>
						{{ group }}
					</option>
				</select>
				<!--DocumentDuplicateIcon
					class="w-4 h-4 cursor-pointer duration-150"
					@click="copyToClipboard"
				/-->
			</div>

			<div class="space-y-2">
				<p class="text-sm">
					Ce site est un projet étudiant et n'est affilié à l'IUT de
					Vélizy ni à l'UVSQ, ni à quelconque organisme officiel.
				</p>
				<p class="text-sm font-medium">
					© Loan JEAN, Bastian NOËL |
					<a
						href="https://mmi.place"
						target="_blank"
						class="underline decoration-transparent hover:decoration-inherit"
						>MMI Place</a
					>
					2025-2026
				</p>
			</div>
		</div>
	</section>
</template>
