const express = require('express');
const k8s = require('@kubernetes/client-node');
const bodyParser = require('body-parser');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const cron = require('cron-validator');
const { authenticate } = require('ldap-authentication');
const axios = require('axios');
const zlib = require('zlib');
const { TwingEnvironment, TwingLoaderFilesystem } = require("twing");
const { version } = require('../package.json');
const config = require('./config');

require('dotenv').config();

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi)
const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({secret: config.secretKey(), resave: true, saveUninitialized: true}));
app.use(express.static(__dirname+'/../static'));

const loader = new TwingLoaderFilesystem("./templates");
const twing = new TwingEnvironment(loader);

app.use((request, response, next) => {
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
});

app.get('/login', (request, response) => {
    twing.render("login.html.twig").then(output => {
        response.end(output);
    });
});

app.get('/logout', function(request, response){
    request.session.destroy(function(){
        config.debug("user logged out.");
    });
    response.redirect('/login');
});

app.post('/login', async function(request, response){
    if(!request.body.username || !request.body.password){
        twing.render("login.html.twig", {message: "Please enter both username and password"}).then(output => {
            response.end(output);
        });
    } else {
        let adminAccount = config.admin();
        if(adminAccount){
            if(adminAccount.username === request.body.username && adminAccount.password === request.body.password){
                request.session.user = {
                    isAdmin: true,
                    username: request.body.username,
                    password: request.body.password 
                };
                response.redirect('/');
                return ;
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
                    let availableNamespaces = [];
                    try{
                        var filtering = config.filtering();
                        if(filtering){
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
                        isAdmin: false,
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

app.get('/', async (request, response) => {
    if(!request.session.user) return response.redirect('/login');
    let user = request.session.user;
    let readOnly = config.readOnlyMode() && !user.isAdmin;
    twing.render("index.html.twig", { version: version, readonly: readOnly, user: user.username }).then(output => {
        response.end(output);
    });
});

app.use('/backup/new', async (request, response) => {
    let user = request.session.user;
    let readOnly = config.readOnlyMode() && !user.isAdmin;
    if(readOnly) return response.status(403).json({});

    const namespaces = await k8sApi.listNamespace();
    const backupStorageLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backupstoragelocations');
    const volumeSnapshotLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'volumesnapshotlocations');
    
    // filter
    let availableNamespaces = [];
    if(!user.isAdmin && config.filtering()){
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
            let labels = {};
            if(bodyRequest.backuplabels && bodyRequest.backuplabels.trim().length > 0) {
                let i, element, input = bodyRequest.backuplabels.trim().split(',');
                for(i in input){
                    element = input[i].trim().split('=');
                    if(element.length === 2){
                        labels[element[0]] = element[1];
                    }
                }
            }
            // create backup
            let body = {
                "apiVersion": "velero.io/v1",
                "kind": "Backup",
                "metadata": {
                    "name": bodyRequest.name,
                    "namespace": config.namespace(),
                    "labels": labels
                },
                "spec": {
                    "defaultVolumesToFsBackup": bodyRequest.fsbackup === '1' ? true : false,
                    "includedNamespaces": bodyRequest.includenamespace,
                    "excludedNamespaces": bodyRequest.excludenamespace ? bodyRequest.excludenamespace : [],
                    "includedResources": bodyRequest.includeresources ? bodyRequest.includeresources.trim().split(',') : [],
                    "excludedResources": bodyRequest.excluderesources ? bodyRequest.excluderesources.trim().split(',') : [],
                    "includeClusterResources" : bodyRequest.cluster === '1' && user.isAdmin ? true : false,
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
                await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backups', body);
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
        defaultVolumesToFsBackup: config.useFSBackup()
    }).then(output => {
        response.end(output);
    });
});


app.get("/backups/result/:name", async (request, response) => {
    try {
        // filtering
        let backup  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backups', request.params.name);
        let user = request.session.user;
        let downloadRequestName = request.params.name + '-result-download-request-' + Math.floor(Date.now() / 1000);
        if(!user.isAdmin && config.filtering()){
            let hasAccess = true;
            for(let i in backup.body.spec.includedNamespaces){
                if(user.namespaces.indexOf(backup.body.spec.includedNamespaces[i]) === -1){
                    hasAccess = false;
                    break;
                }
            }
            if(!hasAccess || !backup.body.spec.includedNamespaces || !backup.body.spec.includedNamespaces.length > 0){
                return response.status(403).json({});
            }
        }
        // create download request for result
        let body = {
            "apiVersion": "velero.io/v1",
            "kind": "DownloadRequest",
            "metadata": {
                "namespace": config.namespace(),
                "name": downloadRequestName,
            },
            "spec": {
                "target": {
                    "kind": "BackupResults",
                    "name": request.params.name
                }
            }
        }
        let downloadRequest = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'downloadrequests', body);
        
        let isProcessed = false, retry = 0, downloadResultLink = null;
        while(!isProcessed && retry < 15){
            downloadRequest  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'downloadrequests', downloadRequestName);
            if(downloadRequest.response.body.status && downloadRequest.response.body.status.phase == 'Processed'){
                isProcessed = true;
                downloadResultLink = downloadRequest.response.body.status.downloadURL;
            }else{
                await config.delay(1000);
            }
            retry++;
        }

        downloadRequestName = request.params.name + '-log-download-request-' + Math.floor(Date.now() / 1000);
        // create download request for log
        body = {
            "apiVersion": "velero.io/v1",
            "kind": "DownloadRequest",
            "metadata": {
                "namespace": config.namespace(),
                "name": downloadRequestName,
            },
            "spec": {
                "target": {
                    "kind": "BackupLog",
                    "name": request.params.name
                }
            }
        }
        downloadRequest = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'downloadrequests', body);
        isProcessed = false, retry = 0;
        let downloadLogLink = null;
        while(!isProcessed && retry < 15){
            downloadRequest  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'downloadrequests', downloadRequestName);
            if(downloadRequest.response.body.status && downloadRequest.response.body.status.phase == 'Processed'){
                isProcessed = true;
                downloadLogLink = downloadRequest.response.body.status.downloadURL;
            }else{
                await config.delay(1000);
            }
            retry++;
        }

        // download result file
        let jsonResult = null;
        if(downloadResultLink){          
            let { data } = await axios.get(downloadResultLink, { responseType: 'arraybuffer', 'decompress': false });
            jsonResult = JSON.parse(zlib.unzipSync(data).toString());
        }
        // download log file
        let logResult = null;
        if(downloadLogLink){          
            let { data } = await axios.get(downloadLogLink, { responseType: 'arraybuffer', 'decompress': false });
            logResult = zlib.unzipSync(data).toString();
        }
        
        return twing.render("result.html.twig", { 
            errors: jsonResult && jsonResult.errors ? config.toArray(jsonResult.errors) : null,
            warnings: jsonResult && jsonResult.warnings ? config.toArray(jsonResult.warnings) : null,
            log: logResult,
        }).then(output => {
            response.end(output);
        });

    } catch (err) {
        console.error(err);
    }

    return twing.render("result.html.twig").then(output => {
        response.end(output);
    });
});

app.use("/schedule/new", async (request, response) => {
    let user = request.session.user;
    let readOnly = config.readOnlyMode() && !user.isAdmin;
    if(readOnly) return response.status(403).json({});

    const namespaces = await k8sApi.listNamespace();
    const backupStorageLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backupstoragelocations');
    const volumeSnapshotLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'volumesnapshotlocations');

    // filter
    let availableNamespaces = [];
    if(!user.isAdmin && config.filtering()){
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
        if(!bodyRequest.cron || bodyRequest.cron.trim().length == 0){
            errors.push('cron');
        }
        if(!cron.isValidCron(bodyRequest.cron)){
            errors.push('cron');
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
            let labels = {};
            if(bodyRequest.backuplabels && bodyRequest.backuplabels.trim().length > 0) {
                let i, element, input = bodyRequest.backuplabels.trim().split(',');
                for(i in input){
                    element = input[i].trim().split('=');
                    if(element.length === 2){
                        labels[element[0]] = element[1];
                    }
                }
            }
            // create schedule
            var body = {
                "apiVersion": "velero.io/v1",
                "kind": "Schedule",
                "metadata": {
                    "name": bodyRequest.name,
                    "namespace": config.namespace(),
                    "labels": labels
                },
                "spec": {
                    "template": {
                        "defaultVolumesToFsBackup": bodyRequest.fsbackup === '1' ? true : false,
                        "includedNamespaces": bodyRequest.includenamespace,
                        "excludedNamespaces": bodyRequest.excludenamespace ? bodyRequest.excludenamespace : [],
                        "includedResources": bodyRequest.includeresources ? bodyRequest.includeresources.trim().split(',') : [],
                        "excludedResources": bodyRequest.excluderesources ? bodyRequest.excluderesources.trim().split(',') : [],
                        "includeClusterResources" : bodyRequest.cluster === '1' && user.isAdmin ? true : false,
                        "snapshotVolumes": bodyRequest.snapshot === '1' ? true : null,
                        "storageLocation": bodyRequest.backuplocation,
                        "volumeSnapshotLocations": bodyRequest.snapshotlocation ? [bodyRequest.snapshotlocation]: [],
                        "ttl": (parseInt(bodyRequest.retention)*24)+'h0m0s',
                    },
                    "schedule": bodyRequest.cron,
                    "useOwnerReferencesInBackup" : bodyRequest.ownerreferences === '1' ? true : false
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
                await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'schedules', body);
            } catch (err) {
                console.error(err);
                errors.push('global');
                message = err.body.message;
            }
        }

        twing.render("schedule.form.html.twig", { 
            schedule: bodyRequest,
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

    return twing.render("schedule.form.html.twig", { 
        backupStorageLocations: backupStorageLocations.body.items,
        volumeSnapshotLocations: volumeSnapshotLocations.body.items,
        namespaces: availableNamespaces,
        user: user,
        defaultVolumesToFsBackup: config.useFSBackup()
    }).then(output => {
        response.end(output);
    });
});

app.get("/restores/result/:name", async (request, response) => {
    try {
        // filtering
        let restore  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'restores', request.params.name);
        if(!restore) return response.status(404).json({});
        let user = request.session.user;
        let downloadRequestName = request.params.name + '-result-download-request-' + Math.floor(Date.now() / 1000);
        if(!user.isAdmin && config.filtering()){
            let hasAccess = true;
            for(let i in restore.body.spec.includedNamespaces){
                if(user.namespaces.indexOf(restore.body.spec.includedNamespaces[i]) === -1){
                    hasAccess = false;
                    break;
                }
            }
            if(!hasAccess || !restore.body.spec.includedNamespaces || !restore.body.spec.includedNamespaces.length > 0){
                return response.status(403).json({});
            }
        }
        // create download request for result
        let body = {
            "apiVersion": "velero.io/v1",
            "kind": "DownloadRequest",
            "metadata": {
                "namespace": config.namespace(),
                "name": downloadRequestName,
            },
            "spec": {
                "target": {
                    "kind": "RestoreResults",
                    "name": request.params.name
                }
            }
        }
        let downloadRequest = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'downloadrequests', body);
        
        let isProcessed = false, retry = 0, downloadResultLink = null;
        while(!isProcessed && retry < 15){
            downloadRequest  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'downloadrequests', downloadRequestName);
            if(downloadRequest.response.body.status && downloadRequest.response.body.status.phase == 'Processed'){
                isProcessed = true;
                downloadResultLink = downloadRequest.response.body.status.downloadURL;
            }else{
                await config.delay(1000);
            }
            retry++;
        }

        downloadRequestName = request.params.name + '-log-download-request-' + Math.floor(Date.now() / 1000);
        // create download request for log
        body = {
            "apiVersion": "velero.io/v1",
            "kind": "DownloadRequest",
            "metadata": {
                "namespace": config.namespace(),
                "name": downloadRequestName,
            },
            "spec": {
                "target": {
                    "kind": "RestoreLog",
                    "name": request.params.name
                }
            }
        }
        downloadRequest = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'downloadrequests', body);
        isProcessed = false, retry = 0;
        let downloadLogLink = null;
        while(!isProcessed && retry < 15){
            downloadRequest  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'downloadrequests', downloadRequestName);
            if(downloadRequest.response.body.status && downloadRequest.response.body.status.phase == 'Processed'){
                isProcessed = true;
                downloadLogLink = downloadRequest.response.body.status.downloadURL;
            }else{
                await config.delay(1000);
            }
            retry++;
        }

        // download result file
        let jsonResult = null;
        if(downloadResultLink){          
            let { data } = await axios.get(downloadResultLink, { responseType: 'arraybuffer', 'decompress': false });
            jsonResult = JSON.parse(zlib.unzipSync(data).toString());
        }
        // download log file
        let logResult = null;
        if(downloadLogLink){          
            let { data } = await axios.get(downloadLogLink, { responseType: 'arraybuffer', 'decompress': false });
            logResult = zlib.unzipSync(data).toString();
        }
        
        return twing.render("result.html.twig", { 
            errors: jsonResult && jsonResult.errors ? config.toArray(jsonResult.errors) : null,
            warnings: jsonResult && jsonResult.warnings ? config.toArray(jsonResult.warnings) : null,
            log: logResult,
        }).then(output => {
            response.end(output);
        });

    } catch (err) {
        console.error(err);
    }

    return twing.render("result.html.twig").then(output => {
        response.end(output);
    });
});

