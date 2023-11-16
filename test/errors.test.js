require('./k8s.mock').mock();
console.error = function () {};

const k8s = require('@kubernetes/client-node');
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server.app);
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

describe('Managing partial server errors 1', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    // testing env var
    process.env.TEST_THROW_READ_ERROR = true;
    process.env.TEST_THROW_CHANGE_ERROR = false;
  });
  it('should be logged to console on read action', async () => {
    var res = await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');

    const cookie = res.get('set-cookie');
    process.env.TEST_THROW_READ_ERROR = true;
    res = await requestWithSupertest.get('/backups').set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(0);

    res = await requestWithSupertest.get('/restores').set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(0);

    res = await requestWithSupertest.get('/schedules').set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(0);

    res = await requestWithSupertest.get('/status').set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.isReady).toBe(false);

    res = await requestWithSupertest.post('/backup/new').set('cookie', cookie);
    expect(res.status).toEqual(200);
    const dom = new jsdom.JSDOM(res.text);
    expect(dom.window.document.querySelector('parsererror')).toBe(null);
  });
});

describe('Managing partial server errors 2', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    // testing env var
    process.env.TEST_THROW_READ_ERROR = false;
    process.env.TEST_THROW_CHANGE_ERROR = true;
  });
  it('should be logged to console on write action', async () => {
    var res = await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');

    const cookie = res.get('set-cookie');

    res = await requestWithSupertest.post('/backup/new').set('cookie', cookie);
    expect(res.status).toEqual(200);
    const dom = new jsdom.JSDOM(res.text);
    expect(dom.window.document.querySelector('parsererror')).toBe(null);

    res = await requestWithSupertest.delete('/backups').send({ backup: 'backup-first' }).set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(false);

    res = await requestWithSupertest.delete('/schedules').send({ schedule: 'first-schedules' }).set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(true);

    res = await requestWithSupertest.get('/restores/result/first-restore-from-backup-first').set('cookie', cookie);
    expect(res.status).toEqual(200);

    res = await requestWithSupertest.get('/backups/result/backup-first').set('cookie', cookie);
    expect(res.status).toEqual(200);

    res = await requestWithSupertest.post('/schedules/toggle').send({ schedule: 'first-schedules' }).set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(false);

    res = await requestWithSupertest.post('/schedules/execute').send({ schedule: 'first-schedules' }).set('cookie', cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(false);
  });
});
