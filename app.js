import server from './src/main.js'
import tools from './src/tools.js'
import api from './src/api.js'

server.app.listen(tools.port(), () => {
  console.log(new Date(), ': Application started listening on port '+tools.port()+'...');
});

api.listen(tools.apiPort(), () => {
  console.log(new Date(), ': API server started listening on port '+tools.apiPort()+'...');
});

if (tools.metrics()) {
  server.metrics.listen(tools.metricsPort(), () => {
    console.log(new Date(), ': Metrics server started listening on port '+tools.metricsPort()+'...');
  });
}
