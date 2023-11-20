const k8s = {
  multi: function(){
    process.env.MULTI_CLUSTER_CONFIG_DIR = __dirname+'/data';
  },
  mock: function () {
    jest.mock('@kubernetes/client-node', () => {
      const data = require('./test.data.js');
      var currentContext = 'main';
      var config;
      return {
        PatchUtils: {
          PATCH_FORMAT_JSON_PATCH: 'json'
        },
        loadYaml: function(content){
          return require('js-yaml').load(content);
        },
        KubeConfig: jest.fn().mockImplementation(() => {
          return {
            loadFromString: function(string){ this.config = JSON.parse(string) },
            loadFromDefault: function () {},
            setCurrentContext: function(context){ this.currentContext = context},
            getContexts: function(){ return this.config ? this.config.contexts : []},
            getCurrentContext: function(){ return this.currentContext },
            makeApiClient: function () {
              var that = this;
              return {
                listNamespacedCustomObject: function (group, version, namespace, name) {
                  if (process.env.TEST_THROW_READ_ERROR === 'true') throw Error('Fake error');
                  var items = [];
                  if (name == 'backups') {
                    if(that.currentContext == 'second'){
                      items = [];
                    }else{
                      items = data.backups();
                    }
                  }
                  if (name == 'backupstoragelocations') {
                    items = data.backupstoragelocations();
                  }
                  if (name == 'volumesnapshotlocations') {
                    items = data.volumesnapshotlocations();
                  }
                  if (name == 'restores') {
                    items = data.restores();
                  }
                  if (name == 'schedules') {
                    items = data.schedules();
                  }
                  return {
                    body: {
                      items: items
                    }
                  };
                },
                getNamespacedCustomObject: function (group, version, namespace, type, name) {
                  if (process.env.TEST_THROW_READ_ERROR === 'true') throw Error('Fake error');
                  var items = [];
                  if (type == 'backups') {
                    items = data.backups();
                  }
                  if (type == 'restores') {
                    items = data.restores();
                  }
                  if (type == 'schedules') {
                    items = data.schedules();
                  }
                  if (type == 'downloadrequests') {
                    items = data.downloadrequests();
                  }
                  if (type == 'backupstoragelocations') {
                    items = data.backupstoragelocations();
                  }
                  var target = null;
                  for (var i in items) {
                    if (items[i].metadata.name === name || name.indexOf(items[i].metadata.name) === 0) {
                      target = items[i];
                      break;
                    }
                  }
                  return {
                    body: target
                  };
                },
                listNamespace: function () {
                  if (process.env.TEST_THROW_READ_ERROR === 'true') throw Error('Fake error');
                  return {
                    body: {
                      items: data.namespaces()
                    }
                  };
                },
                createNamespacedCustomObject: function (group, version, namespace, type, object) {
                  if (process.env.TEST_THROW_CHANGE_ERROR === 'true') throw Error('Fake error');
                  return {
                    response: {
                      body: object
                    }
                  };
                },
                readNamespacedDeploymentStatus: function () {
                  if (process.env.TEST_THROW_READ_ERROR === 'true') throw Error('Fake error');
                  return {
                    body: {
                      status: {
                        replicas: 2,
                        readyReplicas: 2
                      }
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
                    response: {
                      body: {
                        spec: {
                          paused: false
                        }
                      }
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
