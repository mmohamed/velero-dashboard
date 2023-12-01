
require('./k8s.mock').mock();
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server.app);

describe('SubPath APP', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.APP_SUB_PATH = '/subpath-of-my-velero';
    });
    it('should redirect to homepage/login with subpath', async () => {
        const res = await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin' });
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/subpath-of-my-velero/');

        const cookie = res.get('set-cookie');
        const resHome = await requestWithSupertest.get('/').set('cookie', cookie);
        expect(resHome.status).toEqual(200);
        expect(resHome.text).toEqual(expect.stringContaining('Hello admin'));

        const resLogout = await requestWithSupertest.get('/logout').set('cookie', cookie);
        expect(resLogout.status).toEqual(302);
        expect(resLogout.get('Location')).toEqual('/subpath-of-my-velero/login');
    });
});