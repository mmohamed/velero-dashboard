require('./k8s.mock').mock();
console.error = function () {};
const util = require('./test.util');
const k8s = require('@kubernetes/client-node');
const supertest = require('supertest');
const api = require('./../src/api.js');
const requestWithSupertest = supertest(api);

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
    process.env.TEST_THROW_READ_ERROR = true;

    var res = await requestWithSupertest.get('/v1/backups').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(0);

    res = await requestWithSupertest.get('/v1/restores').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(0);

    res = await requestWithSupertest.get('/v1/schedules').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(0);

    res = await requestWithSupertest.get('/v1/status').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.isReady).toBe(false);

    res = await requestWithSupertest.post('/v1/backups').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);
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
    var res = await requestWithSupertest.post('/v1/backups').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);

    res = await requestWithSupertest.delete('/v1/backups/backup-first').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(false);

    res = await requestWithSupertest.delete('/v1/schedules/first-schedules').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(true);

    res = await requestWithSupertest.get('/v1/restores/first-restore-from-backup-first/log').auth('admin', 'admin');
    expect(res.status).toEqual(503);

    res = await requestWithSupertest.get('/v1/backups/backup-first/log').auth('admin', 'admin');
    expect(res.status).toEqual(503);

    res = await requestWithSupertest.put('/v1/schedules/first-schedules/toggle').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(false);

    res = await requestWithSupertest.put('/v1/schedules/first-schedules/execute').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(false);
  });
});
