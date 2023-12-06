require('./k8s.mock').mock();
const util = require('./test.util');
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server.app);

describe('SubPath APP', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.APP_SUB_PATH = '/subpath-of-my-velero';
  });
  it('should redirect to homepage/login with subpath', async () => {
    var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
    expect(auth.response.status).toEqual(302);
    expect(auth.response.get('Location')).toEqual('/subpath-of-my-velero/');

    const resHome = await requestWithSupertest.get('/').set('cookie', auth.cookie);
    expect(resHome.status).toEqual(200);
    expect(resHome.text).toEqual(expect.stringContaining('Hello admin'));

    const resLogout = await requestWithSupertest.get('/logout').set('cookie', auth.cookie);
    expect(resLogout.status).toEqual(302);
    expect(resLogout.get('Location')).toEqual('/subpath-of-my-velero/login');
  });
});
