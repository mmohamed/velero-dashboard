const express = require('express');
const swaggerUI = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const KubeService = require('./services/kube');
const APIController = require('./controllers/api');

const api = express();

api.use(express.json());

const kubeService = new KubeService();
const apiController = new APIController(kubeService);

api.disable('x-powered-by');
api.use((req, res, next) => apiController.auth(req, res, next));
api.use('/v1/docs', swaggerUI.serve, swaggerUI.setup(swaggerSpec));

/**
 * @swagger
 * components:
 *   schemas: 
 *     BackupWithStatus:
 *       allOf:
 *         - $ref: '#/components/schemas/BackupStatus'  
 *         - $ref: '#/components/schemas/Backup'  
 * 
 *     ScheduleWithStatus:
 *       allOf:
 *         - $ref: '#/components/schemas/ScheduleStatus' 
 *         - $ref: '#/components/schemas/Schedule' 
 * 
 *     RestoreWithStatus:
 *       allOf:
 *         - $ref: '#/components/schemas/RestoreStatus' 
 *         - $ref: '#/components/schemas/Restore' 
 *  
 */    

/**
 * @openapi
 * '/v1/backups':
 *  get:
 *     tags:
 *       - Backup Controller
 *     summary: List backups
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                data: 
 *                  type: array
 *                  items:
 *                    $ref: '#/components/schemas/BackupWithStatus'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.get('/v1/backups', (req, res, next) => apiController.listBackup(req, res, next));

/**
 * @openapi
 * '/v1/backups/{name}':
 *  get:
 *     tags:
 *       - Backup Controller
 *     summary: Get backup by name
 *     parameters:
 *       - name: name
 *         in: path
 *         description: The name of the backup
 *         required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                data: 
 *                  type: object
 *                  $ref: '#/components/schemas/BackupWithStatus'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.get('/v1/backups/:name', (req, res, next) => apiController.getBackup(req, res, next));

/**
 * @openapi
 * '/v1/backups':
 *  post:
 *     tags:
 *     - Backup Controller
 *     summary: Create new backup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Backup'
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                errors:
 *                  type: array
 *                  description: list of fields with errors
 *                backup: 
 *                  description: the new backup
 *                  type: object
 *                  $ref: '#/components/schemas/Backup'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.post('/v1/backups', (req, res, next) => apiController.createBackup(req, res, next));

/**
 * @openapi
 * '/v1/backups/{name}':
 *  delete:
 *     tags:
 *     - Backup Controller
 *     summary: Delete backup
 *     parameters:
 *      - name: name
 *        in: path
 *        description: The name of the backup
 *        required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                backup:
 *                  type: string
 *                  description: the target backup
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.delete('/v1/backups/:name', (req, res, next) => apiController.deleteBackup(req, res, next));

/**
 * @openapi
 * '/v1/backups/{name}/log':
 *  get:
 *     tags:
 *       - Backup Controller
 *     summary: Get backup log by name
 *     parameters:
 *       - name: name
 *         in: path
 *         description: The name of the backup
 *         required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                data: 
 *                  type: object
 *                  propereties:
 *                      result:
 *                        type: object
 *                      logs:
 *                        type: string
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.get('/v1/backups/:name/log', (req, res, next) => apiController.getBackupLog(req, res, next));

/**
 * @openapi
 * '/v1/backups/{name}/restore':
 *  put:
 *     tags:
 *     - Backup Controller
 *     summary: Create a restore from backup
 *     parameters:
 *      - name: name
 *        in: path
 *        description: The name of the backup
 *        required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                restore: 
 *                  description: the new restore
 *                  type: object
 *                  $ref: '#/components/schemas/Restore'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.put('/v1/backups/:name/restore', (req, res, next) => apiController.createRestoreFromBackup(req, res, next));

/**
 * @openapi
 * '/v1/restores':
 *  get:
 *     tags:
 *       - Restore Controller
 *     summary: List restores
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                data: 
 *                  type: array
 *                  items:
 *                    $ref: '#/components/schemas/RestoreWithStatus'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.get('/v1/restores', (req, res, next) => apiController.listRestore(req, res, next));

/**
 * @openapi
 * '/v1/restores/{name}':
 *  get:
 *     tags:
 *       - Restore Controller
 *     summary: Get restore by name
 *     parameters:
 *       - name: name
 *         in: path
 *         description: The name of the restore
 *         required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                data: 
 *                  type: object
 *                  $ref: '#/components/schemas/RestoreWithStatus'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.get('/v1/restores/:name', (req, res, next) => apiController.getRestore(req, res, next));

/**
 * @openapi
 * '/v1/restores/{name}/log':
 *  get:
 *     tags:
 *       - Restore Controller
 *     summary: Get restore log by name
 *     parameters:
 *       - name: name
 *         in: path
 *         description: The name of the restore
 *         required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                data: 
 *                  type: object
 *                  propereties:
 *                      result:
 *                        type: object
 *                      logs:
 *                        type: array
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.get('/v1/restores/:name/log', (req, res, next) => apiController.getRestoreLog(req, res, next));

/**
 * @openapi
 * '/v1/schedules':
 *  get:
 *     tags:
 *       - Schedule Controller
 *     summary: List schedules
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                data: 
 *                  type: array
 *                  items:
 *                    $ref: '#/components/schemas/ScheduleWithStatus'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.get('/v1/schedules', (req, res, next) => apiController.listSchedule(req, res, next));

/**
 * @openapi
 * '/v1/schedules/{name}':
 *  get:
 *     tags:
 *       - Schedule Controller
 *     summary: Get schedule by name
 *     parameters:
 *       - name: name
 *         in: path
 *         description: The name of the schedule
 *         required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                data: 
 *                  type: object
 *                  $ref: '#/components/schemas/ScheduleWithStatus'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.get('/v1/schedules/:name', (req, res, next) => apiController.getSchedule(req, res, next));

/**
 * @openapi
 * '/v1/schedules':
 *  post:
 *     tags:
 *     - Schedule Controller
 *     summary: Create new schedule
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Schedule'
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                errors:
 *                  type: array
 *                  description: list of fields with errors
 *                schedule: 
 *                  description: the new schedule
 *                  type: object
 *                  $ref: '#/components/schemas/Schedule'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.post('/v1/schedules', (req, res, next) => apiController.createSchedule(req, res, next));

/**
 * @openapi
 * '/v1/schedules/{name}':
 *  delete:
 *     tags:
 *     - Schedule Controller
 *     summary: Delete schedule
 *     parameters:
 *      - name: name
 *        in: path
 *        description: The name of the schedule
 *        required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.delete('/v1/schedules/:name', (req, res, next) => apiController.deleteSchedule(req, res, next));

/**
 * @openapi
 * '/v1/schedules/{name}/execute':
 *  put:
 *     tags:
 *     - Schedule Controller
 *     summary: Execute schedule now and create a new backup
 *     parameters:
 *      - name: name
 *        in: path
 *        description: The name of the schedule
 *        required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                backup: 
 *                  description: the new backup
 *                  type: object
 *                  $ref: '#/components/schemas/Backup'
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.put('/v1/schedules/:name/execute', (req, res, next) => apiController.executeSchedule(req, res, next));

/**
 * @openapi
 * '/v1/schedules/{name}/toggle':
 *  put:
 *     tags:
 *     - Schedule Controller
 *     summary: Toggle schedule state between pause and unpause
 *     parameters:
 *      - name: name
 *        in: path
 *        description: The name of the schedule
 *        required: true
 *     responses:
 *      200:
 *        description: Successfully
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                status: 
 *                  type: boolean
 *                  description: status of the operation
 *                paused: 
 *                  type: boolean
 *                  description: the new state of the schedule (pause, unpause)
 *      400:
 *        description: Bad Request
 *      404:
 *        description: Not Found
 *      500:
 *        description: Server Error
 */
api.put('/v1/schedules/:name/toggle', (req, res, next) => apiController.toggleSchedule(req, res, next));

module.exports = api;