jest.mock('@kubernetes/client-node', ()=> {
    return {
        KubeConfig : jest.fn().mockImplementation(() => {
        return {
            loadFromDefault: function(){},
            makeApiClient: function(){
                return {
                    listNamespacedCustomObject: function(){
                        return {
                            body: {
                                items: require('./test.data.js').backups()
                            }
                        }
                    }
                }
            }
        } })
    }
});
jest.mock('ldap-authentication');

const k8s = require('@kubernetes/client-node');
const { authenticate } = require('ldap-authentication');
const supertest = require('supertest');
const server = require('./../src/main.js')
const requestWithSupertest = supertest(server);

describe('Admin full access', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = false;
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = 'admin';
        process.env.ADMIN_PASSWORD = 'admin';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
    });
    it('should have access to resources', async () => {
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

describe('User filtred access', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = 'ldap://fake:636';
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = '';
        process.env.ADMIN_PASSWORD = '';
        process.env.NAMESPACE_FILTERING = JSON.stringify([{group: "group1", namespaces: ['ns1','ns3']}]);
        
    });
    it('should have access to resources', async () => {
        authenticate.mockReturnValue({
            memberOf: ['group1', 'group2'],
            gecos: 'username'
        });
        var res = (await requestWithSupertest.post('/login').send({ username: 'username', password: 'username'}));
        expect(res.status).toEqual(302);

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/backups').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.length).toEqual(1);
        expect(res.body[0].metadata.name).toEqual('backup-second');
    });
});

describe('User with filtering feature disabled', () => {
    beforeAll(() => {
        process.env.LDAP_HOST = 'ldap://fake:636';
        process.env.DEBUG = '0';
        process.env.ADMIN_USERNAME = '';
        process.env.ADMIN_PASSWORD = '';
        process.env.NAMESPACE_FILTERING = false;
        
    });
    it('should have access to resources', async () => {
        authenticate.mockReturnValue({
            memberOf: ['group1', 'group2'],
            gecos: 'username'
        });
        var res = (await requestWithSupertest.post('/login').send({ username: 'username', password: 'username'}));
        expect(res.status).toEqual(302);

        const cookie = res.get('set-cookie');
        res = (await requestWithSupertest.get('/backups').set('cookie', cookie));
        expect(res.status).toEqual(200);
        expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
        expect(res.body.length).toEqual(2);
    });
});