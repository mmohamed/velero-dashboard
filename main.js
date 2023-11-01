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

const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi)
const app = express();
const VELERO_NAMESPACE = process.env.VELERO_NAMESPACE ?  process.env.VELERO_NAMESPACE : 'velero'
const USE_FSBACKUP = process.env.USE_FSBACKUP==="1" ? true : false;
const DEBUG_MODE = process.env.DEBUG==="1" ? true : false;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({secret: process.env.SECRET_KEY}));
app.use(express.static(__dirname+'/static'));

const loader = new TwingLoaderFilesystem("./templates");
const twing = new TwingEnvironment(loader);

app.use((request, response, next) => {
    if(process.env.READ_ONLY_USER === '1'){
        if(request.method != 'GET' && request.url !== '/login'){
            if(!request.session || !request.session.user || !request.session.user.admin){
                return response.status(405).end('Method Not Allowed');
            }
        }
    }
    return next();
});

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
    let user = request.session.user;
    let readOnly = process.env.READ_ONLY_USER === '1' && !user.admin;
    twing.render("index.html.twig", { readonly: readOnly, user: user.username }).then(output => {
        response.end(output);
    });
});

app.use("/backup/new", async (request, response) => {
    if(!request.session.user) return response.status(403).json({});
    let user = request.session.user;
    let readOnly = process.env.READ_ONLY_USER === '1' && !user.admin;
    if(readOnly) return response.status(403).json({});

    const namespaces = await k8sApi.listNamespace();
    const backupStorageLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'backupstoragelocations');
    const volumeSnapshotLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'volumesnapshotlocations');
    
    // filter
    let availableNamespaces = [];
    if(!user.admin && process.env.NAMESPACE_FILTERING){
        let allNamespaces = namespaces.body.items;
        for(let i in allNamespaces){
            if(user.namespaces.indexOf(allNamespaces[i].metadata.name) != -1){
                availableNamespaces.push(allNamespaces[i]);
            }
        }
    }else{
        availableNamespaces = namespaces.body.items;
    }

    if (request.method === 'POST') {
        let errors = [];
        let message;
        let found;
        let bodyRequest =  request.body;
        if(!bodyRequest.name || bodyRequest.name.trim().length == 0){
            errors.push('name');
        }
        // includenamespace
        if(!bodyRequest.includenamespace || bodyRequest.includenamespace.length == 0){
            errors.push('includenamespace');
        }else{
            for(let i in bodyRequest.includenamespace){
                found = false
                for(let j in availableNamespaces){
                    if(bodyRequest.includenamespace[i] === availableNamespaces[j].metadata.name){
                        found = true;
                        break;
                    }
                }
                if(!found){
                    errors.push('includenamespace');
                    break;
                }
            }
        }
        // excludenamespace
        if(bodyRequest.excludenamespace){
            for(let i in bodyRequest.excludenamespace){
                found = false
                for(let j in availableNamespaces){
                    if(bodyRequest.excludenamespace[i] === availableNamespaces[j].metadata.name){
                        found = true;
                        break;
                    }
                }
                if(!found){
                    errors.push('excludenamespace');
                    break;
                }
            }
        }
        // retention
        if(!bodyRequest.retention || ['30', '60', '90'].indexOf(bodyRequest.retention) === -1){
            errors.push('retention');
        }
        // backuplocation
        if(!bodyRequest.backuplocation || bodyRequest.backuplocation.trim().length == 0){
            errors.push('backuplocation');
        }
        if(bodyRequest.backuplocation){
            found = false;
            for(let i in backupStorageLocations.body.items){
                if(bodyRequest.backuplocation === backupStorageLocations.body.items[i].metadata.name){
                    found = true;
                    break;
                }
            }
            if(!found){
                errors.push('backuplocation');
            }
        }
        // snapshotlocation
        if(bodyRequest.snapshot && bodyRequest.snapshot === '1'){
            if(!bodyRequest.snapshotlocation || bodyRequest.snapshotlocation.trim().length == 0){
                errors.push('snapshotlocation');
            }
            if(bodyRequest.snapshotlocation){
                found = false;
                for(let i in volumeSnapshotLocations.body.items){
                    if(bodyRequest.snapshotlocation === volumeSnapshotLocations.body.items[i].metadata.name){
                        found = true;
                        break;
                    }
                }
                if(!found){
                    errors.push('snapshotlocation');
                }
            }
        }
        if(!errors.length){
            // create backup
            var body = {
                "apiVersion": "velero.io/v1",
                "kind": "Backup",
                "metadata": {
                    "name": bodyRequest.name,
                    "namespace": VELERO_NAMESPACE,
                    "labels": bodyRequest.backuplabels ? bodyRequest.backuplabels.split(',') : {}
                },
                "spec": {
                    "defaultVolumesToFsBackup": bodyRequest.fsbackup === '1' ? true : false,
                    "includedNamespaces": bodyRequest.includenamespace,
                    "excludedNamespaces": bodyRequest.excludenamespace ? bodyRequest.excludenamespace : [],
                    "includedResources": bodyRequest.includeresources ? bodyRequest.includeresources.trim().split(',') : [],
                    "excludedResources": bodyRequest.excluderesources ? bodyRequest.excluderesources.trim().split(',') : [],
                    "includeClusterResources" : bodyRequest.cluster === '1' && user.admin ? true : false,
                    "snapshotVolumes": bodyRequest.snapshot === '1' ? true : null,
                    "storageLocation": bodyRequest.backuplocation,
                    "volumeSnapshotLocations": bodyRequest.snapshotlocation ? [bodyRequest.snapshotlocation]: [],
                    "ttl": (parseInt(bodyRequest.retention)*24)+'h0m0s'
                }
            }
            if(bodyRequest.useselector && bodyRequest.useselector.trim().length > 0){
                let selectors = bodyRequest.useselector.split(',');
                let labelSelector = {matchLabels: {}}
                for(let i in selectors){
                    if(selectors[i].split(':').length === 2){
                        labelSelector.matchLabels[selectors[i].split(':')[0]] = selectors[i].split(':')[1];
                    }
                }
                // @see https://github.com/vmware-tanzu/velero/issues/2083
                if(selectors.length > 0){
                    body.spec.labelSelector = labelSelector; 
                }
            }
            
            try {
                await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', VELERO_NAMESPACE, 'backups', body);
            } catch (err) {
                console.error(err);
                errors.push('global');
                message = err.body.message;
            }
        }

        twing.render("backup.form.html.twig", { 
            backup: bodyRequest,
            backupStorageLocations: backupStorageLocations.body.items,
            volumeSnapshotLocations: volumeSnapshotLocations.body.items,
            namespaces: availableNamespaces,
            errors: errors,
            message: message,
            user: user
        }).then(output => {
            response.status(errors.length ? 200 : 201).end(output);
        });

        return;
    }

    return twing.render("backup.form.html.twig", { 
        backupStorageLocations: backupStorageLocations.body.items,
        volumeSnapshotLocations: volumeSnapshotLocations.body.items,
        namespaces: availableNamespaces,
        user: user,
        defaultVolumesToFsBackup: USE_FSBACKUP
    }).then(output => {
        response.end(output);
    });
});


app.get('/api/status', async (request, response) => {
    if(!request.session.user) return response.status(403).json({});
    const deployStatus = await k8sAppsApi.readNamespacedDeploymentStatus('velero', VELERO_NAMESPACE);
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
                "defaultVolumesToFsBackup": USE_FSBACKUP,
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
                "defaultVolumesToFsBackup": USE_FSBACKUP,
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
                    "defaultVolumesToFsBackup": USE_FSBACKUP
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