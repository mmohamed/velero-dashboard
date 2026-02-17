# Deploy testing My-Velero instance

## Install

```bash
kubectl create namespace velero
# Deploy local MinIO for Velero backup location
kubectl apply -f minio-dev.yaml --namespace velero
# Install Velero (v1.12)
wget https://github.com/vmware-tanzu/velero/releases/download/v1.12.1/velero-v1.12.1-linux-amd64.tar.gz
tar -zxvf velero-v1.12.1-linux-amd64.tar.gz
sudo cp velero-v1.12.1-linux-amd64/velero /usr/local/bin/velero-1.12.1
sudo ln -sf /usr/local/bin/velero-1.12.1 /usr/local/bin/velero
velero install \
    --provider aws \
    --plugins velero/velero-plugin-for-aws:v1.2.1 \
    --bucket velero \
    --use-node-agent \
    --secret-file ./credentials-velero \
    --use-volume-snapshots=false \
    --backup-location-config region=minio,s3ForcePathStyle="true",s3Url=https://myvelero-minio.medinvention.dev
# Deploy local ldap account for testing
kubectl apply -f ldap-dev.yaml --namespace velero
# Deploy My-Velero
kubectl apply -f my-velero.yaml --namespace velero
```

## Tips

- Restore CRD validation error for v1.12 [@see](https://github.com/vmware-tanzu/velero/issues/6382)

```bash
kubectl patch crd restores.velero.io --type json -p='[{"op": "remove", "path": "/spec/versions/0/schema/openAPIV3Schema/properties/spec/properties/hooks/properties/resources/items/properties/postHooks/items/properties/init/properties/initContainers/x-kubernetes-preserve-unknown-fields"}]'
``` 