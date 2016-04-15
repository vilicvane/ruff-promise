require('source-map-support').install();

var Chai = require('chai');

Chai.should();
Chai.use(require('chai-as-promised'));

var options = require('../bld/').options;

options.logger = {
    log: function () { },
    warn: function () { },
    error: function () { }
};
