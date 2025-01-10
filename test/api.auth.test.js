jest.mock('ldap-authentication');
require('./k8s.mock').mock();
const util = require('./test.util');
const k8s = require('@kubernetes/client-node');
const { authenticate } = require('ldap-authentication');
const supertest = require('supertest');
const api = require('./../src/api.js');
const requestWithSupertest = supertest(api);

describe('Admin Login', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.SECURE_HOST = 'true';
  });
  it('should return error code', async () => {
    var res = await requestWithSupertest.get('/v1/status');
    expect(res.status).toEqual(401);
    res = await requestWithSupertest.get('/v1/status').auth('admin', 'wrongpwd');
    expect(res.status).toEqual(403);
    expect(res.text).toEqual(expect.stringContaining('Forbidden'));
  });
  it('should return ok', async () => {
    var res = await requestWithSupertest.get('/v1/status').auth('admin', 'admin');
    expect(res.status).toEqual(200);
    expect(res.text).toEqual(expect.stringContaining('isReady'));
  });
});

describe('LDAP User Login actions', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = 'ldap://fake:636';
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = '';
    process.env.ADMIN_PASSWORD = '';
  });
  it('should return error code', async () => {
    authenticate.mockReturnValue(false);
    var res = await requestWithSupertest.get('/v1/status').auth('username1', 'wrongpwd');
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(res.status).toEqual(403);
    expect(res.text).toEqual(expect.stringContaining('Forbidden'));
  });
  it('should return ok', async () => {
    authenticate.mockReturnValue({
      memberOf: ['group1', 'group2'],
      gecos: 'username'
    });
    var res = await requestWithSupertest.get('/v1/status').auth('username', 'username');
    expect(res.status).toEqual(200);
    expect(res.text).toEqual(expect.stringContaining('isReady'));
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
});

describe('Authenticated access', () => {
  it('should all resources be protected', async () => {
    const paths = {
      get: [
        '/v1/backups',
        '/v1/restores',
        '/v1/schedules',
        '/v1/status',
        '/v1/restores/fakename',
        '/v1/restores/fakename/log',
        '/v1/schedule/fakename',
        '/v1/backups/fakename/log',
        '/v1/backup/fakename'
      ],
      post: ['/v1/backups', '/v1/schedules'],
      put: ['/v1/backups/fakename/restore', '/v1/schedules/fakename/toggle', '/v1/schedules/fakename/execute'],
      delete: ['/v1/backups/fakename', '/v1/schedules/fakename']
    };
    const calls = {
      get: (path) => requestWithSupertest.get(path),
      post: (path) => requestWithSupertest.post(path),
      put: (path) => requestWithSupertest.put(path),
      delete: (path) => requestWithSupertest.delete(path)
    };
    for (let method in paths) {
      for (let path in paths[method]) {
        const res = await calls[method](paths[method][path]);
        expect(res.status).toEqual(401);
      }
    }
  });
  it('docs should be public', async () => {
    var res = await requestWithSupertest.get('/v1/docs/');
    expect(res.status).toEqual(200);
    expect(res.text).toEqual(expect.stringContaining('MyVelero API'));
  });
});

describe('Read only mode', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = 'ldap://fake:636';
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = '';
    process.env.ADMIN_PASSWORD = '';
    process.env.READ_ONLY_USER = 'true';
    process.env.AUDIT_LOG = 'true';
  });
  it('should refuse other that get request', async () => {
    authenticate.mockReturnValue({
      memberOf: ['group1', 'group2'],
      gecos: 'username'
    });

    var res = await requestWithSupertest.get('/v1/status').auth('username', 'username');
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.isReadOnly).toEqual(true);

    const okPaths = {
      get: [
        '/v1/backups',
        '/v1/restores',
        '/v1/schedules',
        '/v1/status',
        '/v1/restores/fakename',
        '/v1/restores/fakename/log',
        '/v1/schedule/fakename',
        '/v1/backups/fakename/log',
        '/v1/backup/fakename'
      ]
    };
    const koPaths = {
      post: ['/v1/backups', '/v1/schedules'],
      put: ['/v1/backups/fakename/restore', '/v1/schedules/fakename/toggle', '/v1/schedules/fakename/execute'],
      delete: ['/v1/backups/fakename', '/v1/schedules/fakename']
    };

    const calls = {
      get: (path) => requestWithSupertest.get(path).auth('username', 'username'),
      post: (path) => requestWithSupertest.post(path).auth('username', 'username'),
      put: (path) => requestWithSupertest.put(path).auth('username', 'username'),
      delete: (path) => requestWithSupertest.delete(path).auth('username', 'username')
    };
    for (let method in koPaths) {
      for (let path in koPaths[method]) {
        const res = await calls[method](koPaths[method][path]);
        expect(res.status).toEqual(405);
      }
    }
    for (let method in okPaths) {
      for (let path in okPaths[method]) {
        const res = await calls[method](okPaths[method][path]);
        expect(res.status).not.toEqual(405);
      }
    }
  });
});
