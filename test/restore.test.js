require('./k8s.mock').mock();
const axios = require('axios');
const k8s = require('@kubernetes/client-node');
const zlib = require('zlib');
const supertest = require('supertest');
const server = require('./../src/main');
const requestWithSupertest = supertest(server);
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

jest.mock('axios');

describe('Restores get', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have access to 2 restores', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/restores').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.length).toEqual(2);
    });
});

describe('Restores create from backup', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have check and delete a valid backup', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.post('/restores').send({backupignored: 'notfound'}).set('cookie', cookie));
        expect(res.status).toEqual(404);
        res = (await requestWithSupertest.post('/restores').send({backup: 'notfound'}).set('cookie', cookie));
        expect(res.status).toEqual(404);
        res = (await requestWithSupertest.post('/restores').send({backup: 'backup-first'}).set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.status).toBe(true);
    });
});

describe('Restores result show', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have check and get a valid restore result and log', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/restores/result/').set('cookie', cookie));
        expect(res.status).toEqual(404);
        res = (await requestWithSupertest.get('/restores/result/notfound').set('cookie', cookie));
        expect(res.status).toEqual(404);
        var data = {
            errors: ['error 1', 'error 2'],
            warnings: {
                'namspace': ['waning 1', 'warning 2']
            }
        }
        axios.get.mockImplementation(
            function(url){
                if(url === 'http://fakeurl/result'){
                    return Promise.resolve({ data: zlib.gzipSync(JSON.stringify(data))})
                }
                return Promise.resolve({ data: zlib.gzipSync('one-line-logs')})
            }
        );
        res = (await requestWithSupertest.get('/restores/result/first-restore-from-backup-first').set('cookie', cookie));
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
