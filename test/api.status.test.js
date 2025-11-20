require('./k8s.mock').mock();
const util = require('./test.util');
const axios = require('axios');
const k8s = require('@kubernetes/client-node');
const zlib = require('zlib');
const supertest = require('supertest');
const api = require('./../src/api');
const requestWithSupertest = supertest(api);

jest.mock('axios');

describe('Status get', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should get global status', async () => {
    var res = await requestWithSupertest.get('/v1/status').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.isReady).toEqual(true);
    expect(res.body.isReadOnly).toEqual(false);
    expect(res.body.backupStorageLocations[0].status).toEqual('Available');
    expect(res.body.backupStorageLocations[0].lastSync).toEqual('2023-11-06T14:09:49Z');
    expect(res.body.backupStorageLocations[0].name).toEqual('default');
    expect(res.body.volumeSnapshotLocations[0].status).toEqual('unknown');
    expect(res.body.volumeSnapshotLocations[0].lastSync).toEqual('unknown');
    expect(res.body.volumeSnapshotLocations[0].name).toEqual('default');
  });
});
