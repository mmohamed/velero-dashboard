# My Velero Dashboard


docker run -p 389:389 -p 636:636 --name simple-ldap-server upekshejay/simple-ldap-test-server

ldapsearch -x -H ldap://127.0.0.1:389 -b "CN=nimal,OU=users,DC=mtr,DC=com" -D "CN=admin,OU=users,DC=mtr,DC=com" -W