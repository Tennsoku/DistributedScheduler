const MongoDB = require('mongodb');
const io = require('socket.io');
const assert = require('assert');
const Mutex = require('./mutex.js');

const DB_HOST = 'host.docker.internal';
// const DB_HOST = '127.0.0.1';
const DB_PORT = '27017';
const DB_URI = `mongodb://${DB_HOST}:${DB_PORT}/`;

const PORT = 5740;
const EXPECTED_CLIENT_NUM = 3;

const cacheMutex = new Mutex();
var clientList = {};
var taskCache = [];

const server = new io({
    serveClient: false,
    pingInterval: 5000,
    pingTimeout: 2500,
    cookie: false
});

server.on('connect', socket => {
    console.log(createTimeStamp() + '\x1b[32mClient\x1b[0m ' + socket.id + ' \x1b[32mConnection\x1b[0m -> A new client.');
    assert.ok(!(socket.id in clientList), 'data exists in clientList');
    clientList[socket.id] = {taskname: '', status: 'FREE'};

    socket.on('disconnet', reason => {
        console.log(createTimeStamp() + '\x1b[31mClient\x1b[0m ' + socket.id + ' \x1b[41mDisconnection\x1b[0m -> ' + reason);

        // delete clientList[socket.id];
    });

    socket.on('error', error => {
        console.log(createTimeStamp() + '\x1b[31mClient\x1b[0m ' + socket.id + ' \x1b[41mError\x1b[0m -> '+ error);
    });

    socket.on('disconnecting', reason => {
        console.log(createTimeStamp() + '\x1b[31mClient\x1b[0m ' + socket.id + ' \x1b[41mDisconnecting\x1b[0m -> ' + reason);

        // if (!(reason === "transport close" || reason === "client namespace disconnect")) return;

        if(clientList[socket.id].status === "BUSY") {
            console.log(createTimeStamp() + '\x1b[31mClient\x1b[0m ' + socket.id + ' \x1b[41mDisconnecting\x1b[0m -> Task ' + clientList[socket.id].taskname + ' is killed.');
            const DB_client = new MongoDB.MongoClient(DB_URI, {useUnifiedTopology: true});
            DB_client.connect()
                .then(async client => {
                    const taskTable = client.db("master-slave").collection("taskIdentity");
                    const filter = { host: socket.id, state: 'running' };
                    const updateDoc = {
                        $set: {
                            state: 'killed', 
                        }
                    };
                    const res = await taskTable.updateOne(filter, updateDoc, {});
                    assert.strictEqual(res.matchedCount, 1, 'matchedCount assertion failed');
                    assert.strictEqual(res.modifiedCount, 1, 'modifiedCount assertion failed');

                    // const killedTask = await taskTable.findOne({host: socket.id});
                    // console.log(killedTask);
                    // taskCache.push(killedTask);

                    await client.close();
                })
                .catch(err => console.log(createTimeStamp() + '\x1b[31mDB Error\x1b[0m -> '+ socket.id + ': ' + err.message + ' On \'disconnecting\' listener.'));
        }

        delete clientList[socket.id];
        socket.removeAllListeners(['disconnecting']);
        socket.disconnect();
    });

    socket.on('status', data => {
        assert.ok(data.id in clientList, 'data not in clientList');
        console.log(createTimeStamp() + '\x1b[32mClient\x1b[0m ' + socket.id + ' \x1b[32mStatus Update\x1b[0m -> ' + JSON.stringify(data));

        clientList[data.id].status = data.status;
        clientList[data.id].taskname = data.taskname;

        if (data.status !== 'BUSY') assignTask(socket);
    });

    // socket.on('reconnecting', data => {
    //     console.log(createTimeStamp() + '\x1b[32mClient\x1b[0m ' + socket.id + ' \x1b[32mReconnection\x1b[0m -> ' + JSON.stringify(data));

    //     if (data.status === 'FREE' && data.taskname === '') return; // This is a new client

    //     clientList[socket.id].status = data.status;
    //     clientList[socket.id].taskname = data.taskname;

    //     const DB_client = new MongoDB.MongoClient(DB_URI, {useUnifiedTopology: true});
    //     DB_client.connect()
    //         .then(async client => {
    //             const taskTable = client.db("master-slave").collection("taskIdentity");
    //             const filter = { taskname: taskname, state: 'killed' };
    //             const updateDoc = {
    //                 $set: {
    //                     state: (data.status === 'BUSY') ? 'running' : 'success', // No matter FREE or FINISHED, if it has taskname, then the task should be completed.
    //                     host: socket.id
    //                 }
    //             };
    //             const res = await taskTable.updateOne(filter, updateDoc, {});
    //             assert.strictEqual(res.matchedCount, 1, 'matchedCount assertion failed for a ' +data.status+' report.');
    //             assert.strictEqual(res.modifiedCount, 1, 'modifiedCount assertion failed for a ' +data.status+' report.');

    //             await client.close();
    //         })
    //         .catch(err => console.log(createTimeStamp() + '\x1b[31mDB Error\x1b[0m -> ' + err.message + ' On \'reconnecting\' listener.'));

    //     // assert.ok(data.id in clientList);
    // });

    socket.on('report', data => {
        console.log(createTimeStamp() + '\x1b[32mClient\x1b[0m ' + socket.id + ' \x1b[32mReport Task\x1b[0m -> ' + data.taskname + ': ' + data.status);
        
        const DB_client = new MongoDB.MongoClient(DB_URI, {useUnifiedTopology: true});
        DB_client.connect()
            .then(async client => {
                const taskTable = client.db("master-slave").collection("taskIdentity");
                // const slaveTable = client.db("slaveIdentity").collection("slave");
                const filter = { taskname: data.taskname };
                const updateDoc = {
                    $set: {
                        state: data.status,
                        host: socket.id
                    }
                };
                const res = await taskTable.updateOne(filter, updateDoc, {});
                assert.strictEqual(res.matchedCount, 1, 'matchedCount assertion failed for updating a ' +data.status+' report.');
                /**
                 * Due to socket.io, socket will finish the event loop after reconnection,
                 * thus a sucess report may be submitted twice and cause an assertion error.
                 * It's fine to ignore the error info under such cases at this moment. */ 
                assert.strictEqual(res.modifiedCount, 1, 'modifiedCount assertion failed for updating a ' +data.status+' report. (Tolerable. See comments.)');

                // res = await slaveTable.updateOne(filter, updateDoc, {});
                // socket.emit('ack');
                // assert.strictEqual(res.matchedCount, 1);
                // assert.strictEqual(res.modifiedCount, 1);

                await client.close();
            })
            .then(() => {
                if (data.status !== 'success') return; // this is only a report for reconnections

                socket.emit('ack', data.taskname);
                if (clientList[socket.id].taskname == data.taskname) {  // resolve the old task. If not the same name, it's a new assigned task before this event.
                    clientList[socket.id].status = 'FREE';
                    clientList[socket.id].taskname = '';
                } 
                // assignTask(socket);   // No need for now. May have race on ack event.
            })
            .catch(err => console.log(createTimeStamp() + '\x1b[31mDB Error\x1b[0m -> ' + err.message + ' On \'report\' listener.'));
    });

    socket.on('reject', (data, err) => {
        console.log(createTimeStamp() + '\x1b[31mClient\x1b[0m ' + socket.id + ' \x1b[31mReject Task\x1b[0m -> ' + data.taskname + ': ' + err.message);

        const DB_client = new MongoDB.MongoClient(DB_URI, {useUnifiedTopology: true});
        DB_client.connect()
            .then(async client => {
                const taskTable = client.db("master-slave").collection("taskIdentity");
                const filter = { host: socket.id, state: 'running' };
                const updateDoc = {
                    $set: {
                        state: 'created',
                        host: null 
                    }
                };
                const res = await taskTable.updateOne(filter, updateDoc, {});
                assert.strictEqual(res.matchedCount, 1, 'matchedCount assertion failed when updating rejected task.');
                assert.strictEqual(res.modifiedCount, 1, 'modifiedCount assertion failed when updating rejected task.');

                await client.close();
            })
            .catch(err => console.log(createTimeStamp() + '\x1b[31mDB Error\x1b[0m -> ' + err + ' On \'reject\' listener.'));
    });

});

