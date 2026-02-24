import swaggerJSDoc from 'swagger-jsdoc'
import tools from './tools.js'

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'MyVelero API',
    version: '1.0.0',
    description: 'MyVelero API Description'
  },
  servers: [{ url: tools.apiSubPath() }],
  components: {
    securitySchemes: {
      basicAuth: {
        type: 'http',
        scheme: 'basic'
      }
    }
  },
  security: [{ basicAuth: [] }]
};

const options = { swaggerDefinition, apis: ['src/api.js', 'src/models/*.js'] };
const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
