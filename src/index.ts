/**
 * ThenFail v0.4
 * Just another Promises/A+ Library
 *
 * https://github.com/vilic/thenfail
 *
 * MIT License
 */

/////////////
// Promise //
/////////////

export interface PromiseLike<T> {
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @return A Promise for the completion of which ever callback is executed.
     */
    then<TResult>(onfulfilled?: (value: T) => TResult | PromiseLike<TResult>, onrejected?: (reason: any) => TResult | PromiseLike<TResult>): PromiseLike<TResult>;
    then<TResult>(onfulfilled?: (value: T) => TResult | PromiseLike<TResult>, onrejected?: (reason: any) => void): PromiseLike<TResult>;
}

export type Resolvable<T> = PromiseLike<T> | T;

export type Resolver<T> = (
    resolve: (value?: Resolvable<T>) => void,
    reject: (reason: any) => void
) => void;

export type OnFulfilledHandler<T, TResult> = (value: T) => Resolvable<TResult>;

export type OnRejectedHandler<TResult> = (reason: any) => Resolvable<TResult>;

type OnAnyHandler<TResult> = (valueOrReason: any) => Resolvable<TResult>;

/**
 * Possible states of a promise.
 */
const enum State {
    pending,
    fulfilled,
    rejected
}

/**
 * ThenFail promise options.
 */
export let options = {
    disableUnrelayedRejectionWarning: false,
    logger: {
        log: console.log,
        warn: console.warn,
        error: console.error
    }
};

function noop() { }

const setImmediate = global.setImmediate || setTimeout;

// The core abstraction of this implementation is to imagine the behavior of promises
// as relay runners.
//  1. Grab the baton state (and value/reason).
//  2. Run and get its own state.
//  3. Relay the new state to next runners.

export class Promise<T> implements PromiseLike<T> {
    /** Current state of this promise. */
    private _state = State.pending;

    /** Indicates whether this promise has been relayed or notified as unrelayed. */
    private _handled = false;

    /** The fulfilled value or rejected reason associated with this promise. */
    private _valueOrReason: any;

    /**
     * Next promise in the chain.
     * Avoid using an array if not necessary due to performance issue,
     * the same way applies to `_handledPromise(s)`.
     * If `_chainedPromise` is not undefined, `_chainedPromises` must be undefined.
     * Vice versa.
     */
    private _chainedPromise: Promise<any>;

    /** Next promises in the chain. */
    private _chainedPromises: Promise<any>[];

    /**
     * Promise that will share the same state (and value/reason).
     *
     * Example:
     *
     * ```ts
     * let promiseA = Promise.then(() => {
     *     let promiseB = Promise.then(() => ...);
     *     return promiseB;
     * });
     * ```
     *
     * The state of `promiseB` will determine the state of `promiseA`.
     * And `promiseA` will then be in here.
     */
    private _handledPromise: Promise<T>;
    /** Promises that will share the same state (and value/reason). */
    private _handledPromises: Promise<T>[];

    private _onPreviousFulfilled: OnFulfilledHandler<any, T>;
    private _onPreviousRejected: OnRejectedHandler<T>;

    /**
     * Promise constructor.
     */
    constructor(resolver: Resolver<T>) {
        try {
            resolver(
                resolvable => this._resolve(resolvable),
                reason => this._reject(reason)
            );
        } catch (error) {
            this._reject(error);
        }
    }

    /**
     * Get the state from previous promise in chain.
     */
    private _grab(previousState: State, previousValueOrReason?: any): void {
        if (this._state !== State.pending) {
            return;
        }

        let handler: OnAnyHandler<Resolvable<T>>;

        if (previousState === State.fulfilled) {
            handler = this._onPreviousFulfilled;
        } else if (previousState === State.rejected) {
            handler = this._onPreviousRejected;
        }

        if (handler) {
            this._run(handler, previousValueOrReason);
        } else {
            this._relay(previousState, previousValueOrReason);
        }
    }

