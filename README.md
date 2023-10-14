# My Velero Dashboard


docker run -p 389:389 -p 636:636 --name simple-ldap-server upekshejay/simple-ldap-test-server

ldapsearch -x -H ldap://127.0.0.1:389 -b "CN=nimal,OU=users,DC=mtr,DC=com" -D "CN=admin,OU=users,DC=mtr,DC=com" -W


curl -X POST http://localhost:3001/api/schedules -H 'Content-Type: application/json' -d '{"name":"new-schedule-ovpn", "schedule": "0 1 * * 1,2,3,4,5,6"}'


velero schedule create --use-owner-references-in-backup new-schedule-ovpn --schedule="0 3 * * *" --include-namespaces=ovpn
