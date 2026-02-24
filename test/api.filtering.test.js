require('./k8s.mock').mock();
jest.mock('ldap-authentication');
const util = require('./test.util');
const k8s = require('@kubernetes/client-node');
const { authenticate } = require('ldap-authentication');
const supertestsession = require('supertest-session');
const api = require('./../src/api.js');
const requestWithSupertest = supertestsession(api.default);

describe('Admin full access', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have access to resources', async () => {
    var res = await requestWithSupertest.get('/v1/backups').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(3);
  });
});

describe('User filtred access', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = 'ldap://fake:636';
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = '';
    process.env.ADMIN_PASSWORD = '';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have access to resources', async () => {
    authenticate.mockReturnValue({
      memberOf: ['group1', 'group2'],
      gecos: 'username'
    });
    var res = await requestWithSupertest.get('/v1/backups').auth('username', 'username');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(1);
    expect(res.body[0].name).toEqual('backup-second');

    res = await requestWithSupertest.get('/v1/restores').auth('username', 'username');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(1);
    expect(res.body[0].name).toEqual('second-restore-from-backup-second');

    res = await requestWithSupertest.get('/v1/schedules').auth('username', 'username');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(1);
    expect(res.body[0].name).toEqual('second-schedules');
  });
});

describe('User with filtering feature disabled', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = 'ldap://fake:636';
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = '';
    process.env.ADMIN_PASSWORD = '';
    process.env.NAMESPACE_FILTERING = false;
  });
  it('should have access to resources', async () => {
    authenticate.mockReturnValue({
      memberOf: ['group1', 'group2'],
      gecos: 'username'
    });
    var res = await requestWithSupertest.get('/v1/backups').auth('username', 'username');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(3);
  });
});
