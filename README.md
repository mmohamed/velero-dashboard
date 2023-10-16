# My Velero Dashboard

## LDAP Dev Server
docker run -p 389:389 -p 636:636 --name simple-ldap-server upekshejay/simple-ldap-test-server
ldapsearch -x -H ldap://127.0.0.1:389 -b "CN=nimal,OU=users,DC=mtr,DC=com" -D "CN=admin,OU=users,DC=mtr,DC=com" -W

## Build
docker buildx build --push --platform linux/arm64,linux/arm/v7,linux/amd64 --tag medinvention/my-velero-dashboard:1.0.4-beta .