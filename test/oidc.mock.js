const { Issuer } = require('openid-client');

const oidc = {
  enable: function () {
    process.env.OIDC_CONFIG_PATH = __dirname + require('path').sep + '..' + require('path').sep + 'oidc.json.dist';
    Issuer.discover.mockReturnValue({
      Client: class {
        authorizationUrl() {
          return '/authorizationurl';
        }
        callbackParams() {
          return {};
        }
        callback() {
          return {
            claims: function () {
              return {
                aud: 'authorization-code-client-id',
                sub: '123',
                name: 'OIDC User',
                email: 'mock@test.com'
              };
            }
          };
        }
      }
    });
  }
};
module.exports = oidc;
