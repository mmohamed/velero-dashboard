require('./k8s.mock').mock();
const k8s = require('@kubernetes/client-node');
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server.default.app);
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

describe('CSRF Token', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
  });
  it('should throw error for invalid/absent csrf token', async () => {
    const res = await requestWithSupertest.post('/login');
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/login?csrf-error');
  });
  it('should raccpet the request with valid csrf token', async () => {
    const res = await requestWithSupertest.get('/login');
    const cookie = res.get('set-cookie');
    var dom = new JSDOM(res.text);
    const token = dom.window.document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    const resLogin = await requestWithSupertest.post('/login').set('cookie', cookie).send({ _csrf: token });
    expect(resLogin.status).toEqual(200);
  });
});
