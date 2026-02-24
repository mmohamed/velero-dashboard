const { discovery } = require('openid-client');
const {buildAuthorizationUrl, authorizationCodeGrant} = require('openid-client');

const oidc = {
  enable: function () {
    process.env.OIDC_CONFIG_PATH = __dirname + require('path').sep + '..' +require('path').sep +'oidc.json.dist';
    discovery.mockReturnValue(async function(){ return { mocked: true } });
    buildAuthorizationUrl.mockReturnValue('/authorizationurl');
    authorizationCodeGrant.mockReturnValue({ claims: async function(){
        return {
            sub: '123',
            name: 'OIDC User',
            email: 'mock@test.com'
        }
    } });
  },
};
module.exports = oidc;
