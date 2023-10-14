$(document).ready(function() {

    /*** Status ****/

    $.ajax({
        url: "/api/status",
        type: "GET",
        dataType: 'json',
        contentType: "application/json; charset=utf-8",
        beforeSend: function() {
            $('.bloc-status').empty();   
            $('.status-loader').addClass('spinner-grow');          
        },
        success: function(response) {
            $('.status-loader').removeClass('spinner-grow');      
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
                    return dt.toLocaleDateString('en-EN', {year: 'numeric', month: 'long', day: 'numeric'});
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
                    return '<button type="button" class="btn btn-outline-danger btn-sm restore-action" data-name="'+data+'">Restore</button>';
                }
            }
        ]
    });
    
    $(document).on('click', 'button.restore-action', function(){
        let name = $(this).attr('data-name');
        let response = confirm("Are you sure you want to restore '"+name+"' ?");
        if(response){

            $.ajax({
                url: "/api/restores",
                type: "POST",
                dataType: 'json',
                contentType: "application/json; charset=utf-8",
                data: JSON.stringify({backup: name, name: name+'-restore-'+Math.floor(Date.now() / 1000)}),
                beforeSend: function() {  
                    $('.backup-bloc').block();  
                },
                success: function(response) {
                    $.toast({
                        heading: 'Information',
                        text: 'New restore job "'+response.restore.metadata.name+'" is created',
                        icon: 'info',
                        loader: true,        
                        loaderBg: '#9EC600'         
                    });
                    __loadRestores();
                },
                error: function(error) {
                    console.log("Create restore : ", error);
                },
                complete: function(){
                    $('.backup-bloc').unblock();
                }
            });
        }
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

    __loadBackups = function(){
        var backupTableApi = $('#list-backups').dataTable().api();

        $.ajax({
            url: "/api/backups",
            type: "GET",
            dataType: 'json',
            contentType: "application/json; charset=utf-8",
            beforeSend: function() {
                $('.backup-bloc').block();
                backupTableApi.clear();   
                $('.counter-backups').addClass('spinner-grow').empty();  
            },
            success: function(response) {
                $('.counter-backups').removeClass('spinner-grow').text(response.length);
                for(var i in response){
                    backupTableApi.rows.add([{
                        name: response[i].metadata.name,
                        status: response[i].status.phase,
                        errors: response[i].status.errors | 0,
                        warnings: response[i].status.warning | 0,
                        created: response[i].metadata.creationTimestamp,
                        expires: response[i].status.expiration,
                        raw: response[i]
                    }]);
                    
                }  
                backupTableApi.draw();      
            },
            complete: function(){
                $('.backup-bloc').unblock();
            },
            error: function(error) {
                console.log("Backups : ", error);
            }
        });
    }

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
                    return dt.toLocaleDateString('en-EN', {year: 'numeric', month: 'long', day: 'numeric'});
                }
            },
            { 
                data : "end",
                render: function (data, type, row) {
                    if(!data) return '';
                    var dt = new Date(data);
                    return dt.toLocaleDateString('en-EN', {year: 'numeric', month: 'long', day: 'numeric'});
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

    __loadRestores = function(){
        var restoreTableApi = $('#list-restores').dataTable().api();

        $.ajax({
            url: "/api/restores",
            type: "GET",
            dataType: 'json',
            contentType: "application/json; charset=utf-8",
            beforeSend: function() {
                $('.restore-bloc').block();
                restoreTableApi.clear();   
                $('.counter-restores').addClass('spinner-grow').empty();  
            },
            success: function(response) {
                $('.counter-restores').removeClass('spinner-grow').text(response.length);
                for(var i in response){
                    restoreTableApi.rows.add([{
                        name: response[i].metadata.name,
                        status: response[i].status ? response[i].status.phase: 'Unknown',
                        errors: response[i].status ? response[i].status.errors | 0: 'Unknown',
                        warnings: response[i].status ? response[i].status.warning | 0: 'Unknown',
                        start: response[i].status ? response[i].status.startTimestamp : '',
                        end: response[i].status ? response[i].status.completionTimestamp : '',
                        raw: response[i]
                    }]);
                    
                }  
                restoreTableApi.draw();      
            },
            complete: function(){
                $('.restore-bloc').unblock();
            },
            error: function(error) {
                console.log("Restores : ", error);
            }
        });
    }
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
                    return dt.toLocaleDateString('en-EN', {year: 'numeric', month: 'long', day: 'numeric'});
                }
            },
            {
                data: "name",
                render: function (data, type, row) {
                    return '<button type="button" class="btn btn-outline-primary btn-sm backup-action" data-name="'+data+'">Execute now</button>';
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

    $(document).on('click', 'button.backup-action', function(){
        let name = $(this).attr('data-name');
        let response = confirm("Are you sure you want to create a backup base on '"+name+"' schedule ?");
        if(response){

            $.ajax({
                url: "/api/backups",
                type: "POST",
                dataType: 'json',
                contentType: "application/json; charset=utf-8",
                data: JSON.stringify({schedule: name, name: name+'-backup-'+Math.floor(Date.now() / 1000)}),
                beforeSend: function() {  
                    $('.schedule-bloc').block();  
                },
                success: function(response) {
                    $.toast({
                        heading: 'Information',
                        text: 'New backup job "'+response.backup.metadata.name+'" is created',
                        icon: 'info',
                        loader: true,        
                        loaderBg: '#9EC600'         
                    });
                    __loadBackups();
                },
                error: function(error) {
                    console.log("Create backup : ", error);
                },
                complete: function(){
                    $('.schedule-bloc').unblock();
                }
            });
        }
    });

    __loadSchedules = function(){
        var scheduleTableApi = $('#list-schedules').dataTable().api();

        $.ajax({
            url: "/api/schedules",
            type: "GET",
            dataType: 'json',
            contentType: "application/json; charset=utf-8",
            beforeSend: function() {
                $('.schedule-bloc').block();
                scheduleTableApi.clear();   
                $('.counter-schedules').addClass('spinner-grow').empty();  
            },
            success: function(response) {
                $('.counter-schedules').removeClass('spinner-grow').text(response.length);
                for(var i in response){
                    scheduleTableApi.rows.add([{
                        name: response[i].metadata.name,
                        status: response[i].status.phase,
                        ttl: response[i].spec.template.ttl,
                        schedule: response[i].spec.schedule,
                        last: response[i].status.lastBackup,
                        raw: response[i]
                    }]);
                    
                }  
                scheduleTableApi.draw();      
            },
            complete: function(){
                $('.schedule-bloc').unblock();
            },
            error: function(error) {
                console.log("Schedules : ", error);
            }
        });
    }

    __loadBackups();
    __loadRestores();
    __loadSchedules();

})