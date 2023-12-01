require('./k8s.mock').mock();
require('./k8s.mock').multi();
const fs = require('fs');
const k8s = require('@kubernetes/client-node');
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server.app);
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

describe('Multi cluster view and switch', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
  });
  it('should give 3 backup for first context and 0 for second', async () => {
    var res = await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');

    const cookie = res.get('set-cookie');
    res = await requestWithSupertest.get('/backups').set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(3);

    res = await requestWithSupertest.get('/').set('cookie', cookie);
    expect(res.status).toEqual(200);
    var dom = new JSDOM(res.text);
    var selector = dom.window.document.getElementById('contextselect');
    expect(selector.getElementsByTagName('option').length).toEqual(2);
    expect(selector.value).toEqual('first');

    res = await requestWithSupertest.get('/?context=second').set('cookie', cookie);
    expect(res.status).toEqual(200);
    var dom = new JSDOM(res.text);
    selector = dom.window.document.getElementById('contextselect');
    expect(selector.getElementsByTagName('option').length).toEqual(2);
    expect(selector.value).toEqual('second');

    res = await requestWithSupertest.get('/backups').set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(0);
  });
});