    /**
     * Invoke `onfulfilled` or `onrejected` handlers.
     */
    private _run(handler: OnAnyHandler<any>, previousValueOrReason: any): void {
        setImmediate(() => {
            let resolvable: Resolvable<T>;

            try {
                resolvable = handler(previousValueOrReason);
            } catch (error) {
                this._relay(State.rejected, error);
                return;
            }

            this._unpack(resolvable, (state, valueOrReason) => {
                this._relay(state, valueOrReason);
            });
        });
    }

    /**
     * The resolve process defined in Promises/A+ specifications.
     */
    private _unpack(value: Resolvable<T>, callback: (state: State, valueOrReason: any) => void): void {
        if (this === value) {
            callback(State.rejected, new TypeError('The promise should not return itself'));
        } else if (value instanceof Promise) {
            if (value._state === State.pending) {
                if (value._handledPromise) {
                    value._handledPromises = [value._handledPromise, this];
                    value._handledPromise = undefined;
                } else if (value._handledPromises) {
                    value._handledPromises.push(this);
                } else {
                    value._handledPromise = this;
                }
            } else {
                callback(value._state, value._valueOrReason);
                value._handled = true;
            }
        } else if (value) {
            switch (typeof value) {
                case 'object':
                case 'function':
                    try {
                        let then = (value as PromiseLike<any>).then;

                        if (typeof then === 'function') {
                            then.call(
                                value,
                                (value: any) => {
                                    if (callback) {
                                        this._unpack(value, callback);
                                        callback = undefined;
                                    }
                                },
                                (reason: any) => {
                                    if (callback) {
                                        callback(State.rejected, reason);
                                        callback = undefined;
                                    }
                                }
                            );

                            break;
                        }
                    } catch (e) {
                        if (callback) {
                            callback(State.rejected, e);
                            callback = undefined;
                        }

                        break;
                    }
                default:
                    callback(State.fulfilled, value);
                    break;
            }
        } else {
            callback(State.fulfilled, value);
        }
    }

    /**
     * Set the state of current promise and relay it to next promises.
     */
    private _relay(state: State, valueOrReason?: any): void {
        if (this._state !== State.pending) {
            return;
        }

        this._state = state;
        this._valueOrReason = valueOrReason;

        if (this._chainedPromise) {
            this._chainedPromise._grab(state, valueOrReason);
        } else if (this._chainedPromises) {
            for (let promise of this._chainedPromises) {
                promise._grab(state, valueOrReason);
            }
        }

        if (this._handledPromise) {
            this._handledPromise._relay(state, valueOrReason);
        } else if (this._handledPromises) {
            for (let promise of this._handledPromises) {
                promise._relay(state, valueOrReason);
            }
        }

        setImmediate(() => {
            if (state === State.rejected && !this._handled) {
                this._handled = true;

                let relayed = !!(this._chainedPromise || this._chainedPromises || this._handledPromise || this._handledPromises);

                if (!relayed && !options.disableUnrelayedRejectionWarning) {
                    let error = valueOrReason && (valueOrReason.stack || valueOrReason.message) || valueOrReason;
                    options.logger.warn(`An unrelayed rejection happens:\n${error}`);
                }
            }

            this._relax();
        });
    }

    /**
     * Set handlers to undefined.
     */
    private _relax(): void {
        if (this._onPreviousFulfilled) {
            this._onPreviousFulfilled = undefined;
        }

        if (this._onPreviousRejected) {
            this._onPreviousRejected = undefined;
        }

        if (this._chainedPromise) {
            this._chainedPromise = undefined;
        } else {
            this._chainedPromises = undefined;
        }

        if (this._handledPromise) {
            this._handledPromise = undefined;
        } else {
            this._handledPromises = undefined;
        }
    }

