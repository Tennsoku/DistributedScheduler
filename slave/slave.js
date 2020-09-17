const io = require('socket.io-client');
const assert = require('assert');
const MS_PORT = 5740;
// const MS_HOST = 'http://127.0.0.1';
const MS_HOST = 'http://host.docker.internal';

// Global
var taskname = '';
var status = "FREE"; // FREE, BUSY, FINISHED
var id; // VOID when first connect

// Proxy to Master
const proxy = io(`${MS_HOST}:${MS_PORT}`, {
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity,
    randomizationFactor: 0.2
});

proxy.on('connect', () => {
    console.log(createTimeStamp() + '\x1b[32mProxy Connect\x1b[0m -> Master successfully.');
    // if status is not default, report to master.
    if (status !== "FREE")
        proxy.emit('report', {
            taskname: taskname,
            status: (status === "BUSY") ? 'running': 'success',
            previous_id: id
        });
    id = proxy.id;
});

proxy.on('connction_error', (error) => {
    console.log(createTimeStamp() + '\x1b[31mProxy Error\x1b[0m -> Master connection met an error. Error Code: '+error.message);
});

proxy.on('disconnect', () => {
    console.log(createTimeStamp() + '\x1b[31mProxy Error\x1b[0m -> Master connection has losted.');
});

proxy.on('reconnect_attempt', () => {
    console.log(createTimeStamp() + 'Reconnecting Master...');
});

proxy.on('reconnect', () => {
    console.log(createTimeStamp() + '\x1b[32mProxy Reconnect\x1b[0m -> Master.');
});

proxy.on('assign', (data) => {
    console.log(createTimeStamp() + '\x1b[32mProxy Received Data\x1b[0m: New task: ' + JSON.stringify(data));
    runTask(data.taskname, data.sleepTime).catch(err => {
        console.log(createTimeStamp() + 'Reject Task: ' + err);
        proxy.emit('reject', data, err);
        return;
    });
});

proxy.on('check', () => {
    proxy.emit('status', {
        taskname: taskname,
        status: status,
        id: id
    });
})

proxy.on('ack', taskname_ => {
    if (taskname === taskname_) {
        assert.strictEqual(status, 'FINISHED');
        taskname = '';
        status = 'FREE';
    } else assert.strictEqual(status, 'BUSY');
})

function sleep(ms) {
    return new Promise((resolve, reject) => setTimeout(resolve, ms));
}

function runTask(taskname_, sleepTime_) {
    return new Promise((resolve, reject) => {
        if (status === "BUSY") reject("There's a task on going.");
        status = "BUSY";
        taskname = taskname_;
        sleep(sleepTime_*1000).then(() => {
            status = "FINISHED";
            proxy.emit('report', {taskname: taskname_, status: 'success'});
            console.log(createTimeStamp() + '\x1b[32mProxy Finished Task\x1b[0m: ' + taskname_ + ' successfully.');
            resolve("Task success.");
        });
    })
}

function createTimeStamp() {
    var current = new Date();
    return '[' + new Intl.DateTimeFormat('en-CA', {year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false, timeZone: 'Canada/Eastern'}).format(current) + '] ';
}