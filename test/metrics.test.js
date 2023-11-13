require('./k8s.mock').mock();
process.env.METRICS_PATH = 'internal-metrics';

const k8s = require('@kubernetes/client-node');
const supertest = require('supertest');
const server = require('./../src/main');
const requestWithSupertest = supertest(server.metrics);

describe('Disabled metrics', () => {
    beforeAll(() => {
        process.env.METRICS = false;
        process.env.METRICS_PORT = '3002';
    });
    it('should have error response', async () => {
        var res = (await requestWithSupertest.get('/internal-metrics'));
        expect(res.status).toEqual(404);
    });
});

describe('Enabled metrics', () => {
    beforeAll(() => {
        process.env.METRICS = true;
        process.env.METRICS_PORT = '3002';
        process.env.METRICS_PATH = 'internal-metrics';
    });
    it('should have good response', async () => {
        var res = (await requestWithSupertest.get('/internal-metrics'));
        expect(res.status).toEqual(200);
        expect(res.text.split(/\r\n|\r|\n/).length).toEqual(12);
    });
});