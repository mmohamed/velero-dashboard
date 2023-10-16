const express = require('express');
const k8s = require('@kubernetes/client-node');
const bodyParser = require('body-parser');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { authenticate } = require('ldap-authentication');
const { TwingEnvironment, TwingLoaderFilesystem } = require("twing");

require('dotenv').config();

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi)
const app = express();
const VELERO_NAMESPACE = process.env.VELERO_NAMESPACE ?  process.env.VELERO_NAMESPACE : 'velero'
const USE_RESTIC = process.env.USE_RESTIC==="1" ? true : false;
const DEBUG_MODE = process.env.DEBUG==="1" ? true : false;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({secret: process.env.SECRET_KEY}));
app.use(express.static(__dirname+'/static'));

const loader = new TwingLoaderFilesystem("./templates");
const twing = new TwingEnvironment(loader);

app.get('/login', (request, response) => {
    twing.render("login.html.twig").then(output => {
        response.end(output);
    });
});

app.get('/logout', function(request, response){
    request.session.destroy(function(){
        if(DEBUG_MODE) console.log("user logged out.");
    });
    response.redirect('/login');
});

app.post('/login', async function(request, response){
    if(!request.body.username || !request.body.password){
        twing.render("login.html.twig", {message: "Please enter both username and password"}).then(output => {
            response.end(output);
        });
    } else {
        if(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD){
            if(process.env.ADMIN_USERNAME === request.body.username && process.env.ADMIN_PASSWORD === request.body.password){
                request.session.user = {
                    admin: true,
                    username: request.body.username,
                    password: request.body.password 
                };
                response.redirect('/');
                return ;
              }
        }

        if(process.env.LDAP_HOST){
            
            try{
                let authenticated = await authenticate({
                    ldapOpts: {
                        url: process.env.LDAP_HOST,
                        tlsOptions: { rejectUnauthorized: process.env.LDAP_SKIP_SSL === '1' ? false : true }
                    },
                    starttls: process.env.LDAP_START_TLS === '1' ? true : false,
                    adminDn: process.env.LDAP_BIND_DN,
                    adminPassword: process.env.LDAP_BIND_PASSWORD,
                    userPassword: request.body.password,
                    userSearchBase: process.env.LDAP_SEARCH_BASE,
                    usernameAttribute: process.env.LDAP_SEARCH_FILTER,
                    username: request.body.username,
                    attributes: ['groups', 'givenName', 'sn', 'sAMAccountName', 'userPrincipalName', 'memberOf', 'gecos' ]
                });
                if(DEBUG_MODE) console.log('Authenticated user : ',authenticated);
                if(authenticated){
                    let groups = authenticated.memberOf ? authenticated.memberOf : authenticated.groups.split('|');
                    let availableNamespaces = [];
                    try{
                        if(process.env.NAMESPACE_FILTERING){
                            var filtering = JSON.parse(process.env.NAMESPACE_FILTERING);
                            for (var i in groups){
                                for(var j in filtering){
                                    if(filtering[j].group === groups[i]){
                                        for(var k in filtering[j].namespaces){
                                            if(availableNamespaces.indexOf(filtering[j].namespaces[k]) === -1){
                                                availableNamespaces.push(filtering[j].namespaces[k]);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }catch (err) {
                        console.error(err);
                    }

                    request.session.user = {
                        admin: false,
                        username: authenticated.gecos ? authenticated.gecos : request.body.username,
                        password: request.body.password,
                        groups: groups,
                        namespaces: availableNamespaces
                    };

                    response.redirect('/');
                    return ;
                }
            } catch (err) {
                console.error(err);
            }
        }
        
       twing.render("login.html.twig", {message:"Invalid credentials!"}).then(output => {
            response.end(output);
        });
    }
});

app.get("/", async (request, response) => {
    if(!request.session.user) return response.redirect('/login');
    twing.render("index.html.twig", { user: request.session.user.username }).then(output => {
        response.end(output);
    });
});

app.get('/api/status', async (request, response) => {
    if(!request.session.user) return response.status(403).json({});
    const deployStatus = await k8sApi.readNamespacedDeploymentStatus('velero', VELERO_NAMESPACE);
    const backupStorageLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'backupstoragelocations');
    const volumeSnapshotLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'volumesnapshotlocations');
   
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
    if(!request.session.user) return response.status(403).json({});
    let backups = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'backups');
    // filter
    let user = request.session.user;
    if(!user.admin && process.env.NAMESPACE_FILTERING){
        let availableBackups = [];
        let allBAckups = backups.body.items;
        for(let i in allBAckups){
            var hasAccess = true;
            for(var j in allBAckups[i].spec.includedNamespaces){
                if(user.namespaces.indexOf(allBAckups[i].spec.includedNamespaces[j]) === -1){
                    hasAccess = false;
                    break;
                }
            }
            if(hasAccess && allBAckups[i].spec.includedNamespaces && allBAckups[i].spec.includedNamespaces.length > 0){
                availableBackups.push(allBAckups[i]);
            }
        }
        response.send(availableBackups);
        return;
    }
    response.send(backups.body.items);
});

app.post('/api/backups', async (request, response) => {
    if(!request.session.user) return response.status(403).json({});
    try {
        // filtering
        let schedule  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'schedules', request.body.schedule);
        let user = request.session.user;
        if(!user.admin && process.env.NAMESPACE_FILTERING){
            var hasAccess = true;
            for(var i in schedule.body.spec.template.includedNamespaces){
                if(user.namespaces.indexOf(schedule.body.spec.template.includedNamespaces[i]) === -1){
                    hasAccess = false;
                    break;
                }
            }
            if(!hasAccess || !schedule.body.spec.template.includedNamespaces || !schedule.body.spec.template.includedNamespaces.length > 0){
                return response.status(403).json({});
            }
        }
        
        // create backup
        var body = {
            "apiVersion": "velero.io/v1",
            "kind": "Backup",
            "metadata": {
                "name": request.body.name,
                "namespace": VELERO_NAMESPACE
            },
            "spec": {
                "defaultVolumesToRestic": USE_RESTIC,
                "includedNamespaces": schedule.body.spec.template.includedNamespaces,
                "storageLocation": "default",
                "volumeSnapshotLocations": ["default"],
                "ttl": schedule.body.spec.template.ttl
            }
        }
        var returned = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'backups', body);
        response.send({'status': true, 'backup': returned.response.body});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});

app.get('/api/restores', async (request, response) => {
    if(!request.session.user) return response.status(403).json({});
    let restores  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'restores');
    // filter
    let user = request.session.user;
    if(!user.admin && process.env.NAMESPACE_FILTERING){
        let availableRestores = [];
        let allRestores = restores.body.items;
        for(let i in allRestores){
            var hasAccess = true;
            for(var j in allRestores[i].spec.includedNamespaces){
                if(user.namespaces.indexOf(allRestores[i].spec.includedNamespaces[j]) === -1){
                    hasAccess = false;
                    break;
                }
            }
            if(hasAccess && allRestores[i].spec.includedNamespaces && allRestores[i].spec.includedNamespaces.length > 0){
                availableRestores.push(allRestores[i]);
            }
        }
        response.send(availableRestores);
        return;
    }
    response.send(restores.body.items);
});

app.post('/api/restores', async (request, response) => {
    if(!request.session.user) return response.status(403).json({});
    try {
        // filtering
        let backup  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'backups', request.body.backup);
        let user = request.session.user;
        if(!user.admin && process.env.NAMESPACE_FILTERING){
            var hasAccess = true;
            for(var i in backup.body.spec.includedNamespaces){
                if(user.namespaces.indexOf(backup.body.spec.includedNamespaces[i]) === -1){
                    hasAccess = false;
                    break;
                }
            }
            if(!hasAccess || !backup.body.spec.includedNamespaces || !backup.body.spec.includedNamespaces.length > 0){
                return response.status(403).json({});
            }
        }
        
        // create restore
        var body = {
            "apiVersion": "velero.io/v1",
            "kind": "Restore",
            "metadata": {
                "namespace": VELERO_NAMESPACE,
                "name": request.body.name,
            },
            "spec": {
                "backupName": request.body.backup,
                "defaultVolumesToRestic": USE_RESTIC,
                "includedNamespaces": backup.body.spec.includedNamespaces,
                "storageLocation": "default",
                "excludedResources": ["nodes", "events", "events.events.k8s.io", "backups.velero.io", "restores.velero.io", "resticrepositories.velero.io"],
                "ttl": "720h0m0s"
            }
        }
        var returned = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'restores', body);
        response.send({'status': true, 'restore': returned.response.body});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});