    /**
     * Resolve the promise with a value or thenable.
     * @param resolvable The value to fulfill or thenable to resolve.
     */
    private _resolve(resolvable?: Resolvable<T>): void {
        this._unpack(resolvable, (state, valueOrReason) => this._grab(state, valueOrReason));
    }

    /**
     * Reject this promise with a reason.
     * @param reason Rejection reason.
     */
    private _reject(reason: any): void {
        this._grab(State.rejected, reason);
    }

    /**
     * The `then` method that follows
     * [Promises/A+ specifications](https://promisesaplus.com).
     * @param onfulfilled Fulfillment handler.
     * @param onrejected Rejection handler.
     * @return Created promise.
     */
    then<TResult>(onfulfilled: OnFulfilledHandler<T, TResult>, onrejected?: OnRejectedHandler<TResult>): Promise<TResult> {
        let promise = new Promise<TResult>(noop);

        if (typeof onfulfilled === 'function') {
            promise._onPreviousFulfilled = onfulfilled;
        }

        if (typeof onrejected === 'function') {
            promise._onPreviousRejected = onrejected;
        }

        if (this._state === State.pending) {
            if (this._chainedPromise) {
                this._chainedPromises = [this._chainedPromise, promise];
                this._chainedPromise = undefined;
            } else if (this._chainedPromises) {
                this._chainedPromises.push(promise);
            } else {
                this._chainedPromise = promise;
            }
        } else {
            if (!this._handled) {
                this._handled = true;
            }

            promise._grab(this._state, this._valueOrReason);
        }

        return promise;
    }

    /**
     * Like `promise.then(undefined, onrejected)` but can specify type of reason to catch.
     * @param onrejected Rejection handler.
     * @return Created promise.
     */
    catch(onrejected: OnRejectedHandler<T>): Promise<T>;
    /**
     * @param ReasonType Type of reasons to catch.
     * @param onrejected Rejection handler.
     * @return Created promise.
     */
    catch(ReasonType: Function, onrejected: OnRejectedHandler<T>): Promise<T>;
    catch(ReasonType: Function | OnRejectedHandler<T>, onrejected?: OnRejectedHandler<T>): Promise<T> {
        if (typeof onrejected === 'function') {
            return this.then<T>(undefined, reason => {
                if (reason instanceof ReasonType) {
                    return onrejected(reason);
                } else {
                    throw reason;
                }
            });
        } else {
            onrejected = ReasonType as OnRejectedHandler<T>;
            return this.then<T>(undefined, onrejected);
        }
    }

    /**
     * Resolve a value or thenable as a promise.
     * @return The value itself if it's a ThenFail Promise,
     *     otherwise the created promise.
     */
    static resolve(): Promise<void>;
    /**
     * @return The value itself if it's a ThenFail Promise,
     *     otherwise the created promise.
     */
    static resolve<T>(resolvable: Resolvable<T>): Promise<T>;
    static resolve<T>(resolvable?: Resolvable<T>): Promise<T> {
        if (resolvable instanceof Promise) {
            return resolvable;
        } else {
            let promise = new Promise<T>(noop);
            promise._resolve(resolvable);
            return promise;
        }
    }

    /**
     * Create a promise rejected by specified reason.
     * @param reason Rejection reason.
     * @return Created promise.
     */
    static reject(reason: any): Promise<void>;
    /**
     * @param reason Rejection reason.
     * @return Created promise.
     */
    static reject<T>(reason: any): Promise<T>;
    static reject<T>(reason: any): Promise<T> {
        let promise = new Promise<T>(noop);
        promise._reject(reason);
        return promise;
    }

