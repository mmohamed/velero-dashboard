# Deploy testing My-Velero instance

## CSI Driver Hostpath for snapshot

```bash
git clone https://github.com/kubernetes-csi/csi-driver-host-path.git
cd csi-driver-host-path/
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/release-6.3/client/config/crd/snapshot.storage.k8s.io_volumesnapshotclasses.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/release-6.3/client/config/crd/snapshot.storage.k8s.io_volumesnapshotcontents.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/release-6.3/client/config/crd/snapshot.storage.k8s.io_volumesnapshots.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/v6.3.3/deploy/kubernetes/snapshot-controller/rbac-snapshot-controller.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes-csi/external-snapshotter/v6.3.3/deploy/kubernetes/snapshot-controller/setup-snapshot-controller.yaml
deploy/kubernetes-latest/deploy.sh
# @Ref : https://dev.to/darkedges/deploy-the-csi-driver-hostpath-to-kubernetes-n-windows-docker-4dlj
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: csi-hostpath-sc
provisioner: hostpath.csi.k8s.io
reclaimPolicy: Delete
volumeBindingMode: Immediate
allowVolumeExpansion: true
EOF
# Default
kubectl annotate volumesnapshotclasses csi-hostpath-snapclass snapshot.storage.kubernetes.io/is-default-class="true"
kubectl patch storageclass csi-hostpath-sc -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
kubectl patch storageclass hostpath -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
# App
kubectl apply -f app.yaml

```

## Install

```bash
kubectl create namespace velero

# SSL for OIDC server
# pass: pass
openssl genrsa -des3 -out rootCA.key 2048
openssl req -x509 -new -nodes -key rootCA.key -sha256 -days 1825 -out rootCA.pem
openssl genrsa -out oidcserver.key 2048
openssl req -new -key oidcserver.key -out oidcserver.csr
openssl x509 -req -in oidcserver.csr -CA rootCA.pem -CAkey rootCA.key -CAcreateserial -out oidcserver.crt -days 825 -sha256
openssl pkcs12 -export -out oidcserver.pfx -inkey oidcserver.key -in oidcserver.crt
openssl x509 -outform PEM -in oidcserver.crt -out oidcserver.pem
kubectl create secret generic oidc-ssl -n velero --from-file=medinvention.dev.pfx=oidcserver.pfx

# Deploy local MinIO for Velero backup location
kubectl apply -f minio-dev.yaml --namespace velero
# Install Velero (v1.15.2)
wget https://github.com/vmware-tanzu/velero/releases/download/v1.15.2/velero-v1.15.2-linux-amd64.tar.gz
tar -zxvf velero-v1.15.2-linux-amd64.tar.gz
sudo cp velero-v1.15.2-linux-amd64/velero /usr/local/bin/velero-1.15.2
sudo ln -sf /usr/local/bin/velero-1.15.2 /usr/local/bin/velero
velero install \
    --provider aws \
    --plugins velero/velero-plugin-for-aws:v1.11.1 \
    --bucket velero \
    --use-node-agent \
    --secret-file ./credentials-velero \
    --use-volume-snapshots=true \
    --features=EnableCSI \
    --backup-location-config region=minio,s3ForcePathStyle="true",s3Url=http://172.20.96.1:32541 --dry-run -o yaml | kubectl apply -f -
# Deploy local ldap account for testing
kubectl apply -f ldap-dev.yaml --namespace velero
# Deploy OIDC server @Ref: https://github.com/Soluto/oidc-server-mock
kubectl apply -f oidc-dev.yaml --namespace velero
# Deploy My-Velero
kubectl apply -f my-velero.yaml --namespace velero
# Test is
velero backup create backup --include-namespaces="devops" --snapshot-volumes=true --snapshot-move-data=true --resource-policies-configmap=volume-policies --include-cluster-resources=false
```

## Tips

- Restore CRD validation error for v1.12 [@see](https://github.com/vmware-tanzu/velero/issues/6382)

```bash
kubectl patch crd restores.velero.io --type json -p='[{"op": "remove", "path": "/spec/versions/0/schema/openAPIV3Schema/properties/spec/properties/hooks/properties/resources/items/properties/postHooks/items/properties/init/properties/initContainers/x-kubernetes-preserve-unknown-fields"}]'
```
