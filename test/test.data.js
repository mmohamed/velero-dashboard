
const data = {
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
    }
}

module.exports = data;