function setup() {
    const DB_client = new MongoDB.MongoClient(DB_URI, {useUnifiedTopology: true});
    return DB_client.connect()
        .then(async client => {

            const taskTable = client.db("master-slave").collection("taskIdentity");
            const taskCursor = taskTable.find({"$and" : [
                {"state": {"$ne": "running"}},
                {"state": {"$ne": "success"}}
            ]});

            for await (const task of taskCursor) {
                taskCache.push(task);
                if (taskCache.length >= EXPECTED_CLIENT_NUM) break;
            }

            // while (taskCursor.hasNext()) {
            //     taskCache.push(await taskCursor.next());
            //     if (taskCache.length >= EXPECTED_CLIENT_NUM) break;
            // }

            const filter = { state: 'running' };
            const updateDoc = {
                $set: {
                    state: 'killed'
                }
            };
            const res = await taskTable.updateMany(filter, updateDoc, {});

            if (res.matchedCount) 
                console.log(createTimeStamp() + '\x1b[33mSetup Warning\x1b[0m -> Master may have exited unexpectedly in last run. ' 
                    + res.matchedCount 
                    + ' task(s) have running state in DB.');

            // console.log(taskCache);

            await client.close();
        })
        .then(async () => {
            server.listen(PORT);
            console.log(createTimeStamp() + '\x1b[32mServer Setup\x1b[0m -> Now listening to port '+PORT);
            // Sleep for consistency concerns ?
            // await a full reconnectionDelay for clients when master is reboot.
            await sleep(5000);  // TODO: Import from config file

            setInterval(() => {
                for (var client in clientList) {
                    server.to(client).emit('check');
                }
            }, 8000);
            console.log(createTimeStamp() + '\x1b[32mServer Setup\x1b[0m -> Setup successfully.');
        })
        .catch(err => {
            console.log(createTimeStamp() + '\x1b[31mSetup Error\x1b[0m -> ' + err.message );
            throw err;
        });
}

