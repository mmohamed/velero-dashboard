const data = {
  oddCall: false,
  backups: function () {
    return [
      { spec: { includedNamespaces: ['ns1', 'ns2'], storageLocation: 'default' }, metadata: { name: 'backup-first' } },
      { spec: { includedNamespaces: ['ns1', 'ns3'], storageLocation: 'default' }, metadata: { name: 'backup-second' } },
      { spec: { includedNamespaces: ['ns4'], storageLocation: 'default' }, metadata: { name: 'backup-third' } }
    ];
  },
  restores: function () {
    return [
      { spec: { includedNamespaces: ['ns1', 'ns2'], backupName: 'backup-first' }, metadata: { name: 'first-restore-from-backup-first' } },
      {
        spec: { includedNamespaces: ['ns1', 'ns3'], backupName: 'backup-second' },
        metadata: { name: 'second-restore-from-backup-second' }
      },
      { spec: { includedNamespaces: ['ns4'], backupName: 'backup-third' }, metadata: { name: 'third-restore-from-backup-third' } }
    ];
  },
  schedules: function () {
    return [
      { spec: { template: { includedNamespaces: ['ns1', 'ns2'] } }, metadata: { name: 'first-schedules' } },
      { spec: { template: { includedNamespaces: ['ns1', 'ns3'] } }, metadata: { name: 'second-schedules' } }
    ];
  },
  namespaces: function () {
    return [{ metadata: { name: 'ns1' } }, { metadata: { name: 'ns2' } }, { metadata: { name: 'ns3' } }];
  },
  backupstoragelocations: function () {
    return [
      {
        metadata: { name: 'default' },
        spec: { default: true, objectStorage: { caCert: 'ZmFrZWNhY2VydAo=' } },
        status: { phase: 'Available', lastSyncedTime: '2023-11-06T14:09:49Z' }
      },
      { metadata: { name: 'backupstoragelocations', spec: {} } }
    ];
  },
  volumesnapshotlocations: function () {
    return [{ metadata: { name: 'default' }, spec: { default: true } }, { metadata: { name: 'volumesnapshotlocations' } }];
  },
  downloadrequests: function () {
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
      {
        metadata: {
          namespace: 'velero',
          name: 'first-restore-from-backup-first-result-download-request'
        },
        spec: {
          target: {
            kind: 'RestoreResults',
            name: 'first-restore-from-backup-first'
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
          name: 'first-restore-from-backup-first-log-download-request'
        },
        spec: {
          target: {
            kind: 'RestoreLog',
            name: 'first-restore-from-backup-first'
          }
        },
        status: {
          phase: this.oddCall ? 'Processing' : 'Processed',
          downloadURL: 'http://fakeurl/log'
        }
      }
    ];
  }
};

module.exports = data;
