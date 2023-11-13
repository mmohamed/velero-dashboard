
jest.mock('express');
const express = require('express');
const ports = [];

console.log = function(){}

express.mockReturnValue({
    use: function(){},
    listen: function(port, fn){ports.push(port), fn.call()},
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