function assignTask(socket) {
    const DB_client = new MongoDB.MongoClient(DB_URI, {useUnifiedTopology: true});
    return DB_client.connect()
        .then(async client => {
            const taskTable = client.db("master-slave").collection("taskIdentity");
            await cacheMutex.acquire();
            const existed = taskCache.reduce((list, obj) => {
                list.push(obj._id);
                return list;
            },[]);

            var task = taskCache.shift(); // may fail due to empty cache list

            // refill cache 
            const taskCursor = taskTable.find({"$and" : [
                {"state": {"$ne": "running"}},
                {"state": {"$ne": "success"}},
                {"_id" : {"$nin": existed}}
            ]});

            for await (const doc of taskCursor) {
                taskCache.push(doc);
                if (taskCache.length >= EXPECTED_CLIENT_NUM) break;
            }

            // while (taskCursor.hasNext()) {
            //     taskCache.push(await taskCursor.next());
            //     if (taskCache.length >= EXPECTED_CLIENT_NUM) break;
            // }
            
            if (!taskCache.length && !task) {
                console.log(createTimeStamp() + '\x1b[45mFailed to assign Task\x1b[0m to Client: '+ socket.id + ' -> DB ran out of task!');

                await client.close();
                cacheMutex.release();

                return;
            } 

            // console.log("taskCache refilled: ");
            // console.log(taskCache.reduce((list, obj) => {
            //     list.push({taskname: obj.taskname, state: obj.state, sleeptime: obj.sleeptime});
            //     return list;},[]));

            if (!task) task = taskCache.shift();

            cacheMutex.release();

            // Assign event
            socket.emit('assign', {taskname: task["taskname"], sleepTime: task["sleeptime"]});

            const filter = { _id: task["_id"] };
            const updateDoc = {
                $set: {
                    state: 'running',
                    host: socket.id
                }
            };
            const res = await taskTable.updateOne(filter, updateDoc, {});
            assert.strictEqual(res.matchedCount, 1, 'matchedCount assertion failed when updating running task.');
            assert.strictEqual(res.modifiedCount, 1, 'modifiedCount assertion failed when updating running task.');

            clientList[socket.id].status = "BUSY";
            clientList[socket.id].taskname = task["taskname"];

            await client.close();
            console.log(createTimeStamp() + '\x1b[32m\x1b[4mAssign\x1b[0m ' + task["taskname"] + ' to \x1b[32mClient\x1b[0m ' + socket.id);
        })
        .catch(err => {
            console.log(createTimeStamp() + '\x1b[31mDB Error\x1b[0m -> ' + err.message + ' In \'assignTask\' func.');
        });
}

function sleep(ms) {
    return new Promise((resolve, reject) => setTimeout(resolve, ms));
}

function createTimeStamp() {
    var current = new Date();
    return '[' + new Intl.DateTimeFormat('en-CA', {year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false, timeZone: 'Canada/Eastern'}).format(current) + '] ';
}

// -------- __main__ ----------

setup();


