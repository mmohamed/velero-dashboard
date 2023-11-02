


kubectl create namespace velero

kubectl apply -f minio-dev.yaml --namespace velero

velero install \
    --provider aws \
    --plugins velero/velero-plugin-for-aws:v1.2.1 \
    --bucket velero \
    --use-node-agent \
    --secret-file ./credentials-velero \
    --use-volume-snapshots=false \
    --backup-location-config region=minio,s3ForcePathStyle="true",s3Url=https://myvelero-minio.medinvention.dev

@see https://github.com/vmware-tanzu/velero/issues/6382
kubectl patch crd restores.velero.io --type json -p='[{"op": "remove", "path": "/spec/versions/0/schema/openAPIV3Schema/properties/spec/properties/hooks/properties/resources/items/properties/postHooks/items/properties/init/properties/initContainers/x-kubernetes-preserve-unknown-fields"}]'


kubectl apply -f ldap-dev.yaml --namespace velero

kubectl apply -f my-velero.yaml --namespace velero

velero backup create qrcode-backup --include-namespaces qrcode --default-volumes-to-fs-backup