    /**
     * Create a promise that will be fulfilled:
     *
     *   1. when all values are fulfilled.
     *   2. with the value of an array of fulfilled values.
     *
     * And will be rejected:
     *
     *   1. if any of the values is rejected.
     *   2. with the reason of the first rejection as its reason.
     *   3. once the first rejection happens.
     *
     * @return Created promise.
     */
    static all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: [Resolvable<T1>, Resolvable<T2>, Resolvable<T3>, Resolvable<T4>, Resolvable<T5>, Resolvable<T6>, Resolvable<T7>, Resolvable<T8>, Resolvable<T9>, Resolvable<T10>]): Promise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
    static all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: [Resolvable<T1>, Resolvable<T2>, Resolvable<T3>, Resolvable<T4>, Resolvable<T5>, Resolvable<T6>, Resolvable<T7>, Resolvable<T8>, Resolvable<T9>]): Promise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
    static all<T1, T2, T3, T4, T5, T6, T7, T8>(values: [Resolvable<T1>, Resolvable<T2>, Resolvable<T3>, Resolvable<T4>, Resolvable<T5>, Resolvable<T6>, Resolvable<T7>, Resolvable<T8>]): Promise<[T1, T2, T3, T4, T5, T6, T7, T8]>;
    static all<T1, T2, T3, T4, T5, T6, T7>(values: [Resolvable<T1>, Resolvable<T2>, Resolvable<T3>, Resolvable<T4>, Resolvable<T5>, Resolvable<T6>, Resolvable<T7>]): Promise<[T1, T2, T3, T4, T5, T6, T7]>;
    static all<T1, T2, T3, T4, T5, T6>(values: [Resolvable<T1>, Resolvable<T2>, Resolvable<T3>, Resolvable<T4>, Resolvable<T5>, Resolvable<T6>]): Promise<[T1, T2, T3, T4, T5, T6]>;
    static all<T1, T2, T3, T4, T5>(values: [Resolvable<T1>, Resolvable<T2>, Resolvable<T3>, Resolvable<T4>, Resolvable<T5>]): Promise<[T1, T2, T3, T4, T5]>;
    static all<T1, T2, T3, T4>(values: [Resolvable<T1>, Resolvable<T2>, Resolvable<T3>, Resolvable<T4>]): Promise<[T1, T2, T3, T4]>;
    static all<T1, T2, T3>(values: [Resolvable<T1>, Resolvable<T2>, Resolvable<T3>]): Promise<[T1, T2, T3]>;
    static all<T1, T2>(values: [Resolvable<T1>, Resolvable<T2>]): Promise<[T1, T2]>;
    static all<T1>(values: [Resolvable<T1>]): Promise<[T1]>;
    /**
     * @param resolvables Resolvables involved.
     * @return Created promise.
     */
    static all<T>(resolvables: Resolvable<T>[]): Promise<T[]>;
    static all<T>(resolvables: Resolvable<T>[]): Promise<any> {
        if (!resolvables.length) {
            return Promise.resolve([]);
        }

        let resultsPromise = new Promise<T[]>(noop);

        let results: T[] = [];
        let remaining = resolvables.length;

        let rejected = false;

        resolvables.forEach((resolvable, index) => {
            Promise
                .resolve(resolvable)
                .then(result => {
                    if (rejected) {
                        return;
                    }

                    results[index] = result;

                    if (--remaining === 0) {
                        resultsPromise._resolve(results);
                    }
                }, reason => {
                    if (rejected) {
                        return;
                    }

                    rejected = true;
                    resultsPromise._reject(reason);
                    results = undefined;
                });
        });

        return resultsPromise;
    }

    /**
     * Create a promise that is settled the same way as the first passed promise to settle.
     * It resolves or rejects, whichever happens first.
     * @param resolvables Promises or values to race.
     * @return Created promise.
     */
    static race<TResult>(resolvables: Resolvable<TResult>[]): Promise<TResult> {
        let promise = new Promise<TResult>(noop);

        for (let resolvable of resolvables) {
            promise._resolve(resolvable);
        }

        return promise;
    }
}

export default Promise;

if (typeof global.Promise === 'undefined') {
    global.Promise = Promise;
}
