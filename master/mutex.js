const { EventEmitter } = require('events');

class Mutex {
    constructor() {
        this.__locked__ = false;
        this.__ee__ = new EventEmitter();
    }

    acquire() {
        return new Promise( resolve => {
                if(!this.__locked__) {
                    this.__locked__ = true;
                    return resolve();
                }

                const tryAquire = () => {
                    if(!this.__locked__) {
                        this.__locked__ = true;
                        this.__ee__.removeListener('release', tryAquire);
                        return resolve();
                    }
                };
                this.__ee__.on('release', tryAquire);
            }
        );
    }

    release() {
        this.__locked__ = false;
        setImmediate(() => this.__ee__.emit('release'));
    }
}

module.exports = Mutex;