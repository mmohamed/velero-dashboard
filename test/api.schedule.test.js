require('./k8s.mock').mock();
const util = require('./test.util');
const axios = require('axios');
const k8s = require('@kubernetes/client-node');
const zlib = require('zlib');
const supertest = require('supertest');
const api = require('./../src/api');
const requestWithSupertest = supertest(api);

jest.mock('axios');

describe('Schedules get', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have access to 2 schedules', async () => {
    var res = await requestWithSupertest.get('/v1/schedules').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(2);
  });
});

describe('Schedules create', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and create a valid backup', async () => {
    var res = await requestWithSupertest.post('/v1/schedules').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.body.errors).toEqual(['name', 'cron', 'includeNamespaces', 'backupRetention', 'backupLocation']);

    var scheduleData = {
      name: 'new-schedule',
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
      selectors: [{ name: 'my-label/api', value: 'bd' }],
      cron: '-1',
      ownerReferenceInBackup: false,
      paused: true
    };

    res = await requestWithSupertest.post('/v1/schedules').send(scheduleData).auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.body.errors).toEqual(['cron']);

    scheduleData.cron = '* * * * *';
    res = await requestWithSupertest.post('/v1/schedules').send(scheduleData).auth('admin', 'admin');
    expect(res.status).toEqual(201);
    expect(res.body.errors.length).toEqual(0);
  });
});

describe('Schedules delete', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and delete a valid schedule', async () => {
    var res = await requestWithSupertest.delete('/v1/schedules/notfound').send().auth('admin', 'admin');
    expect(res.status).toEqual(404);

    res = await requestWithSupertest.delete('/v1/schedules/first-schedules').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(true);
  });
});

describe('Schedule execute', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and create a backup from schedule', async () => {
    var res = await requestWithSupertest.put('/v1/schedules/notfound/execute').send().auth('admin', 'admin');
    expect(res.status).toEqual(404);
    res = await requestWithSupertest.put('/v1/schedules/first-schedules/execute').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(true);
  });
});

describe('Schedule toggle', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and toggle the schedule state', async () => {
    var res = await requestWithSupertest.put('/v1/schedules/notfound/toggle').send().auth('admin', 'admin');
    expect(res.status).toEqual(404);
    res = await requestWithSupertest.put('/v1/schedules/first-schedules/toggle').send().auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(true);
    expect(res.body.paused).toBe(false);
  });
});
