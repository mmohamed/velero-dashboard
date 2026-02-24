const data = {
  oddCall: false,
  backups: function () {
    return [
      {
        spec: {
          includedNamespaces: ['ns1', 'ns2'],
          storageLocation: 'default',
          volumeSnapshotLocations: ['default'],
          defaultVolumesToFsBackup: false,
          snapshot: true,
          snapshotMoveData: false
        },
        metadata: { name: 'backup-first' },
        status: {}
      },
      {
        spec: {
          includedNamespaces: ['ns1', 'ns3'],
          storageLocation: 'default',
          defaultVolumesToFsBackup: true,
          snapshot: false,
          snapshotMoveData: false
        },
        metadata: { name: 'backup-second' },
        status: {}
      },
      {
        spec: {
          includedNamespaces: ['ns4'],
          storageLocation: 'default',
          volumeSnapshotLocations: ['default'],
          defaultVolumesToFsBackup: false,
          snapshot: true,
          snapshotMoveData: true
        },
        metadata: { name: 'backup-third' },
        status: {}
      }
    ];
  },
  restores: function () {
    return [
      {
        spec: { includedNamespaces: ['ns1', 'ns2'], backupName: 'backup-first' },
        metadata: { name: 'first-restore-from-backup-first' },
        status: {}
      },
      {
        spec: { includedNamespaces: ['ns1', 'ns3'], backupName: 'backup-second' },
        metadata: { name: 'second-restore-from-backup-second' },
        status: {}
      },
      {
        spec: { includedNamespaces: ['ns4'], backupName: 'backup-third' },
        metadata: { name: 'third-restore-from-backup-third' },
        status: {}
      }
    ];
  },
  schedules: function () {
    return [
      {
        spec: {
          template: {
            includedNamespaces: ['ns1', 'ns2'],
            volumeSnapshotLocations: ['default'],
            defaultVolumesToFsBackup: false,
            snapshot: true,
            snapshotMoveData: false
          }
        },
        metadata: { name: 'first-schedules' },
        status: {}
      },
      {
        spec: {
          template: {
            includedNamespaces: ['ns1', 'ns3'],
            volumeSnapshotLocations: ['default'],
            defaultVolumesToFsBackup: false,
            snapshot: true,
            snapshotMoveData: true
          }
        },
        metadata: { name: 'second-schedules' },
        status: {}
      }
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
      { metadata: { name: 'backupstoragelocations' }, spec: {} }
    ];
  },
  volumesnapshotlocations: function () {
    return [
      { metadata: { name: 'default' }, spec: { default: true } },
      { metadata: { name: 'volumesnapshotlocations' }, spec: {} }
    ];
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
