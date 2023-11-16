require('./k8s.mock').mock();
jest.mock('ldap-authentication');

const axios = require('axios');
const k8s = require('@kubernetes/client-node');
const { authenticate } = require('ldap-authentication');
const zlib = require('zlib');
const supertest = require('supertest');
const server = require('./../src/main');
const requestWithSupertest = supertest(server.app);
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

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
  it('should have access to 2 backups', async () => {
    var res = await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');

    const cookie = res.get('set-cookie');
    res = await requestWithSupertest.get('/backups').set('cookie', cookie);
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
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and create a valid backup', async () => {
    authenticate.mockReturnValue({
      memberOf: ['group1', 'group2'],
      gecos: 'username'
    });

    var res = await requestWithSupertest.post('/login').send({ username: 'username', password: 'username' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');

    const cookie = res.get('set-cookie');
    res = await requestWithSupertest.get('/backup/new').set('cookie', cookie);
    expect(res.status).toEqual(200);
    var dom = new JSDOM(res.text);
    const form = dom.window.document.querySelector('form');
    expect(form.getAttribute('id')).toBe('new-backup-form');

    res = await requestWithSupertest.post('/backup/new').set('cookie', cookie);
    expect(res.status).toEqual(200);
    dom = new JSDOM(res.text);
    const inputs = dom.window.document.getElementsByClassName('is-invalid');
    expect(inputs.length).toEqual(4);

    var backupData = {
      name: 'new-backup',
      includenamespace: ['ns1', 'ns2'],
      includeresources: 'deployments,secrets',
      excludenamespace: ['ns3'],
      excluderesources: 'job',
      retention: '60',
      snapshot: '1',
      cluster: '1',
      fsbackup: '1',
      backuplabels: 'app:test',
      useselector: 'app:test,ver:v1',
      backuplocation: 'default',
      snapshotlocation: 'default'
    };
    res = await requestWithSupertest.post('/backup/new').send(backupData).set('cookie', cookie);
    expect(res.status).toEqual(200);
    dom = new JSDOM(res.text);
    const filteringErrors = dom.window.document.getElementsByClassName('is-invalid');
    expect(filteringErrors.length).toEqual(1);
    expect(filteringErrors[0].getAttribute('id')).toEqual('includenamespace');

    backupData.includenamespace = ['ns1', 'ns3'];
    res = await requestWithSupertest.post('/backup/new').send(backupData).set('cookie', cookie);
    expect(res.status).toEqual(201);
    dom = new JSDOM(res.text);
    const errors = dom.window.document.getElementsByClassName('is-invalid');
    expect(errors.length).toEqual(0);
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
    var res = await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');

    const cookie = res.get('set-cookie');
    res = await requestWithSupertest.delete('/backups').send({ backupignored: 'notfound' }).set('cookie', cookie);
    expect(res.status).toEqual(404);
    res = await requestWithSupertest.delete('/backups').send({ backup: 'notfound' }).set('cookie', cookie);
    expect(res.status).toEqual(404);
    res = await requestWithSupertest.delete('/backups').send({ backup: 'backup-first' }).set('cookie', cookie);
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
    var res = await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');

    const cookie = res.get('set-cookie');
    res = await requestWithSupertest.get('/backups/result/').set('cookie', cookie);
    expect(res.status).toEqual(404);
    res = await requestWithSupertest.get('/backups/result/notfound').set('cookie', cookie);
    expect(res.status).toEqual(404);
    var data = {
      errors: ['error 1', 'error 2'],
      warnings: {
        namspace: ['waning 1', 'warning 2']
      }
    };
    axios.get.mockImplementation(function (url) {
      if (url === 'http://fakeurl/result') {
        return Promise.resolve({ data: zlib.gzipSync(JSON.stringify(data)) });
      }
      return Promise.resolve({ data: zlib.gzipSync('one-line-logs') });
    });
    res = await requestWithSupertest.get('/backups/result/backup-first').set('cookie', cookie);
    expect(res.status).toEqual(200);
    var dom = new JSDOM(res.text);
    const warnings = dom.window.document.getElementsByClassName('list-group-item-warning');
    expect(warnings.length).toEqual(1);
    const errors = dom.window.document.getElementsByClassName('list-group-item-danger');
    expect(errors.length).toEqual(2);
    const logs = dom.window.document.getElementsByClassName('list-group-item-info');
    expect(logs.length).toEqual(1);
    expect(logs[0].innerHTML).toEqual('one-line-logs');
  });
});
