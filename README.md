# My Velero Dashboard

This is a very simplified Velero dashboard for backup, restore and schedule management inside a K8S cluster.

[![CircleCI](https://dl.circleci.com/status-badge/img/gh/mmohamed/velero-dashboard/tree/dev.svg?style=shield)](https://dl.circleci.com/status-badge/redirect/gh/mmohamed/velero-dashboard/tree/dev)


<img src="doc/home-demo.png" width="900">

---- 

## Features
### 1. User features
- Get Velero instance status
- Create new backup job from scratch
- Create new backup job from schedule
- Delete a backup
- Create new restore job from a backup
- Create new schedule
- Delete a schedule
- Pause / Unpause a schedule
- Get backup and restore result information (logs included)
### 2. App features
- Read only mode: if enabled, users (admin not included), can only get/see information about backup, restore and schedule without performing changes.
```ini
READ_ONLY_USER=true #default false
```
- LDAP authentication for users : if a LDAP is configured, users (in addition to the admin) can be authenticated and have access to the dashboard 
```ini
LDAP_HOST=ldaps://0.0.0.0:636
LDAP_SKIP_SSL=1
LDAP_START_TLS=0
LDAP_BIND_DN="CN=admin,OU=users,DC=mtr,DC=com"
LDAP_BIND_PASSWORD=<some-ldpa-dami-password>
LDAP_SEARCH_BASE="OU=users,DC=mtr,DC=com"
LDAP_SEARCH_FILTER=sAMAccountName
```
- Multi-tenant & User access namspaced scope : With LDAP configuration, you can define a scope control based on an assotioation of a LDAP groups and a list of namespace, for example, if a user X is member of LDAP group group-it, he can manage backup, restore and schedule with include-namespace associated to the group-it (all namespace mut be accessible by the user to see these resources)
```ini
NAMESPACE_FILTERING='[{"group": "group-it", "namespaces": ["ns1","ns2","ns3"]}]' # json list
```
- Velero default configuration : to define the Velero install namespace , and using FS Backup option by default
```ini
VELERO_NAMESPACE=myvelero #default velero
USE_FSBACKUP=true #default false
```
- Debug mode: if is enabled, debug information will be written to stdout.
```ini
DEBUG=true #default false
```
- AuditLog mode: if is enabled, audit information (actor, action, object time, ...) will be written to stdout.
```ini
AUDIT_LOG=true #default false
```
- Web app options : to define Web app listening port ,  a secret key for session encryption and the admin credentials
```ini
SECRET_KEY=random-secret-key #default default-secret-mut-be-changed
APP_PORT=8080 #default 3000
ADMIN_USERNAME=admin #no default
ADMIN_PASSWORD=adminpassword #no default
```

## Building
### 1. Local running for dev 
Deploy a local dev LDAP server for user authentication
```bash
# Run local (kamal/itachi account available)
docker run -p 389:389 -p 636:636 --name simple-ldap-server upekshejay/simple-ldap-test-server
# Search example
ldapsearch -x -H ldap://127.0.0.1:389 -b "CN=nimal,OU=users,DC=mtr,DC=com" -D "CN=admin,OU=users,DC=mtr,DC=com" -W
```
Run app (the dashboard user your local .kube/config to access to Cluster)
```bash
npm start # access to http://localhost:3000
```
### 2. Docker image building
```bash
# Teting
npm test
# Building image
docker buildx build --push --platform linux/arm64,linux/arm/v7,linux/amd64 --tag medinvention/my-velero-dashboard:dev .
```

## Deployment
- Deploy a dev sample [available here](kubernetes) for testing
```bash
# make change to match you dev env (host, port, user/pass ...)
# S3 backend for Velero
kubectl apply -f ./kubernetes/minio-dev.yaml
# Install Velero
velero install .....
# Deploy Dev LDAP sever
kubectl apply -f ./kubernetes/ldap-dev.yaml
# Deploy My-Velero (dev)
kubectl apply -f ./kubernetes/my-velero.yaml
```

## Resources
- [Velero Compatibility Matrix](https://github.com/vmware-tanzu/velero#velero-compatibility-matrix)
- Releases : `<app-version>-<channel>-<velero-version-master>`


## Contribute
This is an open project; all contribution is welcome. Pull Request & Issues are opened for all.


Enjoy :)

---- 

[*Contact & More information*](https://blog.medinvention.dev)