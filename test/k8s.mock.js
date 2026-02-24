const k8s = {
  multi: function () {
    process.env.MULTI_CLUSTER_CONFIG_DIR = __dirname + require('path').sep + 'data';
  },
  mock: function () {
    jest.mock('@kubernetes/client-node', () => {
      const data = require('./test.data.js');
      var currentContext = 'main';
      var config;
      return {
        PatchStrategy: {
          JsonPatch: 'json'
        },
        loadYaml: function (content) {
          return require('js-yaml').load(content);
        },
        KubeConfig: jest.fn().mockImplementation(() => {
          return {
            loadFromString: function (string) {
              this.config = JSON.parse(string);
            },
            loadFromDefault: function () {},
            setCurrentContext: function (context) {
              this.currentContext = context;
            },
            getContexts: function () {
              return this.config ? this.config.contexts : [];
            },
            getCurrentContext: function () {
              return this.currentContext;
            },
            makeApiClient: function () {
              var that = this;
              return {
                listNamespacedCustomObject: function (params) {
                  if (process.env.TEST_THROW_READ_ERROR === 'true') throw Error('Fake error');
                  var items = [];
                  if (params.plural == 'backups') {
                    if (that.currentContext == 'second') {
                      items = [];
                    } else {
                      items = data.backups();
                    }
                  }
                  if (params.plural == 'backupstoragelocations') {
                    items = data.backupstoragelocations();
                  }
                  if (params.plural == 'volumesnapshotlocations') {
                    items = data.volumesnapshotlocations();
                  }
                  if (params.plural == 'restores') {
                    items = data.restores();
                  }
                  if (params.plural == 'schedules') {
                    items = data.schedules();
                  }
                  return {
                    items: items
                  };
                },
                getNamespacedCustomObject: function (params) {
                  if (process.env.TEST_THROW_READ_ERROR === 'true') throw Error('Fake error');
                  var items = [];
                  if (params.plural == 'backups') {
                    items = data.backups();
                  }
                  if (params.plural == 'restores') {
                    items = data.restores();
                  }
                  if (params.plural == 'schedules') {
                    items = data.schedules();
                  }
                  if (params.plural == 'downloadrequests') {
                    items = data.downloadrequests();
                  }
                  if (params.plural == 'backupstoragelocations') {
                    items = data.backupstoragelocations();
                  }
                  var target = null;
                  for (var i in items) {
                    if (items[i].metadata.name === params.name || params.name.indexOf(items[i].metadata.name) === 0) {
                      target = items[i];
                      break;
                    }
                  }
                  if (!target) throw Error(params.plural + ' with name ' + params.name + ' not found !');
                  return target;
                },
                listNamespace: function () {
                  if (process.env.TEST_THROW_READ_ERROR === 'true') throw Error('Fake error');
                  return {
                    items: data.namespaces()
                  };
                },
                createNamespacedCustomObject: function (params) {
                  if (process.env.TEST_THROW_CHANGE_ERROR === 'true') throw Error('Fake error');
                  return params.body;
                },
                readNamespacedDeploymentStatus: function () {
                  if (process.env.TEST_THROW_READ_ERROR === 'true') throw Error('Fake error');
                  return {
                    status: {
                      replicas: 2,
                      readyReplicas: 2
                    }
                  };
                },
                deleteNamespacedCustomObject: function () {
                  if (process.env.TEST_THROW_CHANGE_ERROR === 'true') throw Error('Fake error');
                  return true;
                },
                patchNamespacedCustomObject: function () {
                  if (process.env.TEST_THROW_CHANGE_ERROR === 'true') throw Error('Fake error');
                  return {
                    spec: {
                      paused: false
                    }
                  };
                }
              };
            }
          };
        })
      };
    });
  }
};
module.exports = k8s;