app.post('/schedules/execute', async (request, response) => {
    try {
        // filtering
        let schedule  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'schedules', request.body.schedule);
        let user = request.session.user;
        if(!user.isAdmin && config.filtering()){
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
                "namespace": config.namespace()
            },
            "spec": schedule.body.spec.template
        }
        var returned = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backups', body);
        response.send({'status': true, 'backup': returned.response.body});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});

app.post('/schedules/toggle', async (request, response) => {
    try {
        // filtering
        let schedule  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'schedules', request.body.schedule);
        let user = request.session.user;
        if(!user.isAdmin && config.filtering()){
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
        
        // patch schedule
        var patch = [{
              "op": schedule.body.spec.paused ? "remove" : "replace",
              "path":"/spec/paused",
              "value": true
        }];
        var options = { "headers": { "Content-type": k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH}};
        var returned = await customObjectsApi.patchNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'schedules', request.body.schedule, patch, undefined, undefined, undefined, options);
        response.send({'status': false, 'state': returned.response.body.spec.paused});
    } catch (err) {
        console.error('Error patching shcedule : '+err.body.message);
        response.send({'status': false});
    }
});

app.get('/status', async (request, response) => {
    const deployStatus = await k8sAppsApi.readNamespacedDeploymentStatus('velero', config.namespace());
    const backupStorageLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backupstoragelocations');
    const volumeSnapshotLocations  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'volumesnapshotlocations');
   
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

app.get('/backups', async (request, response) => {
    let backups = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backups');
    // filter
    let user = request.session.user;
    if(!user.isAdmin && config.filtering()){
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

app.delete('/backups', async (request, response) => {
    try {
        // filtering
        let backup  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backups', request.body.backup);
        let user = request.session.user;
        if(!user.isAdmin && config.filtering()){
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
        
        // create delete backup request
        var body = {
            "apiVersion": "velero.io/v1",
            "kind": "DeleteBackupRequest",
            "metadata": {
                "name": request.body.name,
                "namespace": config.namespace()
            },
            "spec": {
                "backupName": request.body.backup
            }
        }
        var returned = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'deletebackuprequests', body);
        response.send({'status': true, 'backup': returned.response.body});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});

app.get('/restores', async (request, response) => {
    let restores  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'restores');
    // filter
    let user = request.session.user;
    if(!user.isAdmin && config.filtering()){
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

app.post('/restores', async (request, response) => {
    try {
        // filtering
        let backup  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'backups', request.body.backup);
        let user = request.session.user;
        if(!user.isAdmin && config.filtering()){
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
                "namespace": config.namespace(),
                "name": request.body.name,
            },
            "spec": {
                "backupName": request.body.backup,
                "defaultVolumesToFsBackup": config.useFSBackup(),
                "includedNamespaces": backup.body.spec.includedNamespaces,
                "storageLocation": "default",
                "excludedResources": ["nodes", "events", "events.events.k8s.io", "backups.velero.io", "restores.velero.io", "resticrepositories.velero.io", "csinodes.storage.k8s.io", "volumeattachments.storage.k8s.io", "backuprepositories.velero.io"],
                "ttl": "720h0m0s"
            }
        }
        var returned = await customObjectsApi.createNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'restores', body);
        response.send({'status': true, 'restore': returned.response.body});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});

app.get('/schedules', async (request, response) => {
    let schedules  = await customObjectsApi.listNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'schedules');
    // filter
    let user = request.session.user;
    if(!user.isAdmin && config.filtering()){
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

app.delete('/schedules', async (request, response) => {
    try {
        // filtering
        let schedule  = await customObjectsApi.getNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'schedules', request.body.schedule);
        let user = request.session.user;
        if(!user.isAdmin && config.filtering()){
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
        var returned = await customObjectsApi.deleteNamespacedCustomObject('velero.io', 'v1', config.namespace(), 'schedules', request.body.schedule);
        response.send({'status': true, 'backup': returned.response.body});
    } catch (err) {
        console.error(err);
        response.send({'status': false});
    }
});

module.exports = app;