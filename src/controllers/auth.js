const tools = require('./../tools');
const { authenticate } = require('ldap-authentication');

class AuthController {

    constructor(twing) {
        this.twing = twing;
    }

    globalSecureAction(request, response, next){
        if(!request.session.user){
            if(request.url !== '/login' && request.url !== '/'){
                return response.status(403).end('Forbidden');
            }
        }
        if(tools.readOnlyMode()){
            if(request.method != 'GET' && request.url !== '/login'){
                if(!request.session || !request.session.user || !request.session.user.isAdmin){
                    return response.status(405).end('Method Not Allowed');
                }
            }
        }
        return next();
    }

    loginView(request, response){
        this.twing.render('login.html.twig').then(output => {
            response.end(output);
        });
    }

    logoutAction(request, response){
        const actor = request.session.user.username;
        request.session.destroy(function(){
            tools.debug('user logged out.');
            tools.audit(actor, 'AuthController', 'LOGOUT');
        });
        response.redirect('/login');
    }

    async loginAction(request, response){
        if(!request.body.username || !request.body.password){
            return this.twing.render('login.html.twig', {message: 'Please enter both username and password'}).then(output => {
                response.end(output);
            });
        } 
        
        let adminAccount = tools.admin();
        if(adminAccount){
            if(adminAccount.username === request.body.username && adminAccount.password === request.body.password){
                request.session.user = {
                    isAdmin: true,
                    username: request.body.username,
                    password: request.body.password 
                };
                return response.redirect('/');
            }
        }

        let ldapConfig = tools.ldap();

        if(ldapConfig){
            try{
                ldapConfig.userPassword = request.body.password;
                ldapConfig.username = request.body.username,
                ldapConfig.attributes = ['groups', 'givenName', 'sn', 'userPrincipalName', 'memberOf', 'gecos' ]
                if(ldapConfig.attributes.indexOf(ldapConfig.usernameAttribute) === -1){
                    ldapConfig.attributes.push(ldapConfig.usernameAttribute);
                }
                let authenticated = await authenticate(ldapConfig);
                tools.debug('LDAP : Authenticated user : ',authenticated);

                if(authenticated){
                    let groups = authenticated.memberOf ? authenticated.memberOf : (authenticated.groups ? authenticated.groups.split('|'): []);
                    let availableNamespaces = tools.userNamespace(groups);

                    request.session.user = {
                        isAdmin: false,
                        username: authenticated.gecos ? authenticated.gecos : request.body.username,
                        password: request.body.password,
                        groups: groups,
                        namespaces: availableNamespaces
                    };

                    tools.audit(request.session.user.username, 'AuthController', 'LOGIN');

                    return response.redirect('/');
                }
            } catch (err) {
                console.error(err);
            }
        }
        
        tools.audit(request.body.username, 'AuthController', 'LOGINFAILED');

        this.twing.render('login.html.twig', {message:'Invalid credentials!'}).then(output => {
            response.end(output);
        });
    }
}

module.exports = AuthController;