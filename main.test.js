const supertest = require('supertest');
const server = require('./main.js')
const requestWithSupertest = supertest(server);

describe('Login page', () => {
    it('should redirect to login page', async () => {
        const res = await requestWithSupertest.get('/');
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/login');
    });
});

describe('Login / Logout actions', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin'
        process.env.ADMIN_PASSWORD = 'admin'
    });
    it('should show error message', async () => {
        const res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'wrongpwd'}));
        expect(res.status).toEqual(200);
        expect(res.text).toEqual(expect.stringContaining('Invalid credentials!'));
    });
    it('should redirect to homepage', async () => {
        const res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        const resHome = (await requestWithSupertest.get('/').set('cookie', cookie));
        expect(resHome.status).toEqual(200);
        expect(resHome.text).toEqual(expect.stringContaining('Hello admin'));

        const resLogout = (await requestWithSupertest.get('/logout').set('cookie', cookie));
        expect(resLogout.status).toEqual(302);
        expect(resLogout.get('Location')).toEqual('/login');
    });
});

