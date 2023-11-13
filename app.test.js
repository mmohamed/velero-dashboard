
jest.mock('express');
const express = require('express');
const ports = [];

express.mockReturnValue({
    use: function(){},
    listen: function(port){ports.push(port)},
    get: function(){},
    post: function(){},
    delete: function(){}
});

process.env.METRICS = true;
const server = require('./app.js');

describe('Check lanching servers', () => {
    it('should app/metrics server in running mode', async () => {
        expect(ports.length).toEqual(2);
        expect(ports).toEqual([3000,3001]);
    });
});
