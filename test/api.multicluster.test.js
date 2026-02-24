require('./k8s.mock').mock();
require('./k8s.mock').multi();
const util = require('./test.util');
const fs = require('fs');
const k8s = require('@kubernetes/client-node');
const supertestsession = require('supertest-session');
const api = require('./../src/api.js');
const requestWithSupertest = supertestsession(api.default);
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
    var res = await requestWithSupertest.get('/v1/backups').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(3);

    res = await requestWithSupertest.get('/v1/status').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.body.contexts.length).toEqual(2);
    expect(res.body.currentContext).toEqual('first');

    res = await requestWithSupertest.get('/v1/status?context=second').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.body.currentContext).toEqual('second');

    res = await requestWithSupertest.get('/v1/backups?context=second').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(0);
  });
});
