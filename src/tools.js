const { version } = require('../package.json');

const tools = {
  version: function () {
    return version;
  },
  port: function () {
    return process.env.APP_PORT | 3000;
  },
  apiPort: function () {
    return process.env.API_PORT | 3002;
  },
  subPath: function (slug) {
    if (process.env.APP_SUB_PATH && process.env.APP_SUB_PATH.trim().length > 0) {
      var newSlug = '/' + process.env.APP_SUB_PATH.trim() + '/' + slug;
      return newSlug.replace(/\/{2,}/g, '/');
    }
    return slug;
  },
  metrics: function () {
    if (process.env.METRICS && (process.env.METRICS.trim() === '1' || process.env.METRICS.trim().toLowerCase() === 'true')) {
      return true;
    }
    return false;
  },
  metricsPort: function () {
    return process.env.METRICS_PORT | 3001;
  },
  metricsPath: function () {
    if (process.env.METRICS_PATH && process.env.METRICS_PATH.trim().length > 0) {
      return process.env.METRICS_PATH.trim();
    }
    return 'metrics';
  },
  isSecureHost: function () {
    if (process.env.SECURE_HOST && (process.env.SECURE_HOST.trim() === '1' || process.env.SECURE_HOST.trim().toLowerCase() === 'true')) {
      return true;
    }
    return false;
  },
  sslCertFilePath: function () {
    if (process.env.SECURE_HOST_CERT_FILE_PATH && process.env.SECURE_HOST_CERT_FILE_PATH.trim().length > 0) {
      return process.env.SECURE_HOST_CERT_FILE_PATH.trim();
    }
    return false;
  },
  sslKeyFilePath: function () {
    if (process.env.SECURE_HOST_KEY_FILE_PATH && process.env.SECURE_HOST_KEY_FILE_PATH.trim().length > 0) {
      return process.env.SECURE_HOST_KEY_FILE_PATH.trim();
    }
    return false;
  },
  audit: function (actor, origin, action, label, object, description) {
    if (process.env.AUDIT_LOG && (process.env.AUDIT_LOG.trim() === '1' || process.env.AUDIT_LOG.trim().toLowerCase() === 'true')) {
      var auditlog = JSON.stringify({
        timestamp: new Date().toISOString(),
        actor: actor,
        origin: origin,
        action: action,
        label: label,
        object: object,
        description: description
      });
      if (process.env.NODE_ENV !== 'test') {
        console.log(new Date(), ': ', auditlog);
        return true;
      }
    }
    return false;
  },
  namespace: function () {
    if (process.env.VELERO_NAMESPACE && process.env.VELERO_NAMESPACE.trim().length > 0) {
      return process.env.VELERO_NAMESPACE.trim();
    }
    return 'velero';
  },
  multiClusterConfigDir: function () {
    if (process.env.MULTI_CLUSTER_CONFIG_DIR && process.env.MULTI_CLUSTER_CONFIG_DIR.trim().length > 0) {
      return process.env.MULTI_CLUSTER_CONFIG_DIR.trim();
    }
    return false;
  },
  filtering: function () {
    var filtering = false;
    if (process.env.NAMESPACE_FILTERING && process.env.NAMESPACE_FILTERING.trim().length > 0) {
      if (process.env.NAMESPACE_FILTERING != 'false' && process.env.NAMESPACE_FILTERING != '0') {
        try {
          filtering = JSON.parse(process.env.NAMESPACE_FILTERING);
        } catch (e) {
          console.error(new Date(), ': Error decoding filtering namespace config : ', e);
        }
      }
    }
    return filtering;
  },
  secretKey: function () {
    return process.env.SECRET_KEY || 'default-secret-mut-be-changed';
  },
  useFSBackup: function () {
    if (process.env.USE_FSBACKUP && (process.env.USE_FSBACKUP.trim() === '1' || process.env.USE_FSBACKUP.trim().toLowerCase() === 'true')) {
      return true;
    }
    return false;
  },
  readOnlyMode: function () {
    if (
      process.env.READ_ONLY_USER &&
      (process.env.READ_ONLY_USER.trim() === '1' || process.env.READ_ONLY_USER.trim().toLowerCase() === 'true')
    ) {
      return true;
    }
    return false;
  },
  admin: function () {
    if (
      process.env.ADMIN_USERNAME &&
      process.env.ADMIN_USERNAME.trim().length > 0 &&
      process.env.ADMIN_PASSWORD &&
      process.env.ADMIN_PASSWORD.trim().length > 0
    ) {
      return { username: process.env.ADMIN_USERNAME.trim(), password: process.env.ADMIN_PASSWORD.trim() };
    }
    return false;
  },
  ldap: function () {
    if (process.env.LDAP_HOST && process.env.LDAP_HOST.trim().substring(0, 4) === 'ldap') {
      return {
        ldapOpts: {
          url: process.env.LDAP_HOST.trim(),
          tlsOptions: { rejectUnauthorized: process.env.LDAP_SKIP_SSL && process.env.LDAP_SKIP_SSL === '1' ? false : true }
        },
        starttls: process.env.LDAP_START_TLS && process.env.LDAP_START_TLS === '1',
        adminDn: process.env.LDAP_BIND_DN || '',
        adminPassword: process.env.LDAP_BIND_PASSWORD || '',
        userSearchBase: process.env.LDAP_SEARCH_BASE || '',
        usernameAttribute: process.env.LDAP_SEARCH_FILTER || ''
      };
    }
    return false;
  },
  debug: function (...message) {
    if (process.env.DEBUG && (process.env.DEBUG.trim() === '1' || process.env.DEBUG.trim().toLowerCase() === 'true')) {
      console.debug(new Date(), ': ', ...message);
    }
  },
  delay: function (time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  },
  toArray: function (data) {
    var array = [];
    if (typeof data != 'object' && typeof data != 'array') {
      return data;
    }
    if (typeof data == 'object' && !Array.isArray(data)) {
      for (var key in data) {
        array.push('[' + key + '] ' + this.toArray(data[key]));
      }
    } else {
      for (var key in data) {
        array.push(this.toArray(data[key]));
      }
    }
    return array;
  },
  availableNamespaces: function (user, allNamespaces) {
    let availableNamespaces = [];
    if (!user.isAdmin && this.filtering()) {
      for (let i in allNamespaces) {
        if (user.namespaces.indexOf(allNamespaces[i].metadata.name) != -1) {
          availableNamespaces.push(allNamespaces[i]);
        }
      }
      return availableNamespaces;
    }
    return allNamespaces;
  },
  userNamespace: function (groups) {
    let userNamespaces = [];
    try {
      var filtering = this.filtering();
      if (filtering) {
        for (var i in groups) {
          for (var j in filtering) {
            if (filtering[j].group === groups[i]) {
              for (var k in filtering[j].namespaces) {
                if (userNamespaces.indexOf(filtering[j].namespaces[k]) === -1) {
                  userNamespaces.push(filtering[j].namespaces[k]);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(new Date(), ': Error calculating filtering namespace config ', err);
    }
    return userNamespaces;
  },
  hasAccess: function (user, body) {
    let includedNamespaces = body.spec.template ? body.spec.template.includedNamespaces : body.spec.includedNamespaces;
    if (!user.isAdmin && this.filtering()) {
      let hasAccess = true;
      for (let i in includedNamespaces) {
        if (user.namespaces.indexOf(includedNamespaces[i]) === -1) {
          hasAccess = false;
          break;
        }
      }
      if (!hasAccess || !includedNamespaces || !includedNamespaces.length > 0) {
        return false;
      }
    }
    return true;
  }
};

module.exports = tools;
