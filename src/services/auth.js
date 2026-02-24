import tools from './../tools.js'
import {decode} from 'html-entities'
import {authenticate} from 'ldap-authentication'

class AuthService {

  async auth(username, password, done) {
    let adminAccount = tools.admin();
    if (adminAccount) {
      if (adminAccount.username === username && adminAccount.password === password) {
        return done(null, {
          isAdmin: true,
          username: username,
          password: password,
          provider: 'local'
        });
      }
    }

    let ldapConfig = tools.ldap();

    if (ldapConfig) {
      try {
        ldapConfig.userPassword = decode(password);
        ldapConfig.username = decode(username);
        ldapConfig.attributes = ['groups', 'givenName', 'sn', 'userPrincipalName', 'memberOf', 'gecos'];
        if (ldapConfig.attributes.indexOf(ldapConfig.usernameAttribute) === -1) {
          ldapConfig.attributes.push(ldapConfig.usernameAttribute);
        }
        let authenticated = await authenticate(ldapConfig);
        tools.debug('LDAP : Authenticated user : ', authenticated);

        if (authenticated) {
          let groups = authenticated.memberOf ? authenticated.memberOf : authenticated.groups ? authenticated.groups.split('|') : [];
          let availableNamespaces = tools.userNamespace(groups);
          
          tools.audit(username, 'AuthController', 'LOGIN');
          
          return done(null, {
            isAdmin: false,
            username: authenticated.gecos ? authenticated.gecos : username,
            password: password,
            groups: groups,
            namespaces: availableNamespaces,
            provider: 'ldap'
          });
        }
      } catch (err) {
        console.error('Authentication error : ' + err);
        return done(err)
      }
    }
  }
}

export default AuthService;
