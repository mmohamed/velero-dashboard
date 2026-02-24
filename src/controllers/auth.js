import tools from './../tools.js'
import {authenticate} from 'ldap-authentication'
import {decode} from 'html-entities'

class AuthController {
  constructor(kubeService, twing) {
    this.kubeService = kubeService;
    this.twing = twing;
  }

  globalSecureAction(request, response, next) {
    if(request.path.indexOf('/static/') === 0){
      return next();
    }
    if (!request.session.user) {
      if (request.path !== '/login' && request.path !== '/') {
        return response.status(403).end('Forbidden');
      }
    }
    if (tools.readOnlyMode()) {
      if (request.method != 'GET' && request.url !== '/login') {
        if (!request.session || !request.session.user || !request.session.user.isAdmin) {
          return response.status(405).end('Method Not Allowed');
        }
      }
    }
    // switch context for each request
    if (this.kubeService.isMultiCluster()) {
      let newContext = request.query.context;
      if (newContext) {
        request.session.context = newContext;
      }
      let userContext = request.session.context;
      if (!userContext) {
        userContext = this.kubeService.getCurrentContext();
        request.session.context = userContext;
      }
      this.kubeService.switchContext(userContext);
    }
    return next();
  }

  globalCSRFTokenAction(error, request, response, next) {
    if (error.code !== 'EBADCSRFTOKEN') {
      return next(error);
    }
    // handle CSRF token errors
    if (/application\/json;/.test(request.get('accept'))) {
      response.status(403);
      response.send('CSRF Token Invalid');
    } else {
      response.redirect(request.originalUrl + '?csrf-error');
    }
  }

  loginView(request, response) {
    this.twing.render('login.html.twig', { csrfToken: request.csrfToken() }).then((output) => {
      response.set('Content-Type', 'text/html').end(output);
    });
  }

  logoutAction(request, response) {
    const actor = request.session.user.username;
    request.session.destroy(function () {
      tools.debug('user logged out.');
      tools.audit(actor, 'AuthController', 'LOGOUT');
    });
    response.redirect(tools.subPath('/login'));
  }

  async loginAction(request, response) {
    if (!request.body.username || !request.body.password) {
      return this.twing.render('login.html.twig', { message: 'Please enter both username and password' }).then((output) => {
        response.set('Content-Type', 'text/html').end(output);
      });
    }

    let adminAccount = tools.admin();
    if (adminAccount) {
      if (adminAccount.username === request.body.username && adminAccount.password === request.body.password) {
        request.session.user = {
          isAdmin: true,
          username: request.body.username,
          password: request.body.password
        };
        return response.redirect(tools.subPath('/'));
      }
    }

    let ldapConfig = tools.ldap();

    if (ldapConfig) {
      try {
        ldapConfig.userPassword = decode(request.body.password);
        ldapConfig.username = decode(request.body.username);
        ldapConfig.attributes = ['groups', 'givenName', 'sn', 'userPrincipalName', 'memberOf', 'gecos'];
        if (ldapConfig.attributes.indexOf(ldapConfig.usernameAttribute) === -1) {
          ldapConfig.attributes.push(ldapConfig.usernameAttribute);
        }
        let authenticated = await authenticate(ldapConfig);
        tools.debug('LDAP : Authenticated user : ', authenticated);

        if (authenticated) {
          let groups = authenticated.memberOf ? authenticated.memberOf : authenticated.groups ? authenticated.groups.split('|') : [];
          let availableNamespaces = tools.userNamespace(groups);

          request.session.user = {
            isAdmin: false,
            username: authenticated.gecos ? authenticated.gecos : request.body.username,
            password: request.body.password,
            groups: groups,
            namespaces: availableNamespaces
          };

          tools.audit(request.session.user.username, 'AuthController', 'LOGIN');

          return response.redirect(tools.subPath('/'));
        }
      } catch (err) {
        console.error(err);
      }
    }

    tools.audit(request.body.username, 'AuthController', 'LOGINFAILED');

    this.twing.render('login.html.twig', { message: 'Invalid credentials!' }).then((output) => {
      response.set('Content-Type', 'text/html').end(output);
    });
  }
}

export default AuthController;
