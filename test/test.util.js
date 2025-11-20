const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const util = {
  auth: async function (requestWithSupertest, username, password) {
    const res = await requestWithSupertest.get('/login');
    const cookie = res.get('set-cookie');
    var dom = new JSDOM(res.text);
    const token = dom.window.document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    const resLogin = await requestWithSupertest
      .post('/login')
      .set('cookie', cookie)
      .send({ _csrf: token, username: username, password: password });
    return { cookie: cookie, token, token, response: resLogin };
  }
};

module.exports = util;
