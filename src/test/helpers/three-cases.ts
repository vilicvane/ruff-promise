import { Promise } from '../../';

export type TestDoneHandler = (error?: string) => void;
export type Test<T> = (promise: Promise<T>, done: TestDoneHandler) => void;

function noop() { }

export function testFulfilled<T>(value: T, test: Test<T>): void {
    it('already-fulfilled', done => {
        test(Promise.resolve(value), done);
    });

    it('immediately-fulfilled', done => {
        var promise = new Promise<T>(noop);
        test(promise, done);
        (<any>promise)._resolve(value);
    });

    it('eventually-fulfilled', done => {
        var promise = new Promise<T>(noop);
        test(promise, done);
        setTimeout(() => {
            (<any>promise)._resolve(value);
        }, 10);
    });
}

export function testRejected<T>(reason: any, test: Test<T>): void {
    it('already-rejected', done => {
        test(Promise.reject<T>(reason), done);
    });

    it('immediately-rejected', done => {
        var promise = new Promise<T>(noop);
        test(promise, done);
        (<any>promise)._reject(reason);
    });

    it('eventually-rejected', done => {
        var promise = new Promise<T>(noop);
        test(promise, done);
        setTimeout(() => {
            (<any>promise)._reject(reason);
        }, 10);
    });
};
