const express = require('express');
const k8s = require('@kubernetes/client-node');
const bodyParser = require('body-parser');
const cors = require('cors');
const { TwingEnvironment, TwingLoaderFilesystem } = require("twing");

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi)

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const loader = new TwingLoaderFilesystem("./templates");
const twing = new TwingEnvironment(loader);
// // serve your css as static
app.use(express.static(__dirname+'/static'));

// app.get("/", (req, res) => {
//   res.sendFile(__dirname + '/public/index.html');
// });

app.get("/", (request, response) => {
    twing.render("index.html.twig", { name: "World" }).then(output => {
        response.end(output);
    });
});

app.get('/api/status', async (request, response) => {
    const deployStatus = await k8sApi.readNamespacedDeploymentStatus('velero', 'velero');
    const backupStorageLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', 'velero', 'backupstoragelocations');
    const volumeSnapshotLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', 'velero', 'volumesnapshotlocations');
   
    var backupStorageLocationStatus = "uncknown";
    var backupStorageLocationLastSync = null;
    
    for(var i in backupStorageLocations.body.items){
        if(backupStorageLocations.body.items[i].spec.default){
            backupStorageLocationStatus = backupStorageLocations.body.items[i].status.phase;
            backupStorageLocationLastSync = backupStorageLocations.body.items[i].status.lastSyncedTime
            break;
        }
    }

    response.send({
        isReady: (deployStatus.body.status.replicas - deployStatus.body.status.readyReplicas) == 0,
        StorageStatus: backupStorageLocationStatus, 
        lastSync: backupStorageLocationLastSync,
        volumeSnapshot: volumeSnapshotLocations.body.items.length > 0
    });
});

app.get('/api/backups', async (request, response) => {
    const backups = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', 'velero', 'backups');
    //console.log('Backups: ', backups.body.items);
    response.send(backups.body);
});

app.post('/api/backups', async (request, response) => {
    try {
        var body = {
            "apiVersion": "velero.io/v1",
            "kind": "Backup",
            "metadata": {
                "name": request.body.name,
                "namespace": "velero"
            },
            "spec": {
                "defaultVolumesToRestic": true,
                "includedNamespaces": ["ovpn"],
                "storageLocation": "default",
                "volumeSnapshotLocations": ["default"],
                "ttl": "720h0m0s"
            }
        }
        var returned = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', 'velero', 'backups', body);
        console.log('Backups: ', returned.body);
        response.send({'status': true});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});

app.get('/api/restores', async (request, response) => {
    const restores  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', 'velero', 'restores');
    response.send(restores.body);
});

app.post('/api/restores', async (request, response) => {
    try {
        var body = {
            "apiVersion": "velero.io/v1",
            "kind": "Restore",
            "metadata": {
                "namespace": "velero",
                "name": request.body.name,
            },
            "spec": {
                "backupName": request.body.backup,
                "defaultVolumesToRestic": true,
                "includedNamespaces": ["ovpn"],
                "storageLocation": "default",
                "excludedResources": ["nodes", "events", "events.events.k8s.io", "backups.velero.io", "restores.velero.io", "resticrepositories.velero.io"],
                "ttl": "720h0m0s"
            }
        }
        var returned = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', 'velero', 'restores', body);
        console.log('Restores: ', returned.body);
        response.send({'status': true});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});

app.get('/api/schedules', async (request, response) => {
    const schedules  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', 'velero', 'schedules');
    response.send(schedules.body);
});

app.post('/api/schedules', async (request, response) => {
    try {
        var body = {
            "apiVersion": "velero.io/v1",
            "kind": "Schedule",
            "metadata": {
                "namespace": "velero",
                "name": request.body.name,
            },
            "spec": {
                "schedule": request.body.schedule,
                "defaultVolumesToRestic": true,
                "includedNamespaces": ["ovpn"],
                "template": {
                    "ttl": request.body.ttl ? request.body.ttl : "360h0m0s"
                },
                "useOwnerReferencesInBackup": false
            }
        }
        var returned = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', 'velero', 'schedules', body);
        console.log('Schedules: ', returned.body);
        response.send({'status': true});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});


app.listen(3001, () => {
  console.log('Application started...')
})

module.exports = app;