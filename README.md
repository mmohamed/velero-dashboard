# My Velero Dashboard



## Developement
### 1-LDAP local Server
```bash
# Run local (kamal/itachi account available)
docker run -p 389:389 -p 636:636 --name simple-ldap-server upekshejay/simple-ldap-test-server
# Search example
ldapsearch -x -H ldap://127.0.0.1:389 -b "CN=nimal,OU=users,DC=mtr,DC=com" -D "CN=admin,OU=users,DC=mtr,DC=com" -W
```
### 2-Run Dev environment
```bash
npm start
```

## Build
```bash
docker buildx build --push --platform linux/arm64,linux/arm/v7,linux/amd64 --tag medinvention/my-velero-dashboard:latest .
```

## Links
- Velero Compatibility Matrix : https://github.com/vmware-tanzu/velero#velero-compatibility-matrix