
const data = {
    oddCall: false,
    backups: function(){
        return [
            {spec: {includedNamespaces: ['ns1', 'ns2']}, metadata: {name: 'backup-first'}},
            {spec: {includedNamespaces: ['ns1', 'ns3']}, metadata: {name: 'backup-second'}}
        ]
    },
    namespaces: function(){
        return [
            {metadata: {name: 'ns1'}},
            {metadata: {name: 'ns2'}},
            {metadata: {name: 'ns3'}}
        ]
    },
    backupstoragelocations: function(){
        return [
            {metadata: {name: 'default'}},
            {metadata: {name: 'backupstoragelocations'}}
        ]
    },
    volumesnapshotlocations: function(){
        return [
            {metadata: {name: 'default'}},
            {metadata: {name: 'volumesnapshotlocations'}}
        ]
    },
    downloadrequests: function(){
        this.oddCall = !this.oddCall;
        return [
            {
                metadata: {
                    namespace: 'velero', 
                    name: 'backup-first-result-download-request'
                }, 
                spec: {
                    target: {
                        kind: 'BackupResults', 
                        name: 'backup-first'
                    }
                },
                status: {
                    phase: this.oddCall ? 'Processing' : 'Processed',
                    downloadURL: 'http://fakeurl/result'
                }
            },
            {
                metadata: {
                    namespace: 'velero', 
                    name: 'backup-first-log-download-request'
                }, 
                spec: {
                    target: {
                        kind: 'BackupLog', 
                        name: 'backup-first'
                    }
                },
                status: {
                    phase: this.oddCall ? 'Processing' : 'Processed',
                    downloadURL: 'http://fakeurl/log'
                }
            },
        ]
    }
}

module.exports = data;
