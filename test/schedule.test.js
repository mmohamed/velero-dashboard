require('./k8s.mock').mock();
const util = require('./test.util');
const axios = require('axios');
const k8s = require('@kubernetes/client-node');
const zlib = require('zlib');
const supertest = require('supertest');
const server = require('./../src/main');
const requestWithSupertest = supertest(server.app);
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

jest.mock('axios');

// describe('Schedules get', () => {
//   beforeAll(() => {
//     process.env.LDAP_HOST = false;
//     process.env.DEBUG = '0';
//     process.env.ADMIN_USERNAME = 'admin';
//     process.env.ADMIN_PASSWORD = 'admin';
//     process.env.AUDIT_LOG = 'true';
//     process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
//   });
//   it('should have access to 2 schedules', async () => {
//     var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
//     expect(auth.response.get('Location')).toEqual('/');

//     res = await requestWithSupertest.get('/schedules').set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
//     expect(res.body.length).toEqual(2);
//   });
// });

// describe('Schedules create', () => {
//   beforeAll(() => {
//     process.env.LDAP_HOST = false;
//     process.env.DEBUG = '0';
//     process.env.ADMIN_USERNAME = 'admin';
//     process.env.ADMIN_PASSWORD = 'admin';
//     process.env.AUDIT_LOG = 'true';
//     process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
//   });
//   it('should have check and create a valid backup', async () => {
//     var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
//     expect(auth.response.status).toEqual(302);
//     expect(auth.response.get('Location')).toEqual('/');

//     res = await requestWithSupertest.get('/schedule/new').set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     var dom = new JSDOM(res.text);
//     const form = dom.window.document.querySelector('form');
//     expect(form.getAttribute('id')).toBe('new-schedule-form');

//     res = await requestWithSupertest.post('/schedule/new').set('cookie', auth.cookie).send({ _csrf: auth.token });
//     expect(res.status).toEqual(200);
//     dom = new JSDOM(res.text);
//     const inputs = dom.window.document.getElementsByClassName('is-invalid');
//     expect(inputs.length).toEqual(5);

//     var scheduleData = {
//       name: 'new-schedule',
//       includenamespace: ['ns1', 'ns2'],
//       includeresources: 'deployments,secrets',
//       excludenamespace: ['ns3'],
//       excluderesources: 'job',
//       cron: '-1',
//       ownerreferences: '1',
//       retention: '90',
//       snapshot: '1',
//       cluster: '1',
//       fsbackup: '1',
//       backuplabels: 'app:test',
//       useselector: 'app:test,ver:v1',
//       backuplocation: 'default',
//       snapshotlocation: 'default',
//       _csrf: auth.token
//     };
//     res = await requestWithSupertest.post('/schedule/new').send(scheduleData).set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     dom = new JSDOM(res.text);
//     const cronErrors = dom.window.document.getElementsByClassName('is-invalid');
//     expect(cronErrors.length).toEqual(1);
//     expect(cronErrors[0].getAttribute('id')).toEqual('cron');

//     scheduleData.cron = '* * * * *';
//     res = await requestWithSupertest.post('/schedule/new').send(scheduleData).set('cookie', auth.cookie);
//     expect(res.status).toEqual(201);
//     dom = new JSDOM(res.text);
//     const errors = dom.window.document.getElementsByClassName('is-invalid');
//     expect(errors.length).toEqual(0);
//   });
// });

// describe('Schedules delete', () => {
//   beforeAll(() => {
//     process.env.LDAP_HOST = false;
//     process.env.DEBUG = '0';
//     process.env.ADMIN_USERNAME = 'admin';
//     process.env.ADMIN_PASSWORD = 'admin';
//     process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
//   });
//   it('should have check and delete a valid schedule', async () => {
//     var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
//     expect(auth.response.status).toEqual(302);
//     expect(auth.response.get('Location')).toEqual('/');

//     res = await requestWithSupertest
//       .delete('/schedules')
//       .send({ scheduleignored: 'notfound', _csrf: auth.token })
//       .set('cookie', auth.cookie);
//     expect(res.status).toEqual(404);
//     res = await requestWithSupertest.delete('/schedules').send({ schedule: 'notfound', _csrf: auth.token }).set('cookie', auth.cookie);
//     expect(res.status).toEqual(404);
//     res = await requestWithSupertest
//       .delete('/schedules')
//       .send({ schedule: 'first-schedules', _csrf: auth.token })
//       .set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
//     expect(res.body.status).toBe(true);
//   });
// });

// describe('Schedule execute', () => {
//   beforeAll(() => {
//     process.env.LDAP_HOST = false;
//     process.env.DEBUG = '0';
//     process.env.ADMIN_USERNAME = 'admin';
//     process.env.ADMIN_PASSWORD = 'admin';
//     process.env.AUDIT_LOG = 'true';
//     process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
//   });
//   it('should have check and create a backup from schedule', async () => {
//     var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
//     expect(auth.response.status).toEqual(302);
//     expect(auth.response.get('Location')).toEqual('/');

//     res = await requestWithSupertest.post('/schedules/execute').send({ _csrf: auth.token }).set('cookie', auth.cookie);
//     expect(res.status).toEqual(404);
//     res = await requestWithSupertest
//       .post('/schedules/execute')
//       .send({ schedule: 'notfound-schedule', _csrf: auth.token })
//       .set('cookie', auth.cookie);
//     expect(res.status).toEqual(404);
//     res = await requestWithSupertest
//       .post('/schedules/execute')
//       .send({ schedule: 'first-schedules', _csrf: auth.token })
//       .set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
//     expect(res.body.status).toBe(true);
//   });
// });

describe('Schedule toggle', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    process.env.AUDIT_LOG = 'true';
    process.env.NAMESPACE_FILTERING = JSON.stringify([{ group: 'group1', namespaces: ['ns1', 'ns3'] }]);
  });
  it('should have check and toggle the schedule state', async () => {
    var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
    expect(auth.response.status).toEqual(302);
    expect(auth.response.get('Location')).toEqual('/');

    res = await requestWithSupertest.post('/schedules/toggle').send({ _csrf: auth.token }).set('cookie', auth.cookie);
    expect(res.status).toEqual(404);
    res = await requestWithSupertest
      .post('/schedules/toggle')
      .send({ schedule: 'notfound-schedule', _csrf: auth.token })
      .set('cookie', auth.cookie);
    expect(res.status).toEqual(404);
    res = await requestWithSupertest
      .post('/schedules/toggle')
      .send({ schedule: 'first-schedules', _csrf: auth.token })
      .set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(true);
    expect(res.body.state).toBe(false);
  });
});
