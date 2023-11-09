
const k8s = require('@kubernetes/client-node');

class Kubernetes {

    constructor(clusterConfigs) {
        this.clusterConfigs = clusterConfigs ? clusterConfigs : [];
        this.kcs = {};
        this.current = null;
    }

    connect(){
        var kc;
        for(var i in this.clusterConfigs){
            // init
            kc = new k8s.KubeConfig();
            kc.loadFromString(clusterConfigs[i]);
            // prepare apis
            this.kcs[i] = {
                kc: kc,
                k8sAppsApi: kc.makeApiClient(k8s.AppsV1Api),
                k8sApi: kc.makeApiClient(k8s.CoreV1Api),
                customObjectsApi: kc.makeApiClient(k8s.CustomObjectsApi)
            }
        }
        // single and local
        if(!this.clusterConfigs.length){
            kc = new k8s.KubeConfig();
            kc.loadFromDefault();

            this.kcs['local'] = {
                kc: kc,
                k8sAppsApi: kc.makeApiClient(k8s.AppsV1Api),
                k8sApi: kc.makeApiClient(k8s.CoreV1Api),
                customObjectsApi: kc.makeApiClient(k8s.CustomObjectsApi)
            }
        }
    }

    current(){
        return this.current;
    }
}


module.exports = Kubernetes;