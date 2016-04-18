var ThenFail = require('../../bld/');

ThenFail.options.disableUnrelayedRejectionWarning = true;

var Promise = ThenFail.Promise;

module.exports = {
    deferred: function () {
        var promise = new Promise(function () { });
        return {
            promise: promise,
            resolve: function (value) {
                promise._resolve(value);
            },
            reject: function (reason) {
                promise._reject(reason);
            }
        };
    }
};
