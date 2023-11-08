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

describe('Schedules get', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have access to 2 schedules', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/schedules').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.length).toEqual(2);
    });
});

describe('Schedules create', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have check and create a valid backup', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/schedule/new').set('cookie', cookie));
        expect(res.status).toEqual(200);
        var dom = new JSDOM(res.text);
        const form = dom.window.document.querySelector('form');
        expect(form.getAttribute('id')).toBe('new-schedule-form');

        res = (await requestWithSupertest.post('/schedule/new').set('cookie', cookie));
        expect(res.status).toEqual(200);
        dom = new JSDOM(res.text);
        const inputs = dom.window.document.getElementsByClassName('is-invalid');
        expect(inputs.length).toEqual(5);

        var scheduleData = {
            name: 'new-schedule',
            includenamespace: ['ns1', 'ns2'],
            includeresources: 'deployments,secrets',
            excludenamespace:  ['ns3'],
            excluderesources: 'job',
            cron: '* * * * *',
            ownerreferences: '1',
            retention: '90',
            snapshot: '1',
            cluster: '1',
            fsbackup: '1',
            backuplabels: 'app:test',
            useselector:  'app:test,ver:v1',
            backuplocation: 'default',
            snapshotlocation: 'default'
        }
        res = (await requestWithSupertest.post('/schedule/new').send(scheduleData).set('cookie', cookie));
        expect(res.status).toEqual(201);
        dom = new JSDOM(res.text);
        const errors = dom.window.document.getElementsByClassName('is-invalid');
        expect(errors.length).toEqual(0);
    });
});

describe('Schedules delete', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have check and delete a valid schedule', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.delete('/schedules').send({scheduleignored: 'notfound'}).set('cookie', cookie));
        expect(res.status).toEqual(404);
        res = (await requestWithSupertest.delete('/schedules').send({schedule: 'notfound'}).set('cookie', cookie));
        expect(res.status).toEqual(404);
        res = (await requestWithSupertest.delete('/schedules').send({schedule: 'first-schedules'}).set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.status).toBe(true);
    });
});

describe('Schedule execute', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have check and create a backup from schedule', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.post('/schedules/execute').set('cookie', cookie));
        expect(res.status).toEqual(404);
        res = (await requestWithSupertest.post('/schedules/execute').send({schedule: 'notfound-schedule'}).set('cookie', cookie));
        expect(res.status).toEqual(404);
        res = (await requestWithSupertest.post('/schedules/execute').send({schedule: 'first-schedules'}).set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.status).toBe(true);
    });
});

describe('Schedule toggle', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have check and toggle the schedule state', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.post('/schedules/toggle').set('cookie', cookie));
        expect(res.status).toEqual(404);
        res = (await requestWithSupertest.post('/schedules/toggle').send({schedule: 'notfound-schedule'}).set('cookie', cookie));
        expect(res.status).toEqual(404);
        res = (await requestWithSupertest.post('/schedules/toggle').send({schedule: 'first-schedules'}).set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.status).toBe(true);
        expect(res.body.state).toBe(false);
    });
});