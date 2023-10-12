$(document).ready(function() {

    /*** Status ****/

    $.ajax({
        url: "/api/status",
        type: "GET",
        dataType: 'json',
        contentType: "application/json; charset=utf-8",
        beforeSend: function() {
            $('.bloc-status').addClass('spinner-grow').empty();          
        },
        success: function(response) {
            $('.bloc-status').removeClass('spinner-grow');      
            $('.service-status').text(response.isReady ? 'Ready' : 'Not Ready');    
            $('.storage-status').text(response.StorageStatus);    
            $('.storage-last-sync').text(moment(new Date(response.lastSync)).from(new Date()));     
        },
        error: function(error) {
            console.log("Status : ", error);
        }
    });

    /*** Backup list ****/

    var backupTable = $('#list-backups').DataTable({
        paging: true,
        ordering: true,
        info: true,
        pagingType: 'simple_numbers',
        lengthMenu: [10, 50, 100, 200],
        data : [],
        columnDefs: [
            {
                className: 'dt-control',
                orderable: false,
                data: null,
                defaultContent: '',
                targets: 0
            }
        ],
        columns : [
            { "data" : null },
            { "data" : "name" },
            { "data" : "status" },
            { "data" : "errors" },
            { "data" : "warnings" },
            { 
                data : "created", 
                render: function (data, type, row) {
                    var dt = new Date(data);
                    return dt.toLocaleDateString('en-EN', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
                }
            },
            { 
                "data" : "expires",
                render: function (data, type, row) {
                    return moment(new Date(data)).from(new Date());
                } 
            },
            {
                data: "name",
                render: function (data, type, row) {
                    return '<button type="button" class="btn btn-danger btn-sm">Restore</button>';
                }
            }
        ]
    });
    
    backupTable.on('click', 'td.dt-control', function (e) {
        let tr = e.target.closest('tr');
        let row = backupTable.row(tr);
        if (row.child.isShown()) {
            row.child.hide();
        }
        else {
            var desc = JSON.stringify({spec: row.data().raw.spec, status: row.data().raw.status}, undefined, 2);
            row.child('<pre>'+desc+'</pre>').show();
        }
    });


    var backupTableApi = $('#list-backups').dataTable().api();

    $.ajax({
        url: "/api/backups",
        type: "GET",
        dataType: 'json',
        contentType: "application/json; charset=utf-8",
        beforeSend: function() {
            backupTableApi.clear();   
            $('.counter-backups').addClass('spinner-grow').empty();  
        },
        success: function(response) {
            $('.counter-backups').removeClass('spinner-grow').text(response.items.length);
            for(var i in response.items){
                backupTableApi.rows.add([{
                    name: response.items[i].metadata.name,
                    status: response.items[i].status.phase,
                    errors: response.items[i].status.errors | 0,
                    warnings: response.items[i].status.warning | 0,
                    created: response.items[i].metadata.creationTimestamp,
                    expires: response.items[i].status.expiration,
                    raw: response.items[i]
                }]);
                
            }  
            backupTableApi.draw();      
        },
        error: function(error) {
            console.log("Status : ", error);
        }
    });



    /*** Restore list ****/

    var restoreTable = $('#list-restores').DataTable({
        paging: true,
        ordering: true,
        info: true,
        pagingType: 'simple_numbers',
        lengthMenu: [10, 50, 100, 200],
        data : [],
        columnDefs: [
            {
                className: 'dt-control',
                orderable: false,
                data: null,
                defaultContent: '',
                targets: 0
            }
        ],
        columns : [
            { "data" : null },
            { "data" : "name" },
            { "data" : "status" },
            { "data" : "errors" },
            { "data" : "warnings" },
            { 
                data : "start", 
                render: function (data, type, row) {
                    if(!data) return '';
                    var dt = new Date(data);
                    return dt.toLocaleDateString('en-EN', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
                }
            },
            { 
                data : "end",
                render: function (data, type, row) {
                    if(!data) return '';
                    var dt = new Date(data);
                    return dt.toLocaleDateString('en-EN', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
                } 
            }
        ]
    });
    
    restoreTable.on('click', 'td.dt-control', function (e) {
        let tr = e.target.closest('tr');
        let row = restoreTable.row(tr);
        if (row.child.isShown()) {
            row.child.hide();
        }
        else {
            var desc = JSON.stringify({spec: row.data().raw.spec, status: row.data().raw.status}, undefined, 2);
            row.child('<pre>'+desc+'</pre>').show();
        }
    });


    var restoreTableApi = $('#list-restores').dataTable().api();

    $.ajax({
        url: "/api/restores",
        type: "GET",
        dataType: 'json',
        contentType: "application/json; charset=utf-8",
        beforeSend: function() {
            restoreTableApi.clear();   
            $('.counter-restores').addClass('spinner-grow').empty();  
        },
        success: function(response) {
            $('.counter-restores').removeClass('spinner-grow').text(response.items.length);
            for(var i in response.items){
                restoreTableApi.rows.add([{
                    name: response.items[i].metadata.name,
                    status: response.items[i].status.phase,
                    errors: response.items[i].status.errors | 0,
                    warnings: response.items[i].status.warning | 0,
                    start: response.items[i].metadata.startTimestamp,
                    end: response.items[i].status.completionTimestamp,
                    raw: response.items[i]
                }]);
                
            }  
            restoreTableApi.draw();      
        },
        error: function(error) {
            console.log("Status : ", error);
        }
    });

    /*** Schedule list ****/

    var scheduleTable = $('#list-schedules').DataTable({
        paging: true,
        ordering: true,
        info: true,
        pagingType: 'simple_numbers',
        lengthMenu: [10, 50, 100, 200],
        data : [],
        columnDefs: [
            {
                className: 'dt-control',
                orderable: false,
                data: null,
                defaultContent: '',
                targets: 0
            }
        ],
        columns : [
            { "data" : null },
            { "data" : "name" },
            { "data" : "status" },
            { "data" : "ttl" },
            { "data" : "schedule" },
            { 
                data : "last", 
                render: function (data, type, row) {
                    if(!data) return '';
                    var dt = new Date(data);
                    return dt.toLocaleDateString('en-EN', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
                }
            }
        ]
    });
    
    scheduleTable.on('click', 'td.dt-control', function (e) {
        let tr = e.target.closest('tr');
        let row = scheduleTable.row(tr);
        if (row.child.isShown()) {
            row.child.hide();
        }
        else {
            var desc = JSON.stringify({spec: row.data().raw.spec, status: row.data().raw.status}, undefined, 2);
            row.child('<pre>'+desc+'</pre>').show();
        }
    });


    var scheduleTableApi = $('#list-schedules').dataTable().api();

    $.ajax({
        url: "/api/schedules",
        type: "GET",
        dataType: 'json',
        contentType: "application/json; charset=utf-8",
        beforeSend: function() {
            scheduleTableApi.clear();   
            $('.counter-schedules').addClass('spinner-grow').empty();  
        },
        success: function(response) {
            $('.counter-schedules').removeClass('spinner-grow').text(response.items.length);
            for(var i in response.items){
                scheduleTableApi.rows.add([{
                    name: response.items[i].metadata.name,
                    status: response.items[i].status.phase,
                    ttl: response.items[i].spec.template.ttl,
                    schedule: response.items[i].spec.schedule,
                    last: response.items[i].status.lastBackup,
                    raw: response.items[i]
                }]);
                
            }  
            scheduleTableApi.draw();      
        },
        error: function(error) {
            console.log("Status : ", error);
        }
    });

})