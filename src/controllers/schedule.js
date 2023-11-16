const tools = require('./../tools');
const cron = require('cron-validator');

class ScheduleController {
  constructor(kubeService, twing, k8sApi, customObjectsApi) {
    this.kubeService = kubeService;
    this.twing = twing;
  }

  async createViewAction(request, response) {
    let user = request.session.user;
    let readOnly = tools.readOnlyMode() && !user.isAdmin;
    if (readOnly) return response.status(403).json({});

    const backupStorageLocations = await this.kubeService.listBackupStorageLocations();
    const volumeSnapshotLocations = await this.kubeService.listVolumeSnapshotLocations();

    // filter
    let availableNamespaces = tools.availableNamespaces(user, await this.kubeService.listNamespaces());

    if (request.method === 'POST') {
      let errors = [];
      let message;
      let found;
      let bodyRequest = request.body;
      if (!bodyRequest.name || bodyRequest.name.trim().length == 0) {
        errors.push('name');
      }
      if (!bodyRequest.cron || bodyRequest.cron.trim().length == 0) {
        errors.push('cron');
      } else if (!cron.isValidCron(bodyRequest.cron)) {
        errors.push('cron');
      }
      // includenamespace
      if (!bodyRequest.includenamespace || bodyRequest.includenamespace.length == 0) {
        errors.push('includenamespace');
      } else {
        for (let i in bodyRequest.includenamespace) {
          found = false;
          for (let j in availableNamespaces) {
            if (bodyRequest.includenamespace[i] === availableNamespaces[j].metadata.name) {
              found = true;
              break;
            }
          }
          if (!found) {
            errors.push('includenamespace');
            break;
          }
        }
      }
      // excludenamespace
      if (bodyRequest.excludenamespace) {
        for (let i in bodyRequest.excludenamespace) {
          found = false;
          for (let j in availableNamespaces) {
            if (bodyRequest.excludenamespace[i] === availableNamespaces[j].metadata.name) {
              found = true;
              break;
            }
          }
          if (!found) {
            errors.push('excludenamespace');
            break;
          }
        }
      }
      // retention
      if (!bodyRequest.retention || ['30', '60', '90'].indexOf(bodyRequest.retention) === -1) {
        errors.push('retention');
      }
      // backuplocation
      if (!bodyRequest.backuplocation || bodyRequest.backuplocation.trim().length == 0) {
        errors.push('backuplocation');
      }
      if (bodyRequest.backuplocation) {
        found = false;
        for (let i in backupStorageLocations) {
          if (bodyRequest.backuplocation === backupStorageLocations[i].metadata.name) {
            found = true;
            break;
          }
        }
        if (!found) {
          errors.push('backuplocation');
        }
      }
      // snapshotlocation
      if (bodyRequest.snapshot && bodyRequest.snapshot === '1') {
        if (!bodyRequest.snapshotlocation || bodyRequest.snapshotlocation.trim().length == 0) {
          errors.push('snapshotlocation');
        }
        if (bodyRequest.snapshotlocation) {
          found = false;
          for (let i in volumeSnapshotLocations) {
            if (bodyRequest.snapshotlocation === volumeSnapshotLocations[i].metadata.name) {
              found = true;
              break;
            }
          }
          if (!found) {
            errors.push('snapshotlocation');
          }
        }
      }

      if (!errors.length) {
        let createErrors = {};
        const newSchedule = await this.kubeService.createSchedule(bodyRequest, user, createErrors);
        if (newSchedule) {
          tools.audit(user.username, 'ScheduleController', 'CREATE', bodyRequest.name, 'Schedule');
        } else {
          errors.push('global');
          message = createErrors.message ? createErrors.message : 'Unable to create new schedule';
        }
      }

      return this.twing
        .render('schedule.form.html.twig', {
          schedule: bodyRequest,
          backupStorageLocations: backupStorageLocations,
          volumeSnapshotLocations: volumeSnapshotLocations,
          namespaces: availableNamespaces,
          errors: errors,
          message: message,
          user: user
        })
        .then((output) => {
          response.status(errors.length ? 200 : 201).end(output);
        });
    }

    return this.twing
      .render('schedule.form.html.twig', {
        backupStorageLocations: backupStorageLocations,
        volumeSnapshotLocations: volumeSnapshotLocations,
        namespaces: availableNamespaces,
        user: user,
        defaultVolumesToFsBackup: tools.useFSBackup()
      })
      .then((output) => {
        response.end(output);
      });
  }

  async listAction(request, response) {
    let schedules = await this.kubeService.listSchedules('velero.io', 'v1', tools.namespace(), 'schedules');
    // filter
    let availableSchedules = [];
    for (let i in schedules) {
      if (tools.hasAccess(request.session.user, schedules[i])) {
        availableSchedules.push(schedules[i]);
      }
    }
    // audit
    tools.audit(request.session.user.username, 'ScheduleController', 'LIST', '', 'Schedule');
    response.send(availableSchedules);
  }

  async deleteAction(request, response) {
    if (!request.body.schedule) {
      return response.status(404).json({});
    }
    // filtering
    let schedule = await this.kubeService.getSchedule(request.body.schedule);
    if (!schedule) {
      return response.status(404).json({});
    }
    // access
    if (!tools.hasAccess(request.session.user, schedule)) {
      return response.status(403).json({});
    }
    await this.kubeService.deleteSchedule(request.body.schedule);
    // audit
    tools.audit(request.session.user.username, 'ScheduleController', 'DELETE', request.body.schedule, 'Schedule');
    // response
    response.send({ status: true });
  }

  async toggleAction(request, response) {
    if (!request.body.schedule) {
      return response.status(404).json({});
    }
    // filtering
    let schedule = await this.kubeService.getSchedule(request.body.schedule);
    if (!schedule) {
      return response.status(404).json({});
    }
    // access
    if (!tools.hasAccess(request.session.user, schedule)) {
      return response.status(403).json({});
    }
    var returned = await this.kubeService.toggleSchedule(schedule);
    // audit
    tools.audit(
      request.session.user.username,
      'ScheduleController',
      'TOGGLE',
      request.body.schedule,
      'Schedule',
      'Schedule ' + (schedule.spec.paused ? 'unpaused' : 'paused')
    );
    // response
    response.send({ status: returned ? true : false, state: returned ? returned.spec.paused : '' });
  }

  async executeAction(request, response) {
    if (!request.body.schedule) {
      return response.status(404).json({});
    }
    let schedule = await this.kubeService.getSchedule(request.body.schedule);
    if (!schedule) {
      return response.status(404).json({});
    }
    // access
    if (!tools.hasAccess(request.session.user, schedule)) {
      return response.status(403).json({});
    }
    var returned = await this.kubeService.executeSchedule(schedule, request.body.name);
    // audit
    tools.audit(
      request.session.user.username,
      'ScheduleController',
      'EXECUTE',
      request.body.schedule,
      'Schedule',
      'Created backup : ' + request.body.name
    );
    // response
    response.send({ status: returned ? true : false, backup: returned });
  }
}

module.exports = ScheduleController;
