require('./k8s.mock').mock();
jest.mock('ldap-authentication');
const util = require('./test.util');
const axios = require('axios');
const k8s = require('@kubernetes/client-node');
const { authenticate } = require('ldap-authentication');
const zlib = require('zlib');
const supertest = require('supertest');
const api = require('./../src/api');
const requestWithSupertest = supertest(api);

jest.mock('axios');

describe('Backups get', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have access to 3 backups', async () => {
    var res = await requestWithSupertest.get('/v1/backups').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(3);
  });
});

describe('Backups create', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = 'ldap://fake:636';
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = '';
    process.env.ADMIN_PASSWORD = '';
    process.env.AUDIT_LOG = 'true';
    process.env.READ_ONLY_USER = 'false';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and create a valid backup', async () => {
    authenticate.mockReturnValue({
      memberOf: ['group1', 'group2'],
      gecos: 'username'
    });

    var res = await await requestWithSupertest.post('/v1/backups').send().auth('username', 'username');
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.status).toEqual(200);
    expect(res.body.errors).toEqual(['name', 'includeNamespaces', 'backupRetention', 'backupLocation']);

    var backupData = {
      name: 'new-backup',
      includeNamespaces: ['ns1', 'ns2'],
      includeResources: ['deployments', 'secrets'],
      excludeNamespaces: ['ns3'],
      excludeResources: ['job'],
      backupRetention: 60,
      snapshot: true,
      includeClusterResources: true,
      defaultVolumeToFS: true,
      backuplabels: 'app:test',
      useselector: 'app:test,ver:v1',
      backupLocation: 'default',
      snapshotLocation: 'default',
      labels: [{ name: 'my-label/api', value: 'first' }],
      selectors: [{ name: 'my-label/api', value: 'bd' }]
    };

    res = await requestWithSupertest.post('/v1/backups').send(backupData).auth('username', 'username');
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.status).toEqual(200);
    expect(res.body.errors).toEqual(['includeNamespaces']);

    backupData.includeNamespaces = ['ns1', 'ns3'];
    res = await requestWithSupertest.post('/v1/backups').send(backupData).auth('username', 'username');
    expect(res.status).toEqual(201);
    expect(res.body.errors).toEqual([]);
  });
});

describe('Backups delete', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and delete a valid backup', async () => {
    var res = await requestWithSupertest.delete('/v1/backups/backupignored').send().auth('admin', 'admin');
    expect(res.status).toEqual(404);
    res = await requestWithSupertest.delete('/v1/backups/backup-first').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(true);
  });
});

describe('Backups result show', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and get a valid backup result and log', async () => {
    var res = await requestWithSupertest.get('/v1/backups/notfound/log').auth('admin', 'admin');
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
    res = await requestWithSupertest.get('/v1/backups/backup-first/log').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.result.warnings.namespace.length).toEqual(2);
    expect(res.body.result.errors.length).toEqual(2);
    expect(res.body.logs).toEqual('one-line-logs');
  });
});
