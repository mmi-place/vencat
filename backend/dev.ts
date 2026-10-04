import app from './app.js';

const port = Number(process.env.PORT || 5000);
app.listen(port, '127.0.0.1', () => {
  console.log(`CELCAT API: http://127.0.0.1:${port}/api`);
});
