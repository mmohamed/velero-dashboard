const server = require('./src/main');
const tools = require('./src/tools');
const api = require('./src/api');

server.app.listen(tools.port(), () => {
  console.log(new Date(), ': Application started...');
});

api.listen(tools.apiPort(), () => {
  console.log(new Date(), ': API server started...');
});

if (tools.metrics()) {
  server.metrics.listen(tools.metricsPort(), () => {
    console.log(new Date(), ': Metrics server started...');
  });
}
