const app = require('./main.js');

app.listen(process.env.APP_PORT | 3000, () => {
  console.log('Application started...')
});