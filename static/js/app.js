$(document).ready(function() {

    /*** Status ****/

    $.ajax({
        url: "/status",
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
            $('.service-status').attr('class', function(i, c){
                return c.replace(/(^|\s)bg-\S+/g, '');
            }).addClass(response.isReady ? 'bg-primary' : 'bg-danger');
            $('.storage-status').text(response.StorageStatus);    
            $('.storage-status').attr('class', function(i, c){
                return c.replace(/(^|\s)bg-\S+/g, '');
            }).addClass(response.StorageStatus === 'Available' ? 'bg-primary' : 'bg-danger');
            $('.storage-last-sync').text(response.lastSync ? moment(new Date(response.lastSync)).from(new Date()) : ''); 
        },
        error: function(error) {
            $.toast({
                heading: 'Error',
                text: 'Unable to get velero status, please contact the administrator.',
                showHideTransition: 'plain',
                icon: 'warning'
            });
            console.log("Status : ", error);
        }
    });

    /*** Backup list ****/
    $('#list-backups').on('init.dt', function(){
        let reloadButton = $('<button type="button" class="btn btn-secondary btn-sm mx-3"><span class="bi bi-arrow-clockwise"></span>&nbsp;Reload</button>');
        $('div.backup-bloc div.dataTables_filter').append(reloadButton);
        reloadButton.bind('click', function(){ __loadBackups(); });
    });

    var backupTable = $('#list-backups').DataTable({
        paging: true,
        ordering: true,
        info: true,
        pagingType: 'simple_numbers',
        lengthMenu: [10, 50, 100, 200],
        data : [],
        order: [[5, 'desc']],
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
            { 
                "data" : "status",
                render: function(data, type, row){
                    if(row.errors > 0 || row.warnings > 0){
                        return '<button type="button" class="btn btn-link backup-result-action" data-name="'+row.name+'">'+data+'</button>'
                    }
                    return data;
                }
            
            },
            { "data" : "errors" },
            { "data" : "warnings" },
            { 
                data : "created", 
                render: function (data, type, row) {
                    var dt = new Date(data);
                    if(type == 'sort') return dt.getTime();
                    return dt.toLocaleDateString('en-EN', {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'});
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
                orderable: false,
                render: function (data, type, row) {
                    var btn = '<button type="button" class="btn btn-outline-warning btn-sm restore-action" data-name="'+data+'" '+( $('#list-backups').attr('data-readonly') === 'true' ? 'disabled' : '')+'>Restore</button>';
                    btn += '<button type="button" class="btn btn-outline-danger btn-sm delete-backup-action" data-name="'+data+'" '+( $('#list-backups').attr('data-readonly') === 'true' ? 'disabled' : '')+'>Delete</button>';
                    return btn;
                }
            }
        ]
    });
    
    $(document).on('click', 'button.backup-result-action', function(){
        let name = $(this).attr('data-name');
        $.ajax({
            url: "/backups/result/"+name,
            beforeSend: function() {
                $.blockUI({baseZ: 9999});
                $('#result-modal-label').html('Backup "'+name+'" result');
            },
            success: function(response) {
                $('#result-modal').modal('show'); 
                $('#result-modal .modal-body').html(response);
            },
            error: function(error) {
                console.log("Get backup result : ", error);
                $.toast({
                    heading: 'Error',
                    text: 'Unable to get the backup result, please contact the administrator.',
                    showHideTransition: 'plain',
                    icon: 'warning'
                });
            },
            complete: function(){
                $.unblockUI();
            }
        });
    });

    $(document).on('click', 'button.restore-action', function(){
        let name = $(this).attr('data-name');
        $.confirm({
            title: 'Confirm!',
            icon: 'bi bi-exclamation-circle',
            type: 'red',
            typeAnimated: true,
            closeIcon: true,
            closeIconClass: 'bi bi-x-square',
            content: "Are you sure you want to restore '"+name+"' ?",
            buttons: {
                confirm: {
                    btnClass: 'btn-blue',
                    action: function () {
                        $.ajax({
                            url: "/restores",
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
                                $('html, body').scrollTop($('.restore-bloc').offset().top);
                            },
                            error: function(error) {
                                $.toast({
                                    heading: 'Error',
                                    text: 'Unable to create a restore job, please contact the administrator.',
                                    showHideTransition: 'plain',
                                    icon: 'warning'
                                });
                                console.log("Create restore : ", error);
                            },
                            complete: function(){
                                $('.backup-bloc').unblock();
                            }
                        });
                    }
                },
                cancel: function () {
                    
                }
            }
        });
    });

    $(document).on('click', 'button.delete-backup-action', function(){
        let name = $(this).attr('data-name');
        $.confirm({
            title: 'Confirm!',
            icon: 'bi bi-exclamation-circle',
            type: 'red',
            typeAnimated: true,
            closeIcon: true,
            closeIconClass: 'bi bi-x-square',
            content: "Are you sure you want to delete the backup '"+name+"' ?",
            buttons: {
                confirm: {
                    btnClass: 'btn-blue',
                    action: function () {
                        $.ajax({
                            url: "/backups",
                            type: "DELETE",
                            dataType: 'json',
                            contentType: "application/json; charset=utf-8",
                            data: JSON.stringify({backup: name, name: name+'-delete-'+Math.floor(Date.now() / 1000)}),
                            beforeSend: function() {  
                                $('.backup-bloc').block();  
                            },
                            success: function(response) {
                                $.toast({
                                    heading: 'Information',
                                    text: 'New delete backup request is created',
                                    icon: 'info',
                                    loader: true,        
                                    loaderBg: '#9EC600'         
                                });
                                __loadBackups();
                                $('html, body').scrollTop($('.backup-bloc').offset().top);
                            },
                            error: function(error) {
                                $.toast({
                                    heading: 'Error',
                                    text: 'Unable to create a delete backup request, please contact the administrator.',
                                    showHideTransition: 'plain',
                                    icon: 'warning'
                                });
                                console.log("Create delete request error : ", error);
                            },
                            complete: function(){
                                $('.backup-bloc').unblock();
                            }
                        });
                    }
                },
                cancel: function () {
                    
                }
            }
        });
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
            url: "/backups",
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
                        status: response[i].status ? response[i].status.phase: 'Unknown',
                        errors: response[i].status ? response[i].status.errors | 0: 'Unknown',
                        warnings: response[i].status ? response[i].status.warnings | 0: 'Unknown',
                        created: response[i].metadata.creationTimestamp,
                        expires: response[i].status ? response[i].status.expiration: '',
                        raw: response[i]
                    }]);
                    
                }  
                backupTableApi.order([5, 'desc']).draw();
                backupTableApi.page(0).draw('page');     
            },
            complete: function(){
                $('.backup-bloc').unblock();
            },
            error: function(error) {
                $.toast({
                    heading: 'Error',
                    text: 'Unable to load backup jobs, please contact the administrator.',
                    showHideTransition: 'plain',
                    icon: 'warning'
                });
                console.log("Backups : ", error);
            }
        });
    }

    /*** Restore list ****/
    $('#list-restores').on('init.dt', function(){
        let reloadButton = $('<button type="button" class="btn btn-secondary btn-sm mx-3"><span class="bi bi-arrow-clockwise"></span>&nbsp;Reload</button>');
        $('div.restore-bloc div.dataTables_filter').append(reloadButton);
        reloadButton.bind('click', function(){ __loadRestores(); });
    });

    var restoreTable = $('#list-restores').DataTable({
        paging: true,
        ordering: true,
        info: true,
        pagingType: 'simple_numbers',
        lengthMenu: [10, 50, 100, 200],
        data : [],
        order: [[2, 'desc']],
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
            { 
                data : "created", 
                render: function (data, type, row) {
                    if(!data) return '';
                    var dt = new Date(data);
                    if(type == 'sort') return dt.getTime();
                    return dt.toLocaleDateString('en-EN', {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'});
                }
            },
            { 
                "data" : "status",
                render: function(data, type, row){
                    if(row.errors > 0 || row.warnings > 0){
                        return '<button type="button" class="btn btn-link restore-result-action" data-name="'+row.name+'">'+data+'</button>'
                    }
                    return data;
                }
            
            },
            { "data" : "errors" },
            { "data" : "warnings" },
            { 
                data : "start", 
                render: function (data, type, row) {
                    if(!data) return '';
                    var dt = new Date(data);
                    if(type == 'sort') return dt.getTime();
                    return dt.toLocaleDateString('en-EN', {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'});
                }
            },
            { 
                data : "end",
                render: function (data, type, row) {
                    if(!data) return '';
                    var dt = new Date(data);
                    if(type == 'sort') return dt.getTime();
                    return dt.toLocaleDateString('en-EN', {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'});
                } 
            }
        ]
    });
    
    $(document).on('click', 'button.restore-result-action', function(){
        let name = $(this).attr('data-name');
        $.ajax({
            url: "/restores/result/"+name,
            beforeSend: function() {
                $.blockUI({baseZ: 9999});
                $('#result-modal-label').html('Restore "'+name+'" result');
            },
            success: function(response) {
                $('#result-modal').modal('show'); 
                $('#result-modal .modal-body').html(response);
            },
            error: function(error) {
                console.log("Get restore result : ", error);
                $.toast({
                    heading: 'Error',
                    text: 'Unable to get the restore result, please contact the administrator.',
                    showHideTransition: 'plain',
                    icon: 'warning'
                });
            },
            complete: function(){
                $.unblockUI();
            }
        });
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
            url: "/restores",
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
                        warnings: response[i].status ? response[i].status.warnings | 0: 'Unknown',
                        created: response[i].metadata.creationTimestamp,
                        start: response[i].status ? response[i].status.startTimestamp : '',
                        end: response[i].status ? response[i].status.completionTimestamp : '',
                        raw: response[i]
                    }]);
                    
                }  
                restoreTableApi.order([2, 'desc']).draw();
                restoreTableApi.page(0).draw('page');     
            },
            complete: function(){
                $('.restore-bloc').unblock();
            },
            error: function(error) {
                $.toast({
                    heading: 'Error',
                    text: 'Unable to load restore jobs, please contact the administrator.',
                    showHideTransition: 'plain',
                    icon: 'warning'
                });
                console.log("Restores : ", error);
            }
        });
    }
    /*** Schedule list ****/
    $('#list-schedules').on('init.dt', function(){
        let reloadButton = $('<button type="button" class="btn btn-secondary btn-sm mx-3"><span class="bi bi-arrow-clockwise"></span>&nbsp;Reload</button>');
        $('div.schedule-bloc div.dataTables_filter').append(reloadButton);
        reloadButton.bind('click', function(){ __loadSchedules(); });
    });

    var scheduleTable = $('#list-schedules').DataTable({
        paging: true,
        ordering: true,
        info: true,
        pagingType: 'simple_numbers',
        lengthMenu: [10, 50, 100, 200],
        data : [],
        order: [[5, 'desc']],
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
                    if(type == 'sort') return dt.getTime();
                    return dt.toLocaleDateString('en-EN', {year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'});
                }
            },
            {
                data: "name",
                width: '190px',
                render: function (data, type, row) {
                    var btn = '<button type="button" class="btn btn-outline-primary btn-sm backup-action" data-name="'+data+'" '+( $('#list-schedules').attr('data-readonly') === 'true' ? 'disabled' : '')+'>Execute now</button>';
                    btn += '<button type="button" class="btn btn-outline-danger btn-sm delete-schedule-action" data-name="'+data+'" '+( $('#list-schedules').attr('data-readonly') === 'true' ? 'disabled' : '')+'>Delete</button>';
                    btn += '<button type="button" class="btn btn-outline-info btn-sm toggle-schedule-action" data-name="'+data+'" '+( $('#list-schedules').attr('data-readonly') === 'true' ? 'disabled' : '')+'>'+ (row.status === 'Paused' ? 'Unpause' : 'Pause')+'</button>';
                    return btn;
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

    $(document).on('click', 'button.toggle-schedule-action', function(){
        let name = $(this).attr('data-name');
        $.ajax({
            url: "/schedules/toggle",
            type: "POST",
            dataType: 'json',
            contentType: "application/json; charset=utf-8",
            data: JSON.stringify({schedule: name}),
            beforeSend: function() {  
                $('.schedule-bloc').block();  
            },
            success: function(response) {
                $.toast({
                    heading: 'Information',
                    text: 'Schedule "'+name+'" is '+(!response.state ? 'unpaused' : 'paused'),
                    icon: 'info',
                    loader: true,        
                    loaderBg: '#9EC600'         
                });
                __loadSchedules();
                $('html, body').scrollTop($('.schedule-bloc').offset().top);
            },
            error: function(error) {
                $.toast({
                    heading: 'Error',
                    text: 'Unable to pause/unpause a schedule, please contact the administrator.',
                    showHideTransition: 'plain',
                    icon: 'warning'
                });
                console.log("Toggle schedule error : ", error);
            },
            complete: function(){
                $('.schedule-bloc').unblock();
            }
        });
    });

    $(document).on('click', 'button.backup-action', function(){
        let name = $(this).attr('data-name');
        $.confirm({
            title: 'Confirm!',
            icon: 'bi bi-exclamation-circle',
            type: 'red',
            typeAnimated: true,
            closeIcon: true,
            closeIconClass: 'bi bi-x-square',
            content: "Are you sure you want to create a backup base on '"+name+"' schedule ?",
            buttons: {
                confirm: {
                    btnClass: 'btn-blue',
                    action: function () {
                        $.ajax({
                            url: "/schedules/execute",
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
                                $('html, body').scrollTop($('.backup-bloc').offset().top);
                            },
                            error: function(error) {
                                $.toast({
                                    heading: 'Error',
                                    text: 'Unable to create a backup job, please contact the administrator.',
                                    showHideTransition: 'plain',
                                    icon: 'warning'
                                });
                                console.log("Create backup : ", error);
                            },
                            complete: function(){
                                $('.schedule-bloc').unblock();
                            }
                        });
                    }
                },
                cancel: function () {
                    
                }
            }
        });
    });

    $(document).on('click', 'button.delete-schedule-action', function(){
        let name = $(this).attr('data-name');
        $.confirm({
            title: 'Confirm!',
            icon: 'bi bi-exclamation-circle',
            type: 'red',
            typeAnimated: true,
            closeIcon: true,
            closeIconClass: 'bi bi-x-square',
            content: "Are you sure you want to delete '"+name+"' schedule ?",
            buttons: {
                confirm: {
                    btnClass: 'btn-blue',
                    action: function () {
                        $.ajax({
                            url: "/schedules",
                            type: "DELETE",
                            dataType: 'json',
                            contentType: "application/json; charset=utf-8",
                            data: JSON.stringify({schedule: name}),
                            beforeSend: function() {  
                                $('.schedule-bloc').block();  
                            },
                            success: function(response) {
                                $.toast({
                                    heading: 'Information',
                                    text: 'Schedule "'+name+'" is deleted',
                                    icon: 'info',
                                    loader: true,        
                                    loaderBg: '#9EC600'         
                                });
                                __loadSchedules();
                                $('html, body').scrollTop($('.schedule-bloc').offset().top);
                            },
                            error: function(error) {
                                $.toast({
                                    heading: 'Error',
                                    text: 'Unable to delete a schedule, please contact the administrator.',
                                    showHideTransition: 'plain',
                                    icon: 'warning'
                                });
                                console.log("Delete schedule error : ", error);
                            },
                            complete: function(){
                                $('.schedule-bloc').unblock();
                            }
                        });
                    }
                },
                cancel: function () {
                    
                }
            }
        });
    });
    
    __loadSchedules = function(){
        var scheduleTableApi = $('#list-schedules').dataTable().api();

        $.ajax({
            url: "/schedules",
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
                        status: response[i].spec.paused && response[i].spec.paused ? 'Paused' : 'Enabled',
                        ttl: response[i].spec.template.ttl,
                        schedule: response[i].spec.schedule,
                        last: response[i].status ? response[i].status.lastBackup: '',
                        raw: response[i]
                    }]);
                    
                }  
                scheduleTableApi.draw();      
            },
            complete: function(){
                $('.schedule-bloc').unblock();
            },
            error: function(error) {
                $.toast({
                    heading: 'Error',
                    text: 'Unable to load schedules, please contact the administrator.',
                    showHideTransition: 'plain',
                    icon: 'warning'
                });
                console.log("Schedules : ", error);
            }
        });
    }

    $(document).bind('refresh-and-go-to-backup', function(){
        __loadBackups();
        $('html, body').scrollTop($('.backup-bloc').offset().top);
    });

    $(document).bind('refresh-and-go-to-schedule', function(){
        __loadSchedules();
        $('html, body').scrollTop($('.schedule-bloc').offset().top);
    });
    
    __loadBackups();
    __loadRestores();
    __loadSchedules();

})