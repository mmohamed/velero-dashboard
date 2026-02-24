import tools from './../tools.js'
import crypto from 'crypto'
import {buildAuthorizationUrl, authorizationCodeGrant} from 'openid-client'

class AuthController {
  constructor(kubeService, twing, authService) {
    this.kubeService = kubeService;
    this.twing = twing;
    this.authService = authService;
    this.oidcDiscovery = null;
    this.oidcConfig = null;
  }

  async initOIDCConfiguration(oidcDiscovery, oidcConfig){
    this.oidcDiscovery = await Promise.resolve(oidcDiscovery);
    this.oidcConfig = oidcConfig;
  }

  globalSecureAction(request, response, next) {
    if(request.path.indexOf('/static/') === 0 || request.path.indexOf('/auth/oidc') === 0){
      return next();
    }
    
    if (!request.isAuthenticated()) {
      if (request.path !== '/login' && request.path !== '/') {
        return response.redirect(tools.subPath('/login'));
      }
    }
    if (tools.readOnlyMode()) {
      if (request.method != 'GET' && request.url !== '/login') {
        if (!request.session || !request.user || !request.user.isAdmin) {
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
    this.twing.render('login.html.twig', { csrfToken: request.csrfToken(), oidcEnabled: this.oidcConfig ? true : false }).then((output) => {
      response.set('Content-Type', 'text/html').end(output);
    });
  }

  logoutAction(request, response) {
    const actor = request.user.username;
    request.logout(err => {
      if (err) return next(err)
      request.session.destroy(() => {
        tools.debug('user logged out.');
        tools.audit(actor, 'AuthController', 'LOGOUT');
      })
      return response.redirect(tools.subPath('/'));
    })
  }

  async loginAction(request, response) {
    if (!request.body.username || !request.body.password) {
      return this.twing.render('login.html.twig', { csrfToken: request.csrfToken(), message: 'Please enter both username and password', oidcEnabled: this.oidcConfig ? true : false }).then((output) => {
        response.set('Content-Type', 'text/html').end(output);
      });
    }
    return await this.authService.auth(request.body.username, request.body.password, (error, user) => {
      if(user != null){
        return request.login(user, (err) => {
          return response.redirect(tools.subPath('/'));
        });
      }
      tools.audit(request.body.username, 'AuthController', 'LOGINFAILED');

      return this.twing.render('login.html.twig', { csrfToken: request.csrfToken(), message: 'Invalid credentials!', oidcEnabled: this.oidcConfig ? true : false }).then((output) => {
        response.set('Content-Type', 'text/html').end(output);
      });

    });
  }

  async oidcAction(request, response) {
    if(this.oidcConfig == null || this.oidcDiscovery == null){
      return response.redirect('/login');
    }

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    request.session.codeVerifier = codeVerifier;

    const extraScopes = this.oidcConfig.extraScopes && Array.isArray(this.oidcConfig.extraScopes) ? this.oidcConfig.extraScopes.join(" "): "";
    const authorizationUrl = buildAuthorizationUrl(this.oidcDiscovery, {
      scope: 'openid profile email '+extraScopes,
      redirect_uri: this.oidcConfig.redirectUrl,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    response.redirect(authorizationUrl.toString());
  }

  async oidcCallbackAction(request, response, next){
    if(this.oidcConfig == null || this.oidcDiscovery == null){
      return response.redirect('/login');
    }

    try {
      const tokens = await authorizationCodeGrant(this.oidcDiscovery, new URL(request.originalUrl, this.oidcConfig.baseUrl), {
        pkceCodeVerifier: request.session.codeVerifier 
      });
      const claims = tokens.claims()
      tools.debug('IODC : Authenticated user claims : ', claims);

      const userGroups = this.oidcConfig.groupClaim && this.oidcConfig.groupClaim.trim() != "" ? claims[this.oidcConfig.groupClaim] : [];
      const user = {
        isAdmin: false,
        username: this.oidcConfig.userClaim && this.oidcConfig.userClaim.trim() != "" ? claims[this.oidcConfig.userClaim] : claims.sub,
        claims,
        groups: userGroups,
        namespaces: tools.userNamespace(userGroups),
        provider: 'oidc'
      }

      tools.debug('IODC : Authenticated user : ', user);

      request.login(user, err => {
        if (err) return next(err)
        response.redirect('/')
      })

    } catch (err) {
      tools.audit('oidc-user', 'AuthController', 'LOGINFAILED');
      console.error('IODC authentication error : ' + err);
      next(err)
    }
  }

}

export default AuthController;