app.get('/api/schedules', async (request, response) => {
    if(!request.session.user) return response.status(403).json({});
    let schedules  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'schedules');
    // filter
    let user = request.session.user;
    if(!user.admin && process.env.NAMESPACE_FILTERING){
        let availableRestores = [];
        let allSchedules = schedules.body.items;
        for(let i in allSchedules){
            var hasAccess = true;
            for(var j in allSchedules[i].spec.template.includedNamespaces){
                if(user.namespaces.indexOf(allSchedules[i].spec.template.includedNamespaces[j]) === -1){
                    hasAccess = false;
                    break;
                }
            }
            if(hasAccess && allSchedules[i].spec.template.includedNamespaces && allSchedules[i].spec.template.includedNamespaces.length > 0){
                availableRestores.push(allSchedules[i]);
            }
        }
        response.send(availableRestores);
        return;
    }
    
    response.send(schedules.body.items);
});

app.post('/api/schedules', async (request, response) => {
    if(!request.session.user || !request.session.user.admin) return response.status(403).json({});
    try {
        var body = {
            "apiVersion": "velero.io/v1",
            "kind": "Schedule",
            "metadata": {
                "namespace": VELERO_NAMESPACE,
                "name": request.body.name,
            },
            "spec": {
                "schedule": request.body.schedule,
                "template": {
                    "ttl": request.body.ttl ? request.body.ttl : "360h0m0s",
                    "includedNamespaces": ["ovpn"],
                    "defaultVolumesToRestic": USE_RESTIC
                },
                "useOwnerReferencesInBackup": false
            }
        }
        var returned = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'schedules', body);
        response.send({'status': true, 'schedules': returned});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});

app.listen(process.env.APP_PORT | 3000, () => {
  console.log('Application started...')
});

module.exports = app;