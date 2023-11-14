require('./k8s.mock').mock();
console.error = function(){}

const k8s = require('@kubernetes/client-node');
const supertest = require('supertest');
const server = require('./../src/main.js')
const requestWithSupertest = supertest(server.app);
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

describe('Managing server errors', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
        // testing env var
        process.env.TEST_THROW_ERROR = true
    });
    it('should be logged to console', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/backups').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.length).toEqual(0);

        res = (await requestWithSupertest.get('/restores').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.length).toEqual(0);

        res = (await requestWithSupertest.get('/schedules').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.length).toEqual(0);

        res = (await requestWithSupertest.get('/status').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.isReady).toBe(false);

        res = (await requestWithSupertest.post('/backup/new').set('cookie', cookie));
        expect(res.status).toEqual(200);
        const dom = new jsdom.JSDOM(res.text);
        expect(dom.window.document.querySelector('parsererror')).toBe(null);

        res = (await requestWithSupertest.delete('/backups').send({backup: 'backup-first'}).set('cookie', cookie));
        expect(res.status).toEqual(404);

        res = (await requestWithSupertest.delete('/schedules').send({backup: 'schedule-first'}).set('cookie', cookie));
        expect(res.status).toEqual(404);

        res = (await requestWithSupertest.get('/restores/result/first-restore-from-backup-first').set('cookie', cookie));
        expect(res.status).toEqual(404);

        res = (await requestWithSupertest.get('/backups/result/backup-first').set('cookie', cookie));
        expect(res.status).toEqual(404);

        res = (await requestWithSupertest.post('/schedules/toggle').send({schedule: 'notfound-schedule'}).set('cookie', cookie));
        expect(res.status).toEqual(404);

        res = (await requestWithSupertest.post('/schedules/execute').send({schedule: 'first-schedules'}).set('cookie', cookie));
        expect(res.status).toEqual(404);
    });
});


