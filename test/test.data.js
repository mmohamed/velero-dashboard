
const data = {
    backups: function(){
        return [
            {spec: {includedNamespaces: ['ns1', 'ns2']}, metadata: {name: 'backup-first'}},
            {spec: {includedNamespaces: ['ns1', 'ns3']}, metadata: {name: 'backup-second'}}
        ]
    }
}

module.exports = data;