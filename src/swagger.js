const swaggerJSDoc = require('swagger-jsdoc');
const tools = require('./tools.js');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'MyVelero API',
    version: '1.0.0',
    description: 'MyVelero API Description'
  },
  servers: [{ url: tools.apiSubPath() }] 
};

const options = { swaggerDefinition, apis: ['src/api.js', 'src/models/*.js'] };

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
