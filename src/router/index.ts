import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
export default createRouter({ history: createWebHistory(), routes: [{ path: '/admin', component: () => import('../views/AdminView.vue') }, { path: '/:pathMatch(.*)*', component: HomeView }] });
