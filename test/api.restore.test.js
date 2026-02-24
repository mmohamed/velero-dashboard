require('./k8s.mock').mock();
const util = require('./test.util');
const axios = require('axios');
const k8s = require('@kubernetes/client-node');
const zlib = require('zlib');
const supertestsession = require('supertest-session');
const api = require('./../src/api');
const requestWithSupertest = supertestsession(api.default);

jest.mock('axios');

describe('Restores get', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have access to 3 restores', async () => {
    var res = await requestWithSupertest.get('/v1/restores').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(3);
  });
});

describe('Restores create from backup', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and create a restore from a backup', async () => {
    var res = await requestWithSupertest.put('/v1/backups/notfound/restore').send().auth('admin', 'admin');
    expect(res.status).toEqual(404);
    res = await requestWithSupertest.put('/v1/backups/backup-first/restore').send().auth('admin', 'admin');
    expect(res.status).toEqual(201);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(true);
  });
});

describe('Restores result show', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and get a valid restore result and log', async () => {
    res = await requestWithSupertest.get('/v1/restores/notfound/log').auth('admin', 'admin');
    expect(res.status).toEqual(404);
    var data = {
      errors: ['error 1', 'error 2'],
      warnings: {
        namespace: ['waning 1', 'warning 2']
      }
    };
    axios.get.mockImplementation(function (url) {
      if (url === 'http://fakeurl/result') {
        return Promise.resolve({ data: zlib.gzipSync(JSON.stringify(data)) });
      }
      return Promise.resolve({ data: zlib.gzipSync('one-line-logs') });
    });
    res = await requestWithSupertest.get('/v1/restores/first-restore-from-backup-first/log').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.result.warnings.namespace.length).toEqual(2);
    expect(res.body.result.errors.length).toEqual(2);
    expect(res.body.logs).toEqual('one-line-logs');
  });
});
