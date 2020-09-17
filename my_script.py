from flask import Flask
app = Flask(__name__)
import pymongo
from flask import jsonify
import random 
import string
import json

app.config['JSONIFY_PRETTYPRINT_REGULAR'] = True
taskCount = 100

def generateRandomName(length):
    letters = string.ascii_letters
    result = "".join(random.choice(letters) for i in range(length))

    return result

# myclient = pymongo.MongoClient("mongodb://host.docker.internal:27017/")
myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["master-slave"]
taskTable = mydb["taskIdentity"]
taskTable.drop() # rebuild the table

for i in range(taskCount):
    taskEntry = { "taskname": "task_"+str(i), "sleeptime": random.randint(10,60), "state": "created", "host": None }
    taskTable.insert_one(taskEntry)

@app.route("/")
def hello():
    cursor = taskTable.find()
    ret = [{"tableName":taskTable.name}]
    for x in cursor:
        print(x)
        ret.append({
            "taskname":x["taskname"],
            "sleeptime":x["sleeptime"],
            "state":x["state"],
            "host":x["host"]})
    return jsonify(ret)

@app.route("/insert")
def insert():
    taskTable.insert_one({"string": "testString"})
    return "success"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int("6330"), debug=False)
