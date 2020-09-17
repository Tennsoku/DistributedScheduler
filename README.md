- DB Entries:
```
(DB)                master-slave
                         |
(Collection)        taskIdentity
                         |
                    ------------
(primary key)   taskname:       String
                sleeptime:      int
                state:          'created'/'killed'/'running'/'success'
                host:           String
```

- Setup mongo image:
```
sudo docker pull mongo
```

- Setup mongo container:
```
sudo docker run -d -it -p 27017:27017 -v {dockerFileRoute}:{DBFileRoute} --name mongodb -d mongo
```

- To generate 100 random tasks:
```
pip install Flask
pip install pymongo
python3 my_script.py
```
An API endpoint is also included in the script. 
http://localhost:6330/ Will print all items under master-slave/taskIdentity collection.

- To build master docker image:
Go to directory and run:
```
./build
```

- To run/stop master docker container:
```
./start
./stop [containerID]
```

- To build slave docker image:
```
./build [port]
```
--port: Assign PORT for current image. Multiple slave containers need multiple available port.

- To run/stop slave docker container:
```
./start [port]
./stop [containerID]
```

- To run master/slave on localhost:
Uncomment the localhost DB_HOST/MS_HOST in master.js/slave.js and comment out docker host.
Please run 
```
npm install
```
before 
```
node master
node slave
```
