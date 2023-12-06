require('./k8s.mock').mock();
jest.mock('ldap-authentication');
const util = require('./test.util');
const k8s = require('@kubernetes/client-node');
const { authenticate } = require('ldap-authentication');
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server.app);

describe('Admin full access', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have access to resources', async () => {
    var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
    expect(auth.response.status).toEqual(302);
    expect(auth.response.get('Location')).toEqual('/');

    res = await requestWithSupertest.get('/backups').set('cookie', auth.cookie);
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
    var auth = await util.auth(requestWithSupertest, 'username', 'username');
    expect(auth.response.status).toEqual(302);
    expect(auth.response.get('Location')).toEqual('/');

    res = await requestWithSupertest.get('/backups').set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(1);
    expect(res.body[0].metadata.name).toEqual('backup-second');

    res = await requestWithSupertest.get('/restores').set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(1);
    expect(res.body[0].metadata.name).toEqual('second-restore-from-backup-second');

    res = await requestWithSupertest.get('/schedules').set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(1);
    expect(res.body[0].metadata.name).toEqual('second-schedules');
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
    var auth = await util.auth(requestWithSupertest, 'username', 'username');
    expect(auth.response.status).toEqual(302);
    expect(auth.response.get('Location')).toEqual('/');

    res = await requestWithSupertest.get('/backups').set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.length).toEqual(3);
  });
});
