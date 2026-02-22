jest.mock('ldap-authentication');
require('./k8s.mock').mock();
const util = require('./test.util');
const k8s = require('@kubernetes/client-node');
const { authenticate } = require('ldap-authentication');
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server.default.app);
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

describe('Login page', () => {
  it('should redirect to login page', async () => {
    const res = await requestWithSupertest.get('/');
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/login');
  });
  it('should display login form', async () => {
    const res = await requestWithSupertest.get('/login').send();
    expect(res.status).toEqual(200);
    var dom = new JSDOM(res.text);
    const form = dom.window.document.querySelector('form');
    expect(form.getAttribute('id')).toBe('login-form');
    const inputs = dom.window.document.getElementsByTagName('input');
    expect(inputs.length).toBe(3);
  });
  it('should display error message to missing credentials', async () => {
    const res = await requestWithSupertest.get('/login');
    const cookie = res.get('set-cookie');
    var dom = new JSDOM(res.text);
    const token = dom.window.document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    const resLogin = await requestWithSupertest.post('/login').send({ _csrf: token }).set('cookie', cookie);
    expect(resLogin.status).toEqual(200);
    expect(resLogin.text).toEqual(expect.stringContaining('Please enter both username and password'));
  });
});

describe('Admin Login / Logout actions', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.SECURE_HOST = 'true';
  });
  it('should show error message', async () => {
    var auth = await util.auth(requestWithSupertest, 'admin', 'wrongpwd');
    expect(auth.response.status).toEqual(200);
    expect(auth.response.text).toEqual(expect.stringContaining('Invalid credentials!'));
  });
  it('should redirect to homepage', async () => {
    var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
    expect(auth.response.status).toEqual(302);
    expect(auth.response.get('Location')).toEqual('/');

    const resHome = await requestWithSupertest.get('/').set('cookie', auth.cookie);
    expect(resHome.status).toEqual(200);
    expect(resHome.text).toEqual(expect.stringContaining('Hello admin'));

    const resLogout = await requestWithSupertest.get('/logout').set('cookie', auth.cookie);
    expect(resLogout.status).toEqual(302);
    expect(resLogout.get('Location')).toEqual('/login');
  });
});

describe('LDAP User Login / Logout actions', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = 'ldap://fake:636';
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = '';
    process.env.ADMIN_PASSWORD = '';
  });
  it('should show error message', async () => {
    authenticate.mockReturnValue(false);
    var auth = await util.auth(requestWithSupertest, 'username1', 'wrongpwd');
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(auth.response.status).toEqual(200);
    expect(auth.response.text).toEqual(expect.stringContaining('Invalid credentials!'));
  });
  it('should redirect to homepage', async () => {
    authenticate.mockReturnValue({
      memberOf: ['group1', 'group2'],
      gecos: 'username'
    });
    var auth = await util.auth(requestWithSupertest, 'username', 'username');
    expect(auth.response.status).toEqual(302);
    expect(auth.response.get('Location')).toEqual('/');
    expect(authenticate).toHaveBeenCalledTimes(1);

    const resHome = await requestWithSupertest.get('/').set('cookie', auth.cookie);
    expect(resHome.status).toEqual(200);
    expect(resHome.text).toEqual(expect.stringContaining('Hello username'));

    const resLogout = await requestWithSupertest.get('/logout').set('cookie', auth.cookie);
    expect(resLogout.status).toEqual(302);
    expect(resLogout.get('Location')).toEqual('/login');
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
});

describe('Authenticated access', () => {
  it('should all resources be protected', async () => {
    const paths = {
      get: [
        '/backups',
        '/restores',
        '/schedules',
        '/status',
        '/restores/result/fakename',
        '/schedule/new',
        '/backups/result/fakename',
        '/backup/new'
      ],
      post: ['/backup/new', '/restores', '/schedules/toggle', '/schedules/execute', '/schedule/new'],
      delete: ['/backups', '/schedules']
    };
    const calls = {
      get: (path) => requestWithSupertest.get(path),
      post: (path) => requestWithSupertest.post(path),
      delete: (path) => requestWithSupertest.delete(path)
    };
    for (let method in paths) {
      for (let path in paths[method]) {
        const res = await calls[method](paths[method][path]);
        expect(res.status).toEqual(403);
      }
    }
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
    var auth = await util.auth(requestWithSupertest, 'username', 'username');
    expect(auth.response.status).toEqual(302);
    expect(auth.response.get('Location')).toEqual('/');

    const resHome = await requestWithSupertest.get('/').set('cookie', auth.cookie);
    expect(resHome.status).toEqual(200);
    expect(resHome.text).toEqual(expect.stringContaining('Read Only'));

    const okPaths = {
      get: [
        '/backups',
        '/restores',
        '/schedules',
        '/status',
        '/restores/result/fakename',
        '/schedule/new',
        '/backups/result/fakename',
        '/backup/new'
      ],
      post: ['/login']
    };
    const koPaths = {
      post: ['/backup/new', '/restores', '/schedules/toggle', '/schedules/execute', '/schedule/new'],
      delete: ['/backups', '/schedules']
    };

    const calls = {
      get: (path) => requestWithSupertest.get(path).set('cookie', auth.cookie),
      post: (path) => requestWithSupertest.post(path).set('cookie', auth.cookie),
      delete: (path) => requestWithSupertest.delete(path).set('cookie', auth.cookie)
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
