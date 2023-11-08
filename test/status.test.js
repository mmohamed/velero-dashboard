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

describe('Status get', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should get global status', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/status').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.isReady).toEqual(true);
        expect(res.body.StorageStatus).toEqual('Available');
        expect(res.body.lastSync).toEqual('2023-11-06T14:09:49Z');
        expect(res.body.volumeSnapshot).toEqual(true);
    });
});