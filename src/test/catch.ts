import Promise from '../';

import { testFulfilled, testRejected } from './helpers/three-cases';

describe('Feature: catch', () => {
    context('promise.catch should not be triggerred when no error', () => {
        testFulfilled(undefined, (promise, done) => {
            let str = '';

            promise
                .then(() => {
                    str += 'a';
                })
                .catch(() => {
                    str += 'b';
                });

            setTimeout(() => {
                str.should.equal('a');
                done();
            }, 30);
        });
    });

    context('promise.catch should be triggerred when error', () => {
        testRejected(new Error(), (promise, done) => {
            let str = '';

            promise
                .then(() => {
                    str += 'a';
                })
                .catch(reason => {
                    str += 'b';
                });

            setTimeout(() => {
                str.should.equal('b');
                done();
            }, 30);
        });
    });

    context('promise.catch should catch matched error', () => {
        let typeError = new TypeError();

        testRejected(typeError, (promise, done) => {
            let str = '';

            promise
                .then(() => {
                    str += 'a';
                })
                .catch(TypeError, reason => {
                    if (reason !== typeError) {
                        done('Unexpected error type');
                    }

                    str += 'b';
                })
                .then(undefined, () => {
                    str += 'c';
                });

            setTimeout(() => {
                str.should.equal('b');
                done();
            }, 30);
        });
    });

    context('promise.catch should skip unmatched error', () => {
        testRejected(new Error(), (promise, done) => {
            let str = '';

            promise
                .then(() => {
                    str += 'a';
                })
                .catch(TypeError, () => {
                    str += 'b';
                })
                .then(undefined, () => {
                    str += 'c';
                });

            setTimeout(() => {
                str.should.equal('c');
                done();
            }, 30);
        });
    });

    context('Multiple promise.catch should work', () => {
        testRejected(new Error(), (promise, done) => {
            let str = '';

            promise
                .then(() => {
                    str += 'a';
                })
                .catch(TypeError, () => {
                    str += 'b';
                })
                .catch(Error, () => {
                    str += 'c';
                })
                .then(undefined, () => {
                    str += 'd';
                });

            setTimeout(() => {
                str.should.equal('c');
                done();
            }, 30);
        });
    });
});
