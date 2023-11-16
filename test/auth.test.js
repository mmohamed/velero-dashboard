jest.mock('ldap-authentication');
require('./k8s.mock').mock();
const k8s = require('@kubernetes/client-node');
const { authenticate } = require('ldap-authentication');
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server.app);
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
    expect(inputs.length).toBe(2);
  });
  it('should display error message to missing credentials', async () => {
    const res = await requestWithSupertest.post('/login').send();
    expect(res.status).toEqual(200);
    expect(res.text).toEqual(expect.stringContaining('Please enter both username and password'));
  });
});

describe('Admin Login / Logout actions', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
  });
  it('should show error message', async () => {
    const res = await requestWithSupertest.post('/login').send({ username: 'admin', password: 'wrongpwd' });
    expect(res.status).toEqual(200);
    expect(res.text).toEqual(expect.stringContaining('Invalid credentials!'));
  });
  it('should redirect to homepage', async () => {
    const res = await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');

    const cookie = res.get('set-cookie');
    const resHome = await requestWithSupertest.get('/').set('cookie', cookie);
    expect(resHome.status).toEqual(200);
    expect(resHome.text).toEqual(expect.stringContaining('Hello admin'));

    const resLogout = await requestWithSupertest.get('/logout').set('cookie', cookie);
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
    const res = await requestWithSupertest.post('/login').send({ username: 'username1', password: 'wrongpwd' });
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(res.status).toEqual(200);
    expect(res.text).toEqual(expect.stringContaining('Invalid credentials!'));
  });
  it('should redirect to homepage', async () => {
    authenticate.mockReturnValue({
      memberOf: ['group1', 'group2'],
      gecos: 'username'
    });
    const res = await requestWithSupertest.post('/login').send({ username: 'username', password: 'username' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');
    expect(authenticate).toHaveBeenCalledTimes(1);

    const cookie = res.get('set-cookie');
    const resHome = await requestWithSupertest.get('/').set('cookie', cookie);
    expect(resHome.status).toEqual(200);
    expect(resHome.text).toEqual(expect.stringContaining('Hello username'));

    const resLogout = await requestWithSupertest.get('/logout').set('cookie', cookie);
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
    const res = await requestWithSupertest.post('/login').send({ username: 'username', password: 'username' });
    expect(res.status).toEqual(302);
    expect(res.get('Location')).toEqual('/');

    const cookie = res.get('set-cookie');

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
      get: (path) => requestWithSupertest.get(path).set('cookie', cookie),
      post: (path) => requestWithSupertest.post(path).set('cookie', cookie),
      delete: (path) => requestWithSupertest.delete(path).set('cookie', cookie)
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
