import app from './app.js';
import { startPrefetchScheduler } from './prefetch.js';

const port = Number(process.env.PORT || 5000);
app.listen(port, '127.0.0.1', () => {
  console.log(`CELCAT API: http://127.0.0.1:${port}/api`);
  // A long-running server plans the 02:00 / 14:00 refresh itself (PREFETCH=off to disable).
  if (process.env.PREFETCH !== 'off') startPrefetchScheduler();
});
