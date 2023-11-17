const server = require('./src/main');
const tools = require('./src/tools');

server.app.listen(tools.port(), () => {
  console.log(new Date(), ': Application started...');
});

if (tools.metrics()) {
  server.metrics.listen(tools.metricsPort(), () => {
    console.log(new Date(), ': Metrics server started...');
  });
}
