jest.mock('@kubernetes/client-node', ()=> {
    const data = require('./test.data.js');
    return {
        KubeConfig : jest.fn().mockImplementation(() => {
        return {
            loadFromDefault: function(){},
            makeApiClient: function(){
                return {
                    listNamespacedCustomObject: function(){
                        return {
                            body: {
                                items: data.backups()
                            }
                        }
                    },
                    listNamespace: function(){
                        return {
                            body: {
                                items: data.namespaces()
                            }
                        }
                    }
                }
            }
        } })
    }
});

const k8s = require('@kubernetes/client-node');
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server);
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

describe('Backups get', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have access to 2 backups', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/backups').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.length).toEqual(2);
    });
});

describe('Backups create', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have access to 2 backups', async () => {
        var res = (await requestWithSupertest.post('/login').send({ username: 'admin', password: 'admin'}));
        expect(res.status).toEqual(302);
        expect(res.get('Location')).toEqual('/');

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/backup/new').set('cookie', cookie));
        expect(res.status).toEqual(200);

        const dom = new JSDOM(res.text);
        const form = dom.window.document.querySelector('form');
        expect(form.getAttribute('id')).toBe('new-backup-form');
    });
});