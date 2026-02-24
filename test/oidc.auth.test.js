jest.mock('openid-client')
require('./oidc.mock').enable();
const { discovery } = require('openid-client');
const {buildAuthorizationUrl, authorizationCodeGrant} = require('openid-client');
const supertestsession = require('supertest-session');
const server = require('./../src/main.js');
const requestWithSupertest = supertestsession(server.default.app);

describe('OIDC User Login / Logout actions', () => {
  beforeAll(() => {
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = '';
    process.env.ADMIN_PASSWORD = '';
  });
  it('should process flow', async () => {
    const res = await requestWithSupertest.get('/auth/oidc');
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/authorizationurl');

    const callbackRes = await requestWithSupertest.get('/auth/oidc/callback?code=fake&state=fake');
    expect(callbackRes.status).toEqual(302);
    
    expect(authorizationCodeGrant).toHaveBeenCalled();

    expect(callbackRes.status).toEqual(302);
    expect(callbackRes.get('Location')).toEqual('/');

    const resHome = await requestWithSupertest.get('/');
    expect(resHome.status).toEqual(200);
    expect(resHome.text).toEqual(expect.stringContaining('Hello'));
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
});
