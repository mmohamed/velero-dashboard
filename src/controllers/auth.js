const config = require('./../config');
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
        if(config.readOnlyMode()){
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
        request.session.destroy(function(){
            config.debug('user logged out.');
        });
        response.redirect('/login');
    }

    async loginAction(request, response){
        if(!request.body.username || !request.body.password){
            return this.twing.render('login.html.twig', {message: 'Please enter both username and password'}).then(output => {
                response.end(output);
            });
        } 
        
        let adminAccount = config.admin();
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

        let ldapConfig = config.ldap();

        if(ldapConfig){
            try{
                ldapConfig.userPassword = request.body.password;
                ldapConfig.username = request.body.username,
                ldapConfig.attributes = ['groups', 'givenName', 'sn', 'sAMAccountName', 'userPrincipalName', 'memberOf', 'gecos' ]
                
                let authenticated = await authenticate(ldapConfig);
                config.debug('Authenticated user : ',authenticated);

                if(authenticated){
                    let groups = authenticated.memberOf ? authenticated.memberOf : authenticated.groups.split('|');
                    let availableNamespaces = config.userNamespace(groups);

                    request.session.user = {
                        isAdmin: false,
                        username: authenticated.gecos ? authenticated.gecos : request.body.username,
                        password: request.body.password,
                        groups: groups,
                        namespaces: availableNamespaces
                    };

                    return response.redirect('/');
                }
            } catch (err) {
                console.error(err);
            }
        }
        
        this.twing.render('login.html.twig', {message:'Invalid credentials!'}).then(output => {
            response.end(output);
        });
    }
}

module.exports = AuthController;