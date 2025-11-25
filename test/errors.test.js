require('./k8s.mock').mock();
console.error = function () {};
const util = require('./test.util');
const k8s = require('@kubernetes/client-node');
const supertest = require('supertest');
const server = require('./../src/main.js');
const requestWithSupertest = supertest(server.app);
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// describe('Managing partial server errors 1', () => {
//   beforeAll(() => {
//     process.env.LDAP_HOST = false;
//     process.env.DEBUG = '0';
//     process.env.ADMIN_USERNAME = 'admin';
//     process.env.ADMIN_PASSWORD = 'admin';
//     // testing env var
//     process.env.TEST_THROW_READ_ERROR = true;
//     process.env.TEST_THROW_CHANGE_ERROR = false;
//   });
//   it('should be logged to console on read action', async () => {
//     var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
//     expect(auth.response.status).toEqual(302);
//     expect(auth.response.get('Location')).toEqual('/');

//     process.env.TEST_THROW_READ_ERROR = true;
//     res = await requestWithSupertest.get('/backups').set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
//     expect(res.body.length).toEqual(0);

//     res = await requestWithSupertest.get('/restores').set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
//     expect(res.body.length).toEqual(0);

//     res = await requestWithSupertest.get('/schedules').set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
//     expect(res.body.length).toEqual(0);

//     res = await requestWithSupertest.get('/status').set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
//     expect(res.body.isReady).toBe(false);

//     res = await requestWithSupertest.post('/backup/new').send({ _csrf: auth.token }).set('cookie', auth.cookie);
//     expect(res.status).toEqual(200);
//     const dom = new jsdom.JSDOM(res.text);
//     expect(dom.window.document.querySelector('parsererror')).toBe(null);
//   });
// });

describe('Managing partial server errors 2', () => {
  beforeAll(() => {
    process.env.LDAP_HOST = false;
    process.env.DEBUG = '0';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin';
    // testing env var
    process.env.TEST_THROW_READ_ERROR = false;
    process.env.TEST_THROW_CHANGE_ERROR = true;
  });
  it('should be logged to console on write action', async () => {
    var auth = await util.auth(requestWithSupertest, 'admin', 'admin');
    expect(auth.response.status).toEqual(302);
    expect(auth.response.get('Location')).toEqual('/');

    res = await requestWithSupertest.post('/backup/new').send({ _csrf: auth.token }).set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    const dom = new jsdom.JSDOM(res.text);
    expect(dom.window.document.querySelector('parsererror')).toBe(null);

    res = await requestWithSupertest.delete('/backups').send({ backup: 'backup-first', _csrf: auth.token }).set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(false);

    res = await requestWithSupertest
      .delete('/schedules')
      .send({ schedule: 'first-schedules', _csrf: auth.token })
      .set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(true);

    // res = await requestWithSupertest.get('/restores/result/first-restore-from-backup-first').set('cookie', auth.cookie);
    // expect(res.status).toEqual(200);

    res = await requestWithSupertest.get('/backups/result/backup-first').set('cookie', auth.cookie);
    expect(res.status).toEqual(200);

    res = await requestWithSupertest
      .post('/schedules/toggle')
      .send({ schedule: 'first-schedules', _csrf: auth.token })
      .set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(false);

    res = await requestWithSupertest
      .post('/schedules/execute')
      .send({ schedule: 'first-schedules', _csrf: auth.token })
      .set('cookie', auth.cookie);
    expect(res.status).toEqual(200);
    expect(res.get('Content-Type')).toEqual('application/json; charset=utf-8');
    expect(res.body.status).toBe(false);
  });
});
