const supertest = require('supertest');
const server = require('./main.js')
const requestWithSupertest = supertest(server);

describe('Admin full access', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
    });
    it('should have access to resources', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/backups').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.text).toEqual(expect.stringContaining('Hello admin'));
    });
});