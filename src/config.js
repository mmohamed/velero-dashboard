const config = {
    namespace: function(){
        if(process.env.VELERO_NAMESPACE && process.env.VELERO_NAMESPACE.trim().length > 0){
            return process.env.VELERO_NAMESPACE.trim();
        }
        return 'velero';
    },
    filtering: function(){
        var filtering = false;
        if(process.env.NAMESPACE_FILTERING && process.env.NAMESPACE_FILTERING.trim().length > 0) {
            if(process.env.NAMESPACE_FILTERING != 'false' && process.env.NAMESPACE_FILTERING != '0'){
                try {
                    filtering = JSON.parse(process.env.NAMESPACE_FILTERING);
                } catch (e) {
                    console.error('Error decoding filtering namespace config : ',e);
                }
            }
        }
        return filtering;
    },
    secretKey: function(){
        return process.env.SECRET_KEY || '';
    },
    useFSBackup: function(){
        if(process.env.USE_FSBACKUP.trim() === '1' || process.env.USE_FSBACKUP.trim().toLowerCase() === 'true'){
            return true;
        }
        return false;
    },
    readOnlyMode: function(){
        if(process.env.READ_ONLY_USER.trim() === '1' || process.env.READ_ONLY_USER.trim().toLowerCase() === 'true'){
            return true;
        }
        return false;
    },
    admin: function(){
        if(process.env.ADMIN_USERNAME && process.env.ADMIN_USERNAME.trim().length > 0 && process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length > 0){
            return {username: process.env.ADMIN_USERNAME.trim(), password: process.env.ADMIN_PASSWORD.trim()}
        }
        return false;
    },
    ldap: function(){
        if(process.env.LDAP_HOST && process.env.LDAP_HOST.trim().substring(0, 4) === 'ldap'){
            return {
                ldapOpts: {
                    url: process.env.LDAP_HOST.trim(),
                    tlsOptions: { rejectUnauthorized: process.env.LDAP_SKIP_SSL && process.env.LDAP_SKIP_SSL === '1' }
                },
                starttls: process.env.LDAP_START_TLS && process.env.LDAP_START_TLS === '1',
                adminDn: process.env.LDAP_BIND_DN || '',
                adminPassword: process.env.LDAP_BIND_PASSWORD || '',
                userSearchBase: process.env.LDAP_SEARCH_BASE || '',
                usernameAttribute: process.env.LDAP_SEARCH_FILTER || ''
            }
        }
        return false;
    },
    debug: function(message){
        if(process.env.DEBUG.trim() === '1' || process.env.DEBUG.trim().toLowerCase() === 'true'){
            console.debug(message);
        }
    },
    delay: function(time) { 
        return new Promise(resolve => setTimeout(resolve, time)); 
    }, 
    toArray: function(data) {
        var array = [];
        if(typeof data != 'object' && typeof data != 'array'){
            return data;
        }
        if(typeof data == 'object' && !Array.isArray(data)){
            for(var key in data){
                array.push('['+key+'] '+this.toArray(data[key]));
            }
        }else{
            for(var key in data){
                array.push(this.toArray(data[key]));
            }
        }
        return array;
    }
}

module.exports = config;