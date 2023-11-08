const k8s = {
    mock : function(){
        jest.mock('@kubernetes/client-node', ()=> {
            const data = require('./test.data.js');
            return {
                PatchUtils: {
                    PATCH_FORMAT_JSON_PATCH: 'json'
                },
                KubeConfig : jest.fn().mockImplementation(() => {
                return {
                    loadFromDefault: function(){},
                    makeApiClient: function(){
                        return {
                            listNamespacedCustomObject: function(group, version, namespace, name){
                                var items = [];
                                if(name == 'backups'){
                                    items = data.backups();
                                }
                                if(name == 'backupstoragelocations'){
                                    items = data.backupstoragelocations();
                                }
                                if(name == 'volumesnapshotlocations'){
                                    items = data.volumesnapshotlocations();
                                }
                                if(name == 'restores'){
                                    items = data.restores();
                                }
                                if(name == 'schedules'){
                                    items = data.schedules();
                                }
                                return {
                                    body: {
                                        items: items
                                    }
                                }
                            },
                            getNamespacedCustomObject: function(group, version, namespace, type, name){
                                var items = [];
                                if(type == 'backups'){
                                    items = data.backups();
                                }
                                if(type == 'restores'){
                                    items = data.restores();
                                }
                                if(type == 'schedules'){
                                    items = data.schedules();
                                }
                                if(type == 'downloadrequests'){
                                    items = data.downloadrequests();
                                }
                                var target = null;
                                for(var i in items){
                                    if(items[i].metadata.name === name || name.indexOf(items[i].metadata.name) === 0){
                                        target = items[i];
                                        break;
                                    }
                                }
                                return {
                                    body: target
                                }
                            },
                            listNamespace: function(){
                                return {
                                    body: {
                                        items: data.namespaces()
                                    }
                                }
                            },
                            createNamespacedCustomObject: function(group, version, namespace, type, object){
                                return {
                                    response: { 
                                        body: object
                                    }
                                }
                            },
                            readNamespacedDeploymentStatus: function(){
                                return {
                                    body: { 
                                        status: {
                                            replicas: 2,
                                            readyReplicas: 2
                                        }
                                    }
                                }
                            },
                            deleteNamespacedCustomObject: function(){
                                return true;
                            },
                            patchNamespacedCustomObject: function(){
                                return {
                                    response: {
                                        body: {
                                            spec: {
                                                paused: false
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } })
            }
        });
    }
}
module.exports = k8s